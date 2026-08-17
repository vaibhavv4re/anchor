/**
 * Supabase Cloud Data Adapter
 * Bridges DataGateway requests to live Supabase REST API endpoints.
 */
export class SupabaseDataAdapter {
  constructor(client) {
    this.client = client;
  }

  async getCollection(collection, tenantId = null) {
    if (!this.client || collection === 'roles' || collection === 'sessions') return [];
    
    try {
      const res = await this.client.fetchTableData(collection);
      if (!res || !res.success || !Array.isArray(res.data)) return [];
      
      let list = res.data.map(row => {
        let item = (row && row.data) ? { ...row.data, ...row } : { ...row };
        if (item.tenant_id && !item.tenantId) item.tenantId = item.tenant_id;
        if (item.identity_id && !item.identityId) item.identityId = item.identity_id;
        if (item.pin_hash && !item.pinHash) item.pinHash = item.pin_hash;
        if (item.role_id && !item.roleId) item.roleId = item.role_id;
        if (item.workspace_default && !item.workspaceDefault) item.workspaceDefault = item.workspace_default;
        if (item.employee_code && !item.employeeCode) item.employeeCode = item.employee_code;
        if (item.admin_name && !item.adminName) item.adminName = item.admin_name;
        if (item.admin_pin && !item.adminPin) item.adminPin = item.admin_pin;

        if (item.po_number && !item.poNumber) item.poNumber = item.po_number;
        if (item.grn_number && !item.grnNumber) item.grnNumber = item.grn_number;
        if (item.supplier_code && !item.supplierCode) item.supplierCode = item.supplier_code;
        if (item.supplier_name && !item.supplierName) item.supplierName = item.supplier_name;
        if (item.total_amount && !item.grandTotal) item.grandTotal = parseFloat(item.total_amount);
        if (item.grand_total && !item.grandTotal) item.grandTotal = parseFloat(item.grand_total);
        if (item.total_received_value && !item.totalAmount) item.totalAmount = parseFloat(item.total_received_value);

        if (item.item_code && !item.itemCode) item.itemCode = item.item_code;
        if (item.location_code && !item.locationCode) item.locationCode = item.location_code;
        if (item.unit_cost && !item.unitCost) item.unitCost = parseFloat(item.unit_cost);
        
        // Normalize tenant restaurant name from patchObj or default
        if (collection === 'tenants') {
          item.name = item.name || (item.patchObj?.header ? item.patchObj.header.replace(/^Welcome to\s+/i, '') : 'Anchor Bistro & Cafe');
          item.currency = item.currency || 'INR (₹)';
          item.timezone = item.timezone || 'Asia/Kolkata';
        }
        return item;
      });

      if (tenantId) {
        list = list.filter(item => (!item.tenantId && !item.tenant_id) || item.tenantId === tenantId || item.tenant_id === tenantId);
      }
      return list;
    } catch (e) {
      console.warn(`[SupabaseDataAdapter] Exception fetching collection "${collection}":`, e.message);
      return [];
    }
  }

  async getById(collection, id, tenantId = null) {
    const list = await this.getCollection(collection, tenantId);
    return list.find(item => item.id === id || item.tenant_id === id || item.uuid === id || item.itemCode === id) || null;
  }

  async create(collection, record) {
    if (!this.client || collection === 'roles' || collection === 'sessions') return record;
    const res = await this.client.createRecord(collection, record);
    return res.success ? (res.data || record) : record;
  }

  async update(collection, id, patch) {
    if (!this.client || collection === 'roles' || collection === 'sessions') return patch;
    const res = await this.client.updateRecord(collection, id, patch);
    return res.success ? (res.data || patch) : patch;
  }

  async delete(collection, id) {
    if (!this.client || collection === 'roles' || collection === 'sessions') return true;
    const filter = collection === 'tenants' ? `tenant_id=eq.${id}` : `id=eq.${id}`;
    const res = await this.client.deleteRecords(collection, filter);
    return res.success;
  }
}
