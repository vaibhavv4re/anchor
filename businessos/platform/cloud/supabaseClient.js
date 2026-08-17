/**
 * SupabaseClient REST API Cloud Adapter (PD-034 Configuration).
 *
 * Handles HTTP requests to Supabase REST endpoints.
 * Supports configurable credentials with fallback defaults.
 */
export class SupabaseClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1';
    this.anonKey = config.anonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';
  }

  getHeaders() {
    return {
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.anonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation, resolution=merge-duplicates'
    };
  }

  async createRecord(tableName, record) {
    return this.upsertRecord(tableName, record);
  }

  async updateRecord(tableName, id, patch) {
    try {
      const filterKey = tableName === 'tenants' ? `tenant_id=eq.${id}` : `id=eq.${id}`;
      
      // If patch contains a nested data payload or full object, format correctly
      const body = {
        ...(patch.data ? patch : { data: patch }),
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.legalName ? { legal_name: patch.legalName } : {}),
        ...(patch.profileVersion ? { profile_version: patch.profileVersion } : {})
      };

      const resp = await fetch(`${this.baseUrl}/${tableName}?${filterKey}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return { success: false, status: resp.status, error: errText };
      }
      
      const data = await resp.json();
      const resultData = Array.isArray(data) && data.length > 0 ? data[0] : patch;
      return { success: true, data: resultData };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async upsertRecord(tableName, record) {
    try {
      const formatted = formatRecordForTable(tableName, { payload: record });
      const resp = await fetch(`${this.baseUrl}/${tableName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(formatted)
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return { success: false, status: resp.status, error: errText };
      }
      const data = await resp.json();
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async deleteRecords(tableName, queryFilter) {
    try {
      const resp = await fetch(`${this.baseUrl}/${tableName}?${queryFilter}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return { success: false, status: resp.status, error: errText };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async fetchTableData(tableName) {
    try {
      const resp = await fetch(`${this.baseUrl}/${tableName}?select=*`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (!resp.ok) return { success: false, status: resp.status };
      const data = await resp.json();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

/**
 * Helper mapper to format exact PostgreSQL columns per table (PD-034).
 */
export function formatRecordForTable(entityName, job) {
  const p = job.payload || {};

  if (entityName === 'tenants') {
    return {
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      name: p.name || 'Anchor Bistro & Cafe',
      legal_name: p.legalName || 'Anchor Hospitality Pvt Ltd',
      admin_name: p.adminName || 'General Manager',
      admin_pin: p.adminPin || '999999',
      profile_version: p.profileVersion || 1,
      data: p
    };
  }

  if (entityName === 'tables_master') {
    return {
      id: p.id || ('tbl-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      area_id: p.areaId || null,
      table_code: p.tableCode || 'T-01',
      seats: parseInt(p.seats) || 4,
      shape: p.shape || 'SQUARE',
      status: p.status || 'ACTIVE',
      data: p
    };
  }

  if (entityName === 'dining_areas') {
    return {
      id: p.id || ('area-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      area_code: p.areaCode || 'MH',
      area_name: p.areaName || 'Main Area',
      area_type: p.areaType || 'Indoor',
      status: p.status || 'OPEN',
      data: p
    };
  }

  if (entityName === 'inventory') {
    return {
      uuid: p.uuid || ('uuid-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || '',
      item_code: p.itemCode || '',
      item_name: p.itemName || '',
      item_type: p.itemType || 'Raw Material',
      category_code: p.categoryCode || 'GENERAL',
      base_uom: p.baseUom || 'KG',
      opening_stock: parseFloat(p.openingStock) || 0,
      reorder_level: parseFloat(p.reorderLevel) || 0,
      unit_valuation: parseFloat(p.unitValuation) || 0,
      default_location_code: p.defaultLocationCode || 'LOC-MWH',
      default_supplier_code: p.defaultSupplierCode || 'SUP-001',
      version: p.version || 1,
      status: p.status || 'ACTIVE',
      data: p
    };
  }

  if (entityName === 'suppliers') {
    return {
      id: p.id || ('sup-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      supplier_code: p.supplierCode || '',
      supplier_name: p.supplierName || '',
      primary_contact: p.primaryContact || '',
      phone: p.phone || '',
      email: p.email || '',
      gstin: p.gstin || '',
      status: p.status || 'ACTIVE',
      data: p
    };
  }

  if (entityName === 'employees') {
    return {
      id: p.id || ('emp-' + Math.random().toString(36).substring(2, 7)),
      identity_id: p.identityId || '',
      tenant_id: job.tenantId || p.tenantId || '',
      employee_code: p.employeeCode || '',
      name: p.name || '',
      role_id: p.roleId || 'role-waiter',
      workspace_default: p.workspaceDefault || 'waiter',
      status: p.status || 'ACTIVE',
      data: p
    };
  }

  if (entityName === 'storage_locations') {
    return {
      id: p.id || ('loc-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      location_code: p.locationCode || '',
      location_name: p.locationName || '',
      parent_location_code: p.parentLocationCode || null,
      storage_type: p.locationType || p.storageType || 'Store',
      status: p.status || 'ACTIVE',
      data: p
    };
  }

  return p;
}
