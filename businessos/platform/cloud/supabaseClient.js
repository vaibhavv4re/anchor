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

  async upsertRecord(tableName, record) {
    try {
      const resp = await fetch(`${this.baseUrl}/${tableName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(record)
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return { success: false, status: resp.status, error: errText };
      }
      const data = await resp.json();
      return { success: true, data };
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

  if (entityName === 'tenants') {
    return {
      tenant_id: job.tenantId || p.tenantId || '',
      name: p.name || 'Restaurant',
      legal_name: p.legalName || '',
      admin_name: p.adminName || 'Admin',
      admin_pin: p.adminPin || '999999',
      profile_version: p.profileVersion || 1,
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
      data: p
    };
  }

  if (entityName === 'inventory_uoms') {
    return {
      id: p.id || ('uom-' + (p.uomCode || '').toLowerCase()),
      tenant_id: job.tenantId || p.tenantId || '',
      uom_code: p.uomCode || p.code || '',
      uom_name: p.uomName || p.name || '',
      uom_family: p.uomFamily || p.family || 'COUNT',
      is_base_unit: p.isBaseUnit !== undefined ? p.isBaseUnit : true,
      conversion_factor: parseFloat(p.conversionFactor || p.baseRatio) || 1,
      data: p
    };
  }

  if (entityName === 'purchase_orders') {
    return {
      id: p.id || ('po-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      po_number: p.poNumber || p.po_number || '',
      supplier_code: p.supplierCode || p.supplier_code || '',
      supplier_name: p.supplierName || p.supplier_name || '',
      status: p.status || 'DRAFT',
      total_amount: parseFloat(p.totalAmount || p.total_amount) || 0,
      data: p
    };
  }

  if (entityName === 'goods_receipt_notes') {
    return {
      id: p.id || ('grn-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      grn_number: p.grnNumber || p.grn_number || '',
      po_number: p.poNumber || p.po_number || '',
      supplier_code: p.supplierCode || p.supplier_code || '',
      status: p.status || 'POSTED',
      total_received_value: parseFloat(p.totalReceivedValue || p.total_received_value) || 0,
      data: p
    };
  }

  if (entityName === 'stock_transfers') {
    return {
      id: p.id || ('st-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      transfer_number: p.transferNumber || p.transfer_number || '',
      from_location_code: p.fromLocationCode || p.from_location_code || '',
      to_location_code: p.toLocationCode || p.to_location_code || '',
      status: p.status || 'COMPLETED',
      data: p
    };
  }

  if (entityName === 'stock_issues') {
    return {
      id: p.id || ('si-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      issue_number: p.issueNumber || p.issue_number || '',
      location_code: p.locationCode || p.location_code || '',
      department: p.department || '',
      status: p.status || 'POSTED',
      data: p
    };
  }

  if (entityName === 'stock_adjustments') {
    return {
      id: p.id || ('sa-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      adjustment_number: p.adjustmentNumber || p.adjustment_number || '',
      location_code: p.locationCode || p.location_code || '',
      reason: p.reason || '',
      status: p.status || 'POSTED',
      data: p
    };
  }

  if (entityName === 'stock_counts') {
    return {
      id: p.id || ('sc-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      count_number: p.countNumber || p.count_number || '',
      location_code: p.locationCode || p.location_code || '',
      status: p.status || 'COMPLETED',
      data: p
    };
  }

  if (entityName === 'inventory_requests') {
    return {
      id: p.id || ('req-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || '',
      request_number: p.requestNumber || p.request_number || '',
      department: p.department || '',
      status: p.status || 'PENDING',
      data: p
    };
  }

  return {
    job_id: job.jobId,
    job_type: job.jobType,
    tenant_id: job.tenantId,
    entity_name: job.entityName,
    payload: job.payload,
    device_id: job.deviceId,
    version: job.version,
    actor: job.actor,
    correlation_id: job.correlationId,
    sync_state: 'SYNCED'
  };
}
