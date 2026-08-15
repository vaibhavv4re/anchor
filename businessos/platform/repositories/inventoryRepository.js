import { PRODUCT_FAMILIES_REGISTRY } from '../inventory/productFamiliesRegistry.js';
import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * InventoryRepository domain persistence abstraction.
 *
 * Supports constructor dependency injection (DataGateway, OfflineStore, OfflineJournal, AuditLogger)
 * while remaining fully backward-compatible with legacy global platform instances.
 */
export class InventoryRepository {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
    this.categoryRepository = deps.categoryRepository || (typeof categoryRepository !== 'undefined' ? categoryRepository : null);
    this.productFamiliesRegistry = deps.productFamiliesRegistry || PRODUCT_FAMILIES_REGISTRY;
  }

  getAll(tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      return this.dataGateway.getCachedCollection('inventory', tenantId) || [];
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('inventory', tenantId) || [] : [];
  }

  getByCode(itemCode, tenantId = null) {
    return this.getAll(tenantId).find(i => i.itemCode === itemCode) || null;
  }

  getById(id, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('inventory', id, tenantId);
    }
    return this.getAll(tenantId).find(i => i.id === id || i.uuid === id || i.itemCode === id) || null;
  }

  create(itemData, session) {
    const tenantId = session ? session.tenantId : (itemData.tenantId || '');
    const catRepo = this.categoryRepository || (typeof categoryRepository !== 'undefined' ? categoryRepository : null);
    const registry = this.productFamiliesRegistry || PRODUCT_FAMILIES_REGISTRY;
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    // Auto-derive Product Family from Category
    let catObj = null;
    if (itemData.categoryCode && catRepo) {
      catObj = catRepo.getByCode(itemData.categoryCode, tenantId);
    }
    const productFamilyCode = catObj ? catObj.productFamilyCode : (itemData.productFamilyCode || 'FAM-PRODUCE');
    const productFamilyName = registry[productFamilyCode] ? registry[productFamilyCode].name : (itemData.productFamilyName || 'Fruits & Vegetables');
    const categoryName = catObj ? catObj.categoryName : (itemData.categoryName || itemData.categoryCode || 'General');

    let newItem = {
      uuid: 'uuid-' + Math.random().toString(36).substring(2, 9),
      itemCode: itemData.itemCode || ('RM' + Math.floor(1000 + Math.random() * 9000)),
      itemName: itemData.itemName || 'Untitled Item',
      itemType: itemData.itemType || 'Raw Material',
      categoryCode: itemData.categoryCode || 'CAT-VEG',
      categoryName,
      productFamilyCode,
      productFamilyName,
      status: itemData.status || 'ACTIVE',
      ...itemData
    };
    // Overwrite derived fields to ensure Product Family integrity
    newItem.productFamilyCode = productFamilyCode;
    newItem.productFamilyName = productFamilyName;

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      newItem = this.entityMetadata.attachStandardMetadata(newItem, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      newItem = attachStandardMetadata(newItem, tenantId, session);
    }

    // Delegate mutation via DataGateway if configured
    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      this.dataGateway.create('inventory', newItem, session);
    } else {
      // Fallback local persistence
      if (store) {
        store.appendItem('inventory', newItem);
      }

      const commandType = 'CREATE_INVENTORY_ITEM';
      const eventType = 'InventoryItemCreated';
      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPLOAD_EVENT', tenantId, 'inventory', { commandType, eventType, ...newItem }, session);
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'inventory', { commandType, eventType, ...newItem }, session);
      }
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Created Master Inventory Item "${newItem.itemName}" (${newItem.itemCode})`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return newItem;
  }

  update(id, patch, session) {
    const tenantId = session ? session.tenantId : '';
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const catRepo = this.categoryRepository || (typeof categoryRepository !== 'undefined' ? categoryRepository : null);
    const registry = this.productFamiliesRegistry || PRODUCT_FAMILIES_REGISTRY;
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    const existing = this.getById(id, tenantId);
    if (existing) {
      // Auto-derive Product Family if category is changed
      if (patch.categoryCode && catRepo) {
        const catObj = catRepo.getByCode(patch.categoryCode, tenantId);
        if (catObj) {
          patch.categoryName = catObj.categoryName;
          patch.productFamilyCode = catObj.productFamilyCode;
          patch.productFamilyName = registry[catObj.productFamilyCode] ? registry[catObj.productFamilyCode].name : catObj.productFamilyName;
        }
      }
      const updated = {
        ...existing,
        ...patch,
        modifiedBy: session ? session.employeeName : 'Admin',
        modifiedAt: new Date().toISOString(),
        version: (existing.version || 1) + 1
      };

      if (this.dataGateway && typeof this.dataGateway.update === 'function') {
        this.dataGateway.update('inventory', id, patch, session);
      } else {
        const list = store ? (store.getCollection('inventory') || []) : [];
        const idx = list.findIndex(i => (i.id === id || i.uuid === id || i.itemCode === id) && (!tenantId || i.tenantId === tenantId));
        if (idx !== -1) {
          list[idx] = updated;
          if (store) {
            store.setCollection('inventory', list);
          }
        }

        if (journal && typeof journal.createSyncJob === 'function') {
          journal.createSyncJob('UPDATE_INVENTORY_ITEM', tenantId, 'inventory', { id: updated.id || updated.uuid, patch }, session);
        } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
          offlineJournal.createSyncJob('UPDATE_INVENTORY_ITEM', tenantId, 'inventory', { id: updated.id || updated.uuid, patch }, session);
        }
      }

      const actor = session ? session.employeeName : 'Admin';
      const actionMsg = `Updated Master Inventory Item "${updated.itemName}" (${updated.itemCode})`;
      if (this.auditLogger && typeof this.auditLogger.log === 'function') {
        this.auditLogger.log(actor, actionMsg, tenantId);
      } else if (typeof logAudit === 'function') {
        logAudit(actor, actionMsg, tenantId);
      }

      return updated;
    }
    return null;
  }
}
