import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * StorageLocationRepository domain persistence abstraction.
 *
 * Manages hierarchical storage location trees, defaults pre-seeding, and validation.
 * Supports constructor dependency injection while remaining
 * fully backward-compatible with legacy global platform instances.
 */
export class StorageLocationRepository {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
  }

  getAll(tenantId = null) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('storage_locations', tenantId) || [] : [];
  }

  getByCode(locationCode, tenantId = null) {
    return this.getAll(tenantId).find(l => l.locationCode === locationCode) || null;
  }

  getById(id, tenantId = null) {
    return this.getAll(tenantId).find(l => l.id === id || l.locationCode === id) || null;
  }

  create(data, session) {
    const tenantId = session ? session.tenantId : (data.tenantId || '');
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    let parentPath = '';
    if (data.parentLocationCode) {
      const parent = this.getByCode(data.parentLocationCode, tenantId);
      if (parent) {
        parentPath = (parent.path || parent.locationCode) + ' / ';
      }
    }

    let newLoc = {
      id: 'loc-' + Math.random().toString(36).substring(2, 7),
      locationCode: data.locationCode || ('LOC-' + Math.floor(100 + Math.random() * 900)),
      locationName: data.locationName || 'Storage Area',
      shortName: data.shortName || '',
      locationType: data.locationType || 'Store',
      level: data.level || 'Store',
      parentLocationCode: data.parentLocationCode || '',
      path: parentPath + (data.shortName || data.locationCode || 'LOC'),
      status: data.status || 'ACTIVE',
      description: data.description || '',
      purposes: data.purposes || ['Raw Materials'],
      condition: data.condition || 'Ambient',
      tempMin: data.tempMin || null,
      tempMax: data.tempMax || null,
      permissions: data.permissions || { receive: true, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: true },
      responsibleWorkspace: data.responsibleWorkspace || 'inventory',
      responsibleManager: data.responsibleManager || 'Inventory Manager',
      restrictedAccess: !!data.restrictedAccess,
      foodStorage: data.foodStorage !== false,
      alcoholStorage: !!data.alcoholStorage,
      building: data.building || '',
      floor: data.floor || '',
      room: data.room || '',
      notes: data.notes || ''
    };

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      newLoc = this.entityMetadata.attachStandardMetadata(newLoc, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      newLoc = attachStandardMetadata(newLoc, tenantId, session);
    }

    if (store) {
      store.appendItem('storage_locations', newLoc);
    }

    if (journal && typeof journal.createSyncJob === 'function') {
      journal.createSyncJob('UPLOAD_EVENT', tenantId, 'storage_locations', { commandType: 'CREATE_STORAGE_LOCATION', eventType: 'StorageLocationCreated', ...newLoc }, session);
    } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'storage_locations', { commandType: 'CREATE_STORAGE_LOCATION', eventType: 'StorageLocationCreated', ...newLoc }, session);
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Created Storage Location "${newLoc.locationName}" (${newLoc.locationCode})`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return newLoc;
  }

  update(id, patch, session) {
    const tenantId = session ? session.tenantId : '';
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    const list = store ? (store.getCollection('storage_locations') || []) : [];
    const idx = list.findIndex(l => (l.id === id || l.locationCode === id) && (!tenantId || l.tenantId === tenantId));
    if (idx !== -1) {
      const updated = {
        ...list[idx],
        ...patch,
        modifiedBy: session ? session.employeeName : 'Admin',
        modifiedAt: new Date().toISOString(),
        version: (list[idx].version || 1) + 1
      };

      if (patch.parentLocationCode !== undefined) {
        let parentPath = '';
        if (patch.parentLocationCode) {
          const parent = list.find(l => l.locationCode === patch.parentLocationCode);
          if (parent) parentPath = (parent.path || parent.locationCode) + ' / ';
        }
        updated.path = parentPath + (updated.shortName || updated.locationCode);
      }

      list[idx] = updated;
      if (store) {
        store.setCollection('storage_locations', list);
      }

      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPDATE_LOCATION', tenantId, 'storage_locations', { id: updated.id, patch }, session);
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPDATE_LOCATION', tenantId, 'storage_locations', { id: updated.id, patch }, session);
      }

      const actor = session ? session.employeeName : 'Admin';
      const actionMsg = `Updated Storage Location "${updated.locationName}" (${updated.locationCode})`;
      if (this.auditLogger && typeof this.auditLogger.log === 'function') {
        this.auditLogger.log(actor, actionMsg, tenantId);
      } else if (typeof logAudit === 'function') {
        logAudit(actor, actionMsg, tenantId);
      }

      return updated;
    }
    return null;
  }

  archive(id, session) {
    const tenantId = session ? session.tenantId : '';
    const loc = this.getById(id, tenantId);
    if (!loc) return { success: false, error: 'Location not found.' };

    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const children = store ? (store.getCollection('storage_locations', tenantId) || []).filter(l => l.parentLocationCode === loc.locationCode && l.status !== 'ARCHIVED') : [];
    if (children.length > 0) {
      return {
        success: false,
        error: `❌ Cannot archive "${loc.locationName}". ${children.length} active child location(s) exist under it (${children.map(c => c.locationCode).join(', ')}). Reassign or archive child locations first.`
      };
    }

    const itemsWithStock = store ? (store.getCollection('inventory', tenantId) || []).filter(i => (i.defaultLocationId === loc.id || i.locationCode === loc.locationCode) && i.status !== 'ARCHIVED') : [];
    if (itemsWithStock.length > 0) {
      return {
        success: false,
        error: `❌ Cannot archive "${loc.locationName}". ${itemsWithStock.length} inventory item(s) are assigned to this location. Reassign stock items first.`
      };
    }

    this.update(loc.id, { status: 'ARCHIVED' }, session);

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Archived Storage Location "${loc.locationName}" (${loc.locationCode})`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return { success: true };
  }

  clearAll(session = null) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    if (store) {
      store.setCollection('storage_locations', []);
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = 'Cleared all storage locations from local storage';
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, session ? session.tenantId : null);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, session ? session.tenantId : null);
    }
  }

  initDefaultLocations(tenantId) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    const defaultList = [
      {
        id: 'loc-1-' + tenantId,
        tenantId,
        locationCode: 'LOC-MWH',
        locationName: 'Main Warehouse',
        shortName: 'MWH',
        locationType: 'Warehouse',
        level: 'Warehouse',
        parentLocationCode: '',
        path: 'MWH',
        status: 'ACTIVE',
        description: 'Central receiving warehouse for all raw materials & packaging.',
        purposes: ['Raw Materials', 'Packaging', 'Consumables'],
        condition: 'Ambient',
        tempMin: 18,
        tempMax: 30,
        permissions: { receive: true, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: true },
        responsibleWorkspace: 'inventory',
        responsibleManager: 'Inventory Manager',
        restrictedAccess: false,
        foodStorage: true,
        alcoholStorage: false,
        building: 'Main Restaurant',
        floor: 'Ground Floor',
        room: 'Back of House 01',
        notes: 'Central receiving bay.'
      },
      {
        id: 'loc-2-' + tenantId,
        tenantId,
        locationCode: 'LOC-DRY',
        locationName: 'Dry Store',
        shortName: 'DRY',
        locationType: 'Store',
        level: 'Store',
        parentLocationCode: 'LOC-MWH',
        path: 'MWH / DRY',
        status: 'ACTIVE',
        description: 'Dry food items, spices, pulses, rice & flour storage.',
        purposes: ['Raw Materials'],
        condition: 'Ambient',
        tempMin: 20,
        tempMax: 28,
        permissions: { receive: true, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: true },
        responsibleWorkspace: 'inventory',
        responsibleManager: 'Inventory Manager',
        restrictedAccess: false,
        foodStorage: true,
        alcoholStorage: false,
        notes: 'Keep elevated on pallets.'
      },
      {
        id: 'loc-3-' + tenantId,
        tenantId,
        locationCode: 'LOC-CHILL',
        locationName: 'Walk-in Chiller',
        shortName: 'CHILL',
        locationType: 'Chiller',
        level: 'Store',
        parentLocationCode: 'LOC-MWH',
        path: 'MWH / CHILL',
        status: 'ACTIVE',
        description: 'Cold storage for dairy, vegetables, poultry & meat.',
        purposes: ['Raw Materials', 'Semi-Finished'],
        condition: 'Chilled',
        tempMin: 0,
        tempMax: 5,
        permissions: { receive: true, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: true },
        responsibleWorkspace: 'inventory',
        responsibleManager: 'Inventory Manager',
        restrictedAccess: true,
        foodStorage: true,
        alcoholStorage: false,
        notes: 'Temperature log checked twice daily.'
      },
      {
        id: 'loc-4-' + tenantId,
        tenantId,
        locationCode: 'LOC-FREEZE',
        locationName: 'Deep Freezer',
        shortName: 'FREEZE',
        locationType: 'Freezer',
        level: 'Store',
        parentLocationCode: 'LOC-MWH',
        path: 'MWH / FREEZE',
        status: 'ACTIVE',
        description: 'Deep freezing for seafood, frozen meat, ice cream.',
        purposes: ['Raw Materials'],
        condition: 'Frozen',
        tempMin: -24,
        tempMax: -18,
        permissions: { receive: true, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: true },
        responsibleWorkspace: 'inventory',
        responsibleManager: 'Inventory Manager',
        restrictedAccess: true,
        foodStorage: true,
        alcoholStorage: false,
        notes: 'Commercial deep freezer.'
      },
      {
        id: 'loc-5-' + tenantId,
        tenantId,
        locationCode: 'LOC-KITCHEN',
        locationName: 'Kitchen Store',
        shortName: 'KITCHEN',
        locationType: 'Kitchen Store',
        level: 'Store',
        parentLocationCode: 'LOC-MWH',
        path: 'MWH / KITCHEN',
        status: 'ACTIVE',
        description: 'Day-store located inside main kitchen line.',
        purposes: ['Raw Materials', 'Semi-Finished'],
        condition: 'Ambient',
        tempMin: null,
        tempMax: null,
        permissions: { receive: false, transferIn: true, transferOut: true, issue: true, production: true, count: true, adjustment: false },
        responsibleWorkspace: 'kitchen',
        responsibleManager: 'Head Chef',
        restrictedAccess: false,
        foodStorage: true,
        alcoholStorage: false,
        notes: 'Daily line consumption store.'
      },
      {
        id: 'loc-6-' + tenantId,
        tenantId,
        locationCode: 'LOC-BAR',
        locationName: 'Bar Store',
        shortName: 'BAR',
        locationType: 'Bar Store',
        level: 'Store',
        parentLocationCode: 'LOC-MWH',
        path: 'MWH / BAR',
        status: 'ACTIVE',
        description: 'Liquor, wine, beer, beverage & cocktail mixer storage.',
        purposes: ['Beverages'],
        condition: 'Ambient',
        tempMin: null,
        tempMax: null,
        permissions: { receive: false, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: false },
        responsibleWorkspace: 'bar',
        responsibleManager: 'Bar Manager',
        restrictedAccess: true,
        foodStorage: false,
        alcoholStorage: true,
        notes: 'Access restricted to Bar Manager.'
      }
    ];

    defaultList.forEach(item => {
      if (store) {
        store.appendItem('storage_locations', item);
      }

      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPLOAD_EVENT', tenantId, 'storage_locations', { commandType: 'CREATE_STORAGE_LOCATION', eventType: 'StorageLocationCreated', ...item }, { employeeName: 'System Pre-seed', tenantId });
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'storage_locations', { commandType: 'CREATE_STORAGE_LOCATION', eventType: 'StorageLocationCreated', ...item }, { employeeName: 'System Pre-seed', tenantId });
      }
    });
    return defaultList;
  }
}
