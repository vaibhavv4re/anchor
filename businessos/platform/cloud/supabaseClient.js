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
      const formatted = formatRecordForTable(tableName, { payload: patch });

      const resp = await fetch(`${this.baseUrl}/${tableName}?${filterKey}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(formatted)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return { success: false, status: resp.status, error: errText };
      }
      
      const data = await resp.json();
      if (Array.isArray(data) && data.length === 0) {
        return this.createRecord(tableName, patch);
      }

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

  if (entityName === 'supplier_catalog') {
    return {
      id: p.id || ('scat-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || '',
      supplier_code: p.supplierCode || p.supplier_code || '',
      item_code: p.itemCode || p.item_code || '',
      supplier_sku: p.supplierSku || p.supplier_sku || '',
      purchase_uom: p.purchaseUom || p.purchase_uom || 'KG',
      current_price: parseFloat(p.currentPrice || p.current_price) || 0,
      last_purchase_price: parseFloat(p.lastPurchasePrice || p.last_purchase_price) || 0,
      last_purchase_at: p.lastPurchaseAt || p.last_purchase_at || null,
      average_purchase_price: parseFloat(p.averagePurchasePrice || p.average_purchase_price) || 0,
      status: p.status || 'ACTIVE',
      data: p
    };
  }

  if (entityName === 'purchase_orders') {
    const formatted = {};
    if (p.id) formatted.id = p.id;
    if (job.tenantId || p.tenantId || p.tenant_id) formatted.tenant_id = job.tenantId || p.tenantId || p.tenant_id;
    if (p.poNumber || p.po_number) formatted.po_number = p.poNumber || p.po_number;
    if (p.supplierCode || p.supplier_code) formatted.supplier_code = p.supplierCode || p.supplier_code;
    if (p.supplierName || p.supplier_name) formatted.supplier_name = p.supplierName || p.supplier_name;
    if (p.status) formatted.status = p.status;
    if (p.grandTotal || p.grand_total || p.totalAmount || p.total_amount) {
      formatted.total_amount = parseFloat(p.grandTotal || p.grand_total || p.totalAmount || p.total_amount) || 0;
    }
    if (p.lines || p.data) formatted.data = p;
    return formatted;
  }

  if (entityName === 'goods_receipt_notes') {
    const formatted = {};
    if (p.id) formatted.id = p.id;
    if (job.tenantId || p.tenantId || p.tenant_id) formatted.tenant_id = job.tenantId || p.tenantId || p.tenant_id;
    if (p.grnNumber || p.grn_number) formatted.grn_number = p.grnNumber || p.grn_number;
    if (p.poNumber || p.po_number) formatted.po_number = p.poNumber || p.po_number;
    if (p.supplierCode || p.supplier_code) formatted.supplier_code = p.supplierCode || p.supplier_code;
    if (p.supplierName || p.supplier_name) formatted.supplier_name = p.supplierName || p.supplier_name;
    if (p.status) formatted.status = p.status;
    if (p.totalAmount || p.total_amount || p.totalReceivedValue || p.total_received_value) {
      formatted.total_received_value = parseFloat(p.totalAmount || p.total_amount || p.totalReceivedValue || p.total_received_value) || 0;
    }
    if (p.lines || p.data) formatted.data = p;
    return formatted;
  }

  if (entityName === 'inventory_requests' || entityName === 'stock_requisitions') {
    return {
      id: p.id || ('req-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || '',
      request_number: p.requestNumber || p.request_number || p.reqCode || p.id || '',
      department: p.department || p.requestedBy || 'Kitchen Production',
      status: p.status || 'PENDING',
      data: p
    };
  }

  if (entityName === 'stock_balances') {
    return {
      id: p.id || ('sb-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || '',
      item_code: p.itemCode || p.item_code || '',
      location_code: p.locationCode || p.location_code || '',
      quantity: parseFloat(p.quantity) || 0,
      unit_cost: parseFloat(p.unitCost || p.unit_cost) || 0,
      valuation: parseFloat(p.valuation) || 0,
      data: p
    };
  }

  if (entityName === 'kitchen_menu_items') {
    return {
      id: p.id || ('menu-item-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || '',
      item_code: p.itemCode || p.item_code || '',
      item_name: p.itemName || p.item_name || '',
      category: p.category || 'GENERAL',
      description: p.description || '',
      selling_price: parseFloat(p.sellingPrice || p.selling_price) || 0,
      tax_profile: p.taxProfile || p.tax_profile || 'GST_5',
      dietary_type: p.dietaryType || p.dietary_type || 'VEG',
      portion_size: p.portionSize || p.portion_size || '1 Portion',
      availability_status: p.availabilityStatus || p.availability_status || 'AVAILABLE',
      lifecycle_status: p.lifecycleStatus || p.lifecycle_status || 'ACTIVE',
      recipe_id: p.recipeId || p.recipe_id || null,
      routing: p.routing || 'KITCHEN_LINE',
      recipe_notes: p.recipeNotes || p.recipe_notes || '',
      spiciness_level: p.spicinessLevel || p.spiciness_level || 'MEDIUM',
      region: p.region || '',
      data: p
    };
  }

  if (entityName === 'recipes') {
    return {
      id: p.id || ('rcp-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || '',
      recipe_code: p.recipeCode || p.recipe_code || '',
      recipe_name: p.recipeName || p.recipe_name || '',
      menu_item_id: p.menuItemId || p.menu_item_id || null,
      version: p.version || 'v1.0',
      status: p.status || 'DRAFT',
      yield_quantity: parseFloat(p.yieldQuantity || p.yield_quantity) || 1,
      yield_uom: p.yieldUom || p.yield_uom || 'PORTION',
      portion_count: parseInt(p.portionCount || p.portion_count) || 1,
      prep_time_minutes: parseInt(p.prepTimeMinutes || p.prep_time_minutes) || 15,
      cook_time_minutes: parseInt(p.cookTimeMinutes || p.cook_time_minutes) || 15,
      total_cost: parseFloat(p.totalCost || p.total_cost) || 0,
      cost_per_portion: parseFloat(p.costPerPortion || p.cost_per_portion) || 0,
      cost_snapshot_at_approval: p.costSnapshotAtApproval || p.cost_snapshot_at_approval || null,
      instructions: p.instructions || '',
      data: p
    };
  }

  if (entityName === 'recipe_ingredients') {
    return {
      id: p.id || ('ri-' + Math.random().toString(36).substring(2, 9)),
      recipe_id: p.recipeId || p.recipe_id || '',
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || '',
      inventory_item_code: p.inventoryItemCode || p.inventory_item_code || '',
      inventory_item_name: p.inventoryItemName || p.inventory_item_name || '',
      item_type: p.itemType || p.item_type || 'RAW_MATERIAL',
      quantity: parseFloat(p.quantity) || 0,
      uom: p.uom || p.baseUom || p.base_uom || 'KG',
      unit_cost_snapshot: parseFloat(p.unitCostSnapshot || p.unitCost || p.unit_cost_snapshot || p.unit_cost) || 0,
      line_cost: parseFloat(p.lineCost || p.line_cost) || 0,
      recipe_wastage_percent: parseFloat(p.recipeWastagePercent || p.recipe_wastage_percent || p.wastage_percent) || 0,
      data: p
    };
  }

  if (entityName === 'orders') {
    return {
      id: p.id || ('ord-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || '',
      order_number: p.orderNumber || p.order_number || '',
      table_code: p.tableCode || p.table_code || '',
      session_id: p.sessionId || p.session_id || null,
      status: p.status || 'OPEN',
      total_amount: parseFloat(p.totalAmount || p.total_amount) || 0,
      data: p
    };
  }

  return p;
}
