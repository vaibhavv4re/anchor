import { UOM_REGISTRY } from '../uom/uomRegistry.js';

/**
 * UomRepository domain persistence abstraction.
 *
 * Manages unit-of-measure definitions and pre-seeding from canonical UOM registry.
 * Supports constructor dependency injection while remaining
 * fully backward-compatible with legacy global platform instances.
 */
export class UomRepository {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.uomRegistry = deps.uomRegistry || (typeof UOM_REGISTRY !== 'undefined' ? UOM_REGISTRY : UOM_REGISTRY);
  }

  getAll() {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const registry = this.uomRegistry || (typeof UOM_REGISTRY !== 'undefined' ? UOM_REGISTRY : UOM_REGISTRY);

    let list = store ? store.getCollection('inventory_uoms') : [];
    const canonicalList = Object.values(registry || {}).map(u => ({
      id: 'uom-' + u.code.toLowerCase(),
      tenantId: '',
      uomCode: u.code,
      uomName: u.name,
      uomFamily: u.family,
      isBaseUnit: !!u.isBase,
      conversionFactor: u.baseRatio || 1,
      icon: u.icon,
      status: 'ACTIVE'
    }));

    if (!list || list.length === 0) {
      if (store) {
        store.setCollection('inventory_uoms', canonicalList);
      }
      return canonicalList;
    }

    const existingCodes = new Set(list.map(u => u.uomCode || u.code));
    let updated = false;
    canonicalList.forEach(cu => {
      if (!existingCodes.has(cu.uomCode)) {
        list.push(cu);
        updated = true;
      }
    });
    if (updated && store) {
      store.setCollection('inventory_uoms', list);
    }

    return list;
  }

  getByCode(code) {
    return this.getAll().find(u => u.uomCode === code || u.code === code) || null;
  }

  initCanonicalUoms() {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    const registry = this.uomRegistry || (typeof UOM_REGISTRY !== 'undefined' ? UOM_REGISTRY : UOM_REGISTRY);

    const canonicalList = Object.values(registry || {}).map(u => ({
      id: 'uom-' + u.code.toLowerCase(),
      tenantId: '',
      uomCode: u.code,
      uomName: u.name,
      uomFamily: u.family,
      isBaseUnit: !!u.isBase,
      conversionFactor: u.baseRatio || 1,
      icon: u.icon,
      status: 'ACTIVE'
    }));

    if (store) {
      store.setCollection('inventory_uoms', canonicalList);
    }

    canonicalList.forEach(item => {
      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPLOAD_EVENT', '', 'inventory_uoms', { commandType: 'PRESEED_UOM', eventType: 'UomPreseeded', ...item }, { employeeName: 'System Pre-seed', tenantId: '' });
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPLOAD_EVENT', '', 'inventory_uoms', { commandType: 'PRESEED_UOM', eventType: 'UomPreseeded', ...item }, { employeeName: 'System Pre-seed', tenantId: '' });
      }
    });

    return canonicalList;
  }
}
