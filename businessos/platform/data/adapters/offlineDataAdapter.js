/**
 * OfflineDataAdapter handles local persistence fallback via OfflineStore.
 */
export class OfflineDataAdapter {
  constructor(offlineStore) {
    this.store = offlineStore;
  }

  getCollection(collection, tenantId = null) {
    if (!this.store) return [];
    const list = this.store.getCollection(collection, tenantId) || [];
    if (tenantId && Array.isArray(list)) {
      return list.filter(item => !item.tenantId || item.tenantId === tenantId || !item.tenant_id || item.tenant_id === tenantId);
    }
    return list;
  }

  setCollection(collection, data) {
    if (!this.store) return data;
    return this.store.setCollection(collection, data);
  }

  getById(collection, id, tenantId = null) {
    const list = this.getCollection(collection, tenantId);
    return list.find(item => item.id === id || item.uuid === id || item.code === id || item.itemCode === id || item.categoryCode === id || item.supplierCode === id || item.uomCode === id || item.locationCode === id || item.poNumber === id || item.grnNumber === id || item.transferNo === id || item.issueNo === id || item.adjustmentNo === id || item.countNo === id || item.tableCode === id || item.employeeCode === id || item.tenantId === id) || null;
  }

  create(collection, data, session = null) {
    if (!this.store) return data;
    return this.store.appendItem(collection, data);
  }

  update(collection, id, patch, session = null) {
    if (!this.store) return null;
    const tenantId = session ? session.tenantId : '';
    const list = this.store.getCollection(collection) || [];
    const idx = list.findIndex(item => (item.id === id || item.uuid === id || item.code === id || item.itemCode === id || item.categoryCode === id || item.supplierCode === id || item.uomCode === id || item.locationCode === id || item.poNumber === id || item.grnNumber === id || item.transferNo === id || item.issueNo === id || item.adjustmentNo === id || item.countNo === id || item.tableCode === id || item.employeeCode === id || item.tenantId === id) && (!tenantId || item.tenantId === tenantId || item.tenant_id === tenantId));
    if (idx !== -1) {
      const updated = { ...list[idx], ...patch };
      list[idx] = updated;
      this.store.setCollection(collection, list);
      return updated;
    }
    return null;
  }

  delete(collection, id, session = null) {
    if (!this.store) return false;
    const tenantId = session ? session.tenantId : '';
    const list = this.store.getCollection(collection) || [];
    const filtered = list.filter(item => !( (item.id === id || item.uuid === id || item.code === id || item.itemCode === id || item.categoryCode === id || item.supplierCode === id || item.uomCode === id || item.locationCode === id || item.poNumber === id || item.grnNumber === id || item.transferNo === id || item.issueNo === id || item.adjustmentNo === id || item.countNo === id || item.tableCode === id || item.employeeCode === id || item.tenantId === id) && (!tenantId || item.tenantId === tenantId || item.tenant_id === tenantId) ));
    const changed = filtered.length !== list.length;
    if (changed) {
      this.store.setCollection(collection, filtered);
    }
    return changed;
  }
}
