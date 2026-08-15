import { UOM_REGISTRY } from '../uom/uomRegistry.js';

/**
 * UomRepository domain persistence abstraction.
 *
 * Manages unit-of-measure definitions and pre-seeding from canonical UOM registry.
 * Supports constructor dependency injection (DataGateway, OfflineStore, OfflineJournal, UomRegistry)
 * while remaining fully backward-compatible with legacy global platform instances.
 */
export class UomRepository {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.uomRegistry = deps.uomRegistry || (typeof UOM_REGISTRY !== 'undefined' ? UOM_REGISTRY : UOM_REGISTRY);
  }

  getAll(tenantId = null) {
    const registry = this.uomRegistry || (typeof UOM_REGISTRY !== 'undefined' ? UOM_REGISTRY : UOM_REGISTRY);
    const canonicalList = Object.values(registry || {}).map(u => ({
      id: 'uom-' + u.code.toLowerCase(),
      tenantId: tenantId || '',
      uomCode: u.code,
      uomName: u.name,
      uomFamily: u.family,
      isBaseUnit: !!u.isBase,
      conversionFactor: u.baseRatio || 1,
      icon: u.icon,
      status: 'ACTIVE'
    }));

    let list = [];
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      list = this.dataGateway.getCachedCollection('inventory_uoms', tenantId) || [];
      if (!list || list.length === 0) {
        canonicalList.forEach(cu => this.dataGateway.create('inventory_uoms', cu));
        return canonicalList;
      }
    } else {
      const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
      list = store ? store.getCollection('inventory_uoms', tenantId) || [] : [];
      if (!list || list.length === 0) {
        if (store) {
          store.setCollection('inventory_uoms', canonicalList);
        }
        return canonicalList;
      }
    }

    const existingCodes = new Set(list.map(u => u.uomCode || u.code));
    let updated = false;
    canonicalList.forEach(cu => {
      if (!existingCodes.has(cu.uomCode)) {
        if (this.dataGateway && typeof this.dataGateway.create === 'function') {
          this.dataGateway.create('inventory_uoms', cu);
        } else {
          list.push(cu);
          updated = true;
        }
      }
    });

    if (updated && !this.dataGateway) {
      const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
      if (store) {
        store.setCollection('inventory_uoms', list);
      }
    }

    return list;
  }

  getByCode(code, tenantId = null) {
    return this.getAll(tenantId).find(u => u.uomCode === code || u.code === code) || null;
  }

  getById(id, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('inventory_uoms', id, tenantId);
    }
    return this.getAll(tenantId).find(u => u.id === id || u.uomCode === id) || null;
  }

  create(uomData, session = null) {
    const tenantId = session ? session.tenantId : (uomData.tenantId || '');
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    let newUom = {
      id: 'uom-' + (uomData.uomCode ? uomData.uomCode.toLowerCase() : Math.random().toString(36).substring(2, 7)),
      tenantId,
      uomCode: uomData.uomCode || 'CUSTOM',
      uomName: uomData.uomName || 'Custom Unit',
      uomFamily: uomData.uomFamily || 'COUNT',
      isBaseUnit: !!uomData.isBaseUnit,
      conversionFactor: uomData.conversionFactor || 1,
      status: uomData.status || 'ACTIVE',
      ...uomData
    };

    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      this.dataGateway.create('inventory_uoms', newUom, session);
    } else {
      if (store) {
        store.appendItem('inventory_uoms', newUom);
      }
      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPLOAD_EVENT', tenantId, 'inventory_uoms', { commandType: 'CREATE_UOM', eventType: 'UomCreated', ...newUom }, session);
      }
    }

    return newUom;
  }

  initCanonicalUoms() {
    return this.getAll();
  }
}
