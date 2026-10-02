/**
 * SupabaseClient REST API Cloud Adapter (PD-034 Configuration).
 *
 * Handles HTTP requests to Supabase REST endpoints.
 * Credentials come from the centralized runtime config (Stage 0); the
 * Authorization header reflects the active session JWT once a user logs in.
 */
import { runtimeConfig } from './runtimeConfig.js';

export class SupabaseClient {
  constructor(config = {}) {
    this.config = config;
  }

  get baseUrl() {
    return this.config.baseUrl || runtimeConfig.getRestUrl();
  }

  get anonKey() {
    return this.config.anonKey || runtimeConfig.getAnonKey();
  }

  setAccessToken(token) {
    runtimeConfig.setAccessToken(token);
  }

  getAccessToken() {
    return runtimeConfig.getAccessToken();
  }

  getHeaders() {
    return runtimeConfig.getAuthHeaders({
      'Content-Type': 'application/json',
      'Prefer': 'return=representation, resolution=merge-duplicates'
    });
  }

  getFilterKey(tableName, id) {
    if (tableName === 'tenants') return `tenant_id=eq.${id}`;
    if (tableName === 'inventory') {
      return (typeof id === 'string' && id.startsWith('uuid-')) ? `uuid=eq.${id}` : `item_code=eq.${id}`;
    }
    if (tableName === 'suppliers') {
      return (typeof id === 'string' && id.startsWith('sup-')) ? `id=eq.${id}` : `supplier_code=eq.${id}`;
    }
    if (tableName === 'goods_receipt_notes' || tableName === 'goods_received_notes') {
      return (typeof id === 'string' && id.startsWith('grn-')) ? `id=eq.${id}` : `grn_number=eq.${id}`;
    }
    if (tableName === 'purchase_orders') {
      return (typeof id === 'string' && id.startsWith('po-')) ? `id=eq.${id}` : `po_number=eq.${id}`;
    }
    if (tableName === 'inventory_categories') {
      return (typeof id === 'string' && id.startsWith('cat-')) ? `id=eq.${id}` : `category_code=eq.${id}`;
    }
    if (tableName === 'product_families') {
      return (typeof id === 'string' && id.startsWith('pf-')) ? `id=eq.${id}` : `family_code=eq.${id}`;
    }
    if (tableName === 'kitchen_menu_items') {
      return (typeof id === 'string' && id.startsWith('menu-item-')) ? `id=eq.${id}` : `item_code=eq.${id}`;
    }
    if (tableName === 'recipes') {
      return (typeof id === 'string' && id.startsWith('rcp-')) ? `id=eq.${id}` : `recipe_code=eq.${id}`;
    }
    if (tableName === 'orders') {
      return (typeof id === 'string' && id.startsWith('ORD-')) ? `order_number=eq.${id}` : `id=eq.${id}`;
    }
    if (tableName === 'bill_revisions') {
      return (typeof id === 'string' && id.startsWith('BILL-')) ? `bill_number=eq.${id}` : `id=eq.${id}`;
    }
    if (tableName === 'invoices') {
      return (typeof id === 'string' && id.startsWith('inv_')) ? `id=eq.${id}` : `invoice_number=eq.${id}`;
    }
    if (tableName === 'stock_transfers') {
      return (typeof id === 'string' && id.startsWith('trf-')) ? `id=eq.${id}` : `transfer_number=eq.${id}`;
    }
    if (tableName === 'stock_issues') {
      return (typeof id === 'string' && id.startsWith('iss-')) ? `id=eq.${id}` : `issue_number=eq.${id}`;
    }
    if (tableName === 'stock_adjustments') {
      return (typeof id === 'string' && id.startsWith('adj-')) ? `id=eq.${id}` : `adjustment_number=eq.${id}`;
    }
    if (tableName === 'stock_counts') {
      return (typeof id === 'string' && id.startsWith('cnt-')) ? `id=eq.${id}` : `count_number=eq.${id}`;
    }
    if (tableName === 'stock_operations') {
      return (typeof id === 'string' && id.startsWith('op-')) ? `id=eq.${id}` : `operation_id=eq.${id}`;
    }
    if (tableName === 'stock_transactions') {
      return `id=eq.${id}`;
    }
    return `id=eq.${id}`;
  }

  async createRecord(tableName, record) {
    return this.upsertRecord(tableName, record);
  }

  async updateRecord(tableName, id, patch) {
    try {
      const filterKey = this.getFilterKey(tableName, id);
      const formatted = formatPatchForTable(tableName, patch);

      const resp = await fetch(`${this.baseUrl}/${tableName}?${filterKey}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(formatted)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.warn(`[SupabaseClient] updateRecord failed for ${tableName}?${filterKey}: status=${resp.status}`, errText);
        return { success: false, status: resp.status, error: errText };
      }
      
      const data = await resp.json();
      if (Array.isArray(data) && data.length === 0) {
        return this.createRecord(tableName, patch);
      }

      const resultData = Array.isArray(data) && data.length > 0 ? data[0] : patch;
      return { success: true, data: resultData };
    } catch (e) {
      console.warn(`[SupabaseClient] updateRecord caught error for ${tableName}:${id}`, e.message);
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

  async rpc(fnName, params = {}) {
    try {
      const resp = await fetch(`${this.baseUrl}/rpc/${fnName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params)
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
}

/**
 * Collision-safe temporary id (Stage 1C).
 *
 * formatRecordForTable previously minted primary keys with Math.random(), so two
 * POS devices issuing concurrently could produce the same id. When the server
 * write path is enabled the authoritative PK comes from gen_random_uuid() in the
 * RPC; but for the offline / flag-off path we still need a unique local id here.
 * crypto.randomUUID() removes the collision risk while keeping the existing
 * prefix, because getFilterKey() branches on prefixes like 'inv_', 'ord-'.
 * Falls back to the old random string when crypto is unavailable.
 * @param {string} prefix preserved table-specific id prefix (e.g. 'inv_')
 * @param {number} len hex/char length of the random suffix
 */
function genTempId(prefix, len = 9) {
  const c = (typeof globalThis !== 'undefined') ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return prefix + c.randomUUID().replace(/-/g, '').slice(0, len);
  }
  // Legacy fallback preserving the original base36 shape.
  let out = '';
  while (out.length < len) out += Math.random().toString(36).substring(2);
  return prefix + out.substring(0, len);
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

  if (entityName === 'inventory_categories' || entityName === 'categories') {
    const pfCode = p.productFamilyCode || p.product_family_code || p.productFamily || 'FAM-PRODUCE';
    const pfName = p.productFamilyName || p.product_family_name || pfCode;
    const catCode = p.categoryCode || p.category_code || '';
    const catName = p.categoryName || p.category_name || '';
    const catType = p.categoryType || p.category_type || 'OPERATIONAL';
    const statusVal = p.status || (p.active !== false ? 'ACTIVE' : 'INACTIVE');
    const uom = p.defaultUom || p.default_uom || p.defaultBaseUom || p.default_base_uom || 'KG';
    const desc = p.description || '';

    const payloadData = {
      id: p.id || p.uuid || ('cat-' + Math.random().toString(36).substring(2, 7)),
      tenantId: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      categoryCode: catCode,
      category_code: catCode,
      categoryName: catName,
      category_name: catName,
      productFamilyCode: pfCode,
      product_family_code: pfCode,
      productFamilyName: pfName,
      product_family_name: pfName,
      defaultUom: uom,
      default_uom: uom,
      description: desc,
      status: statusVal,
      ...(p.data || {})
    };

    return {
      id: p.id || p.uuid || payloadData.id,
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      category_code: catCode,
      category_name: catName,
      category_type: catType,
      data: payloadData
    };
  }

  if (entityName === 'product_families') {
    return {
      id: p.id || ('pf-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || '',
      family_code: p.familyCode || p.family_code || p.productFamilyCode || '',
      family_name: p.familyName || p.family_name || p.productFamilyName || '',
      description: p.description || '',
      status: p.status || 'ACTIVE',
      data: p
    };
  }

  if (entityName === 'supplier_catalog' || entityName === 'supplier_catalogue') {
    const priceVal = parseFloat(p.unitPrice !== undefined ? p.unitPrice : (p.unit_price || p.currentPrice || p.current_price || 0)) || 0;
    return {
      id: p.id || ('scat-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || '',
      supplier_code: p.supplierCode || p.supplier_code || '',
      item_code: p.itemCode || p.item_code || '',
      supplier_sku: p.supplierSku || p.supplier_sku || '',
      purchase_uom: p.purchaseUom || p.purchase_uom || 'KG',
      current_price: priceVal,
      last_purchase_price: parseFloat(p.lastPurchasePrice || p.last_purchase_price || priceVal) || priceVal,
      last_purchase_at: p.lastPurchaseAt || p.last_purchase_at || null,
      average_purchase_price: parseFloat(p.averagePurchasePrice || p.average_purchase_price || priceVal) || priceVal,
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
    const total = parseFloat(p.grandTotal || p.grand_total || p.totalAmount || p.total_amount) || 0;
    formatted.total_amount = total;
    formatted.data = p;
    return formatted;
  }

  if (entityName === 'goods_receipt_notes' || entityName === 'goods_received_notes') {
    const formatted = {};
    formatted.id = p.id || p.grnNumber || p.grn_number || ('grn-' + Math.random().toString(36).substring(2, 9));
    formatted.tenant_id = job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf';
    if (p.grnNumber || p.grn_number) formatted.grn_number = p.grnNumber || p.grn_number;
    if (p.poNumber || p.po_number) formatted.po_number = p.poNumber || p.po_number;
    if (p.supplierCode || p.supplier_code) formatted.supplier_code = p.supplierCode || p.supplier_code;
    formatted.status = p.status || p.grnStatus || 'POSTED';
    formatted.total_received_value = parseFloat(p.totalReceivedValue || p.total_received_value || p.totalAmount || p.total_amount || p.supplierInvoiceTotal || 0) || 0;
    formatted.data = p;
    return formatted;
  }

  if (entityName === 'supplier_invoices') {
    return {
      id: p.id || p.supplierInvoiceId || ('sinv-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      invoice_number: p.supplierInvoiceNumber || p.invoice_number || p.invoiceNumber || '',
      supplier_code: p.supplierCode || p.supplier_code || '',
      supplier_name: p.supplierName || p.supplier_name || '',
      po_number: p.poNumber || p.po_number || null,
      invoice_date: p.invoiceDate || p.invoice_date || new Date().toISOString().split('T')[0],
      due_date: p.dueDate || p.due_date || null,
      subtotal: parseFloat(p.subtotal) || 0,
      tax_amount: parseFloat(p.taxAmount || p.tax_amount) || 0,
      grand_total: parseFloat(p.grandTotal || p.grand_total) || 0,
      status: p.status || 'SUBMITTED',
      match_status: p.matchStatus || p.match_status || 'PENDING',
      data: p
    };
  }

  if (entityName === 'supplier_payments') {
    return {
      id: p.id || ('spay-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      payment_number: p.paymentNumber || p.payment_number || ('PAY-AP-' + Math.floor(1000 + Math.random() * 9000)),
      supplier_invoice_id: p.supplierInvoiceId || p.supplier_invoice_id || '',
      invoice_number: p.supplierInvoiceNumber || p.invoice_number || '',
      supplier_code: p.supplierCode || p.supplier_code || '',
      supplier_name: p.supplierName || p.supplier_name || '',
      amount: parseFloat(p.amount) || 0,
      payment_method: p.paymentMethod || p.payment_method || 'BANK_TRANSFER',
      reference_utr: p.referenceUtr || p.reference_utr || 'N/A',
      payment_date: p.paymentDate || p.payment_date || new Date().toISOString(),
      paid_by: p.paidBy || p.paid_by || 'Finance Manager',
      status: p.status || 'DISBURSED',
      data: p
    };
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
    const rawData = p.data || p;
    const sanitizedData = (rawData && rawData.data && typeof rawData.data === 'object') ? { ...rawData.data, ...rawData } : { ...rawData };
    delete sanitizedData.data;
    const qty = parseFloat(p.quantity) || 0;
    const val = parseFloat(p.valuation) || 0;
    sanitizedData.quantity = qty;
    sanitizedData.valuation = val;

    return {
      id: p.id || ('sb-' + Math.random().toString(36).substring(2, 7)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || '',
      item_code: p.itemCode || p.item_code || '',
      location_code: p.locationCode || p.location_code || '',
      quantity: qty,
      unit_cost: parseFloat(p.unitCost || p.unit_cost) || 0,
      valuation: val,
      data: sanitizedData
    };
  }

  if (entityName === 'stock_transfers') {
    return {
      id: p.id || ('trf-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      transfer_number: p.transferNumber || p.transfer_number || p.transferNo || p.transfer_no || ('TRF-' + Date.now()),
      from_location_code: p.fromLocationCode || p.from_location_code || '',
      to_location_code: p.toLocationCode || p.to_location_code || '',
      status: p.status || 'COMPLETED',
      data: p
    };
  }

  if (entityName === 'stock_issues') {
    return {
      id: p.id || ('iss-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      issue_number: p.issueNumber || p.issue_number || p.issueNo || p.issue_no || ('ISS-' + Date.now()),
      location_code: p.locationCode || p.location_code || '',
      department: p.department || 'Kitchen',
      status: p.status || 'POSTED',
      data: p
    };
  }

  if (entityName === 'stock_adjustments') {
    return {
      id: p.id || ('adj-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      adjustment_number: p.adjustmentNumber || p.adjustment_number || p.adjustmentNo || p.adjustment_no || ('ADJ-' + Date.now()),
      location_code: p.locationCode || p.location_code || '',
      reason: p.reason || p.reasonCode || p.reason_code || 'AUDIT_VARIANCE',
      status: p.status || 'POSTED',
      data: p
    };
  }

  if (entityName === 'stock_counts') {
    return {
      id: p.id || ('cnt-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      count_number: p.countNumber || p.count_number || p.countNo || p.count_no || ('CNT-' + Date.now()),
      location_code: p.locationCode || p.location_code || '',
      status: p.status || 'COMPLETED',
      data: p
    };
  }

  if (entityName === 'stock_operations') {
    return {
      id: p.id || ('op-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      operation_id: p.operationId || p.operation_id || ('OP-' + Date.now()),
      operation_type: p.operationType || p.operation_type || 'SALE_CONSUMPTION',
      status: p.status || 'COMPLETED',
      reference_type: p.referenceType || p.reference_type || 'KOT_LINE',
      reference_id: p.referenceId || p.reference_id || '',
      reference_line_id: p.referenceLineId || p.reference_line_id || null,
      recipe_id: p.recipeId || p.recipe_id || null,
      recipe_version: p.recipeVersion || p.recipe_version || 'v1.0',
      occurred_at: p.occurredAt || p.occurred_at || new Date().toISOString(),
      performed_by: p.performedBy || p.performed_by || 'System',
      metadata: p.metadata || {},
      created_at: p.createdAt || p.created_at || new Date().toISOString()
    };
  }

  if (entityName === 'stock_transactions') {
    return {
      id: p.id || ('txn-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      operation_id: p.operationId || p.operation_id || '',
      transaction_type: p.transactionType || p.transaction_type || 'SALE_CONSUMPTION',
      status: p.status || 'POSTED',
      reference_type: p.referenceType || p.reference_type || 'KOT_LINE',
      reference_id: p.referenceId || p.reference_id || '',
      reference_line_id: p.referenceLineId || p.reference_line_id || null,
      recipe_id: p.recipeId || p.recipe_id || null,
      recipe_version: p.recipeVersion || p.recipe_version || 'v1.0',
      reversal_of_operation_id: p.reversalOfOperationId || p.reversal_of_operation_id || null,
      reversal_reason: p.reversalReason || p.reversal_reason || null,
      item_code: p.itemCode || p.item_code || '',
      item_name: p.itemName || p.item_name || '',
      location_code: p.locationCode || p.location_code || '',
      quantity: parseFloat(p.quantity) || 0,
      uom: p.uom || 'KG',
      unit_cost: parseFloat(p.unitCost || p.unit_cost) || 0,
      total_cost: parseFloat(p.totalCost || p.total_cost) || 0,
      performed_by: p.performedBy || p.performed_by || 'System',
      correlation_id: p.correlationId || p.correlation_id || null,
      notes: p.notes || null,
      data: p.data || p,
      occurred_at: p.occurredAt || p.occurred_at || new Date().toISOString(),
      created_at: p.createdAt || p.created_at || new Date().toISOString()
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
      data: {
        ...p,
        variantId: p.variantId || p.variant_id || null,
        variantName: p.variantName || p.variant_name || null,
        ingredients: p.ingredients || [],
        status: p.status || 'DRAFT'
      }
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
    const rawData = p.data || p;
    const sId = p.sessionId || p.session_id || rawData?.sessionId || rawData?.session_id;
    const orderData = {
      ...(rawData || {}),
      sessionId: sId,
      session_id: sId,
      tableNumber: p.tableNumber || p.table_number || rawData?.tableNumber,
      table_number: p.tableNumber || p.table_number || rawData?.table_number,
      tableCode: p.tableCode || p.table_code || rawData?.tableCode,
      table_code: p.tableCode || p.table_code || rawData?.table_code,
      tableId: p.tableId || p.table_id || p.tableCode || p.table_code,
      table_id: p.tableId || p.table_id || p.tableCode || p.table_code,
      waiterId: p.waiterId || p.waiter_id || rawData?.waiterId,
      orderNumber: p.orderNumber || p.order_number || rawData?.orderNumber,
      order_number: p.orderNumber || p.order_number || rawData?.order_number,
      items: Array.isArray(p.items) ? p.items : (rawData?.items || []),
      tickets: Array.isArray(p.tickets) ? p.tickets : (rawData?.tickets || []),
      status: p.status || p.orderStatus || rawData?.status || 'CONFIRMED'
    };
    return {
      id: p.id || p.orderId || genTempId('ord-'),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      order_number: p.orderNumber || p.order_number || ('ORD-' + Math.floor(1000 + Math.random() * 9000)),
      table_id: p.tableId || p.table_id || p.tableCode || p.table_code || null,
      waiter_id: p.waiterId || p.waiter_id || null,
      status: p.status || p.orderStatus || 'CONFIRMED',
      total_amount: parseFloat(p.totalAmount || p.total_amount || p.subtotal) || 0,
      items: Array.isArray(p.items) ? p.items : (p.data?.items || []),
      data: orderData
    };
  }

  if (entityName === 'table_sessions') {
    return {
      id: p.id || p.sessionId || genTempId('sess_'),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      table_number: p.tableNumber ? parseInt(p.tableNumber) : (p.table_number ? parseInt(p.table_number) : null),
      table_code: p.tableCode || p.table_code || (p.tableNumber ? `T-${String(p.tableNumber).padStart(2, '0')}` : null),
      status: p.status || 'GUESTS_SEATED',
      bill_status: p.billStatus || p.bill_status || 'UNBILLED',
      data: p
    };
  }

  if (entityName === 'bill_revisions') {
    return {
      id: p.id || p.revisionId || genTempId('rev_'),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      session_id: p.sessionId || p.session_id || '',
      bill_number: p.billNumber || p.bill_number || `BILL-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      revision_number: parseInt(p.revisionNumber || p.revision_number) || 1,
      grand_total: parseFloat(p.grandTotal || p.grand_total || p.subtotal) || 0,
      revision_status: p.revisionStatus || p.revision_status || p.status || 'GENERATED',
      data: p
    };
  }

  if (entityName === 'invoices') {
    return {
      id: p.id || genTempId('inv_'),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      session_id: p.sessionId || p.session_id || '',
      invoice_number: p.invoiceNumber || p.invoice_number || '',
      bill_number: p.billNumber || p.bill_number || '',
      grand_total: parseFloat(p.grandTotal || p.grand_total) || 0,
      status: p.status || 'ISSUED',
      data: p
    };
  }

  if (entityName === 'payments') {
    return {
      id: p.id || p.paymentId || ('PAY-2026-' + Math.floor(1000 + Math.random() * 9000)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      session_id: p.sessionId || p.session_id || '',
      bill_number: p.billNumber || p.bill_number || '',
      invoice_number: p.invoiceNumber || p.invoice_number || '',
      amount: parseFloat(p.amount || p.grandTotal) || 0,
      payment_method: (p.paymentMethod || p.payment_method || 'CASH').toUpperCase(),
      status: p.status || 'SETTLED',
      data: p
    };
  }

  if (entityName === 'session_audit_logs') {
    return {
      id: p.id || ('audit_' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      session_id: p.sessionId || p.session_id || '',
      event_type: p.eventType || p.event_type || 'GENERAL_EVENT',
      data: p
    };
  }

  if (entityName === 'identities') {
    const rawPin = p.pin || p.pinDisplay || p.pin_hash || p.pinHash || '444444';
    return {
      id: p.id || ('id-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      pin_hash: p.pin_hash || p.pinHash || rawPin,
      status: p.status || 'ACTIVE'
    };
  }

  if (entityName === 'employees') {
    return {
      id: p.id || ('emp-' + Math.random().toString(36).substring(2, 9)),
      identity_id: p.identityId || p.identity_id || null,
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      employee_code: p.employeeCode || p.employee_code || p.id || '',
      name: p.name || p.employeeName || 'Staff Member',
      role_id: p.roleId || p.role_id || 'role-waiter',
      workspace_default: p.workspaceDefault || p.workspace_default || 'waiter',
      status: p.status || 'ACTIVE',
      data: p
    };
  }

  if (entityName === 'tax_configurations') {
    return {
      id: p.id || ('taxcfg-' + (job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf')),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      data: p
    };
  }

  if (entityName === 'tax_audit_log') {
    return {
      id: p.id || ('taxaudit-' + Math.random().toString(36).substring(2, 9)),
      tenant_id: job.tenantId || p.tenantId || p.tenant_id || 'tenant_h0qc7wf',
      actor: p.actor || null,
      action: p.changeSummary || null,
      data: p
    };
  }

  return p;
}

/**
 * Helper mapper to format PATCH payloads (only present fields) per table.
 */
export function formatPatchForTable(entityName, patch) {
  if (!patch || typeof patch !== 'object') return {};
  
  const p = patch.payload || patch;
  const result = {};

  if (p.data !== undefined) result.data = p.data;

  const copyIfPresent = (patchKey, tableCol, transform = (v) => v) => {
    if (p[patchKey] !== undefined) {
      result[tableCol] = transform(p[patchKey]);
    } else if (p[tableCol] !== undefined) {
      result[tableCol] = transform(p[tableCol]);
    }
  };

  if (entityName === 'inventory') {
    copyIfPresent('uuid', 'uuid');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('itemCode', 'item_code');
    copyIfPresent('itemName', 'item_name');
    copyIfPresent('itemType', 'item_type');
    copyIfPresent('categoryCode', 'category_code');
    copyIfPresent('baseUom', 'base_uom');
    copyIfPresent('openingStock', 'opening_stock', v => parseFloat(v) || 0);
    copyIfPresent('reorderLevel', 'reorder_level', v => parseFloat(v) || 0);
    copyIfPresent('unitValuation', 'unit_valuation', v => parseFloat(v) || 0);
    copyIfPresent('defaultLocationCode', 'default_location_code');
    copyIfPresent('defaultSupplierCode', 'default_supplier_code');
    copyIfPresent('version', 'version', v => parseInt(v) || 1);
    copyIfPresent('status', 'status');
    copyIfPresent('active', 'status', v => (v === false ? 'INACTIVE' : (v === true ? 'ACTIVE' : v)));
  } else if (entityName === 'tenants') {
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('name', 'name');
    copyIfPresent('legalName', 'legal_name');
    copyIfPresent('adminName', 'admin_name');
    copyIfPresent('adminPin', 'admin_pin');
    copyIfPresent('profileVersion', 'profile_version');
  } else if (entityName === 'suppliers') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('supplierCode', 'supplier_code');
    copyIfPresent('supplierName', 'supplier_name');
    copyIfPresent('primaryContact', 'primary_contact');
    copyIfPresent('phone', 'phone');
    copyIfPresent('email', 'email');
    copyIfPresent('gstin', 'gstin');
    copyIfPresent('status', 'status');
  } else if (entityName === 'purchase_orders') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('poNumber', 'po_number');
    copyIfPresent('supplierCode', 'supplier_code');
    copyIfPresent('supplierName', 'supplier_name');
    copyIfPresent('status', 'status');
    copyIfPresent('grandTotal', 'total_amount', v => parseFloat(v) || 0);
    copyIfPresent('totalAmount', 'total_amount', v => parseFloat(v) || 0);
  } else if (entityName === 'goods_receipt_notes' || entityName === 'goods_received_notes') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('grnNumber', 'grn_number');
    copyIfPresent('poNumber', 'po_number');
    copyIfPresent('supplierCode', 'supplier_code');
    copyIfPresent('status', 'status');
    copyIfPresent('totalReceivedValue', 'total_received_value', v => parseFloat(v) || 0);
  } else if (entityName === 'kitchen_menu_items') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('itemCode', 'item_code');
    copyIfPresent('itemName', 'item_name');
    copyIfPresent('category', 'category');
    copyIfPresent('description', 'description');
    copyIfPresent('sellingPrice', 'selling_price', v => parseFloat(v) || 0);
    copyIfPresent('taxProfile', 'tax_profile');
    copyIfPresent('dietaryType', 'dietary_type');
    copyIfPresent('portionSize', 'portion_size');
    copyIfPresent('availabilityStatus', 'availability_status');
    copyIfPresent('lifecycleStatus', 'lifecycle_status');
    copyIfPresent('recipeId', 'recipe_id');
    copyIfPresent('routing', 'routing');
    copyIfPresent('recipeNotes', 'recipe_notes');
    copyIfPresent('spicinessLevel', 'spiciness_level');
    copyIfPresent('region', 'region');
    result.updated_at = new Date().toISOString();
    const rawData = p.data || p;
    const unnested = (rawData && rawData.data && typeof rawData.data === 'object') ? { ...rawData.data, ...rawData } : { ...rawData };
    delete unnested.data;
    result.data = {
      ...unnested,
      ...(result.recipe_id !== undefined ? { recipeId: result.recipe_id } : {}),
      ...(result.availability_status !== undefined ? { availabilityStatus: result.availability_status } : {}),
      ...(result.lifecycle_status !== undefined ? { lifecycleStatus: result.lifecycle_status } : {})
    };
  } else if (entityName === 'recipes') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('recipeCode', 'recipe_code');
    copyIfPresent('recipeName', 'recipe_name');
    copyIfPresent('menuItemId', 'menu_item_id');
    copyIfPresent('version', 'version');
    copyIfPresent('status', 'status');
    copyIfPresent('yieldQuantity', 'yield_quantity', v => parseFloat(v) || 1);
    copyIfPresent('yieldUom', 'yield_uom');
    copyIfPresent('portionCount', 'portion_count', v => parseInt(v) || 1);
    copyIfPresent('prepTimeMinutes', 'prep_time_minutes', v => parseInt(v) || 15);
    copyIfPresent('cookTimeMinutes', 'cook_time_minutes', v => parseInt(v) || 15);
    copyIfPresent('totalCost', 'total_cost', v => parseFloat(v) || 0);
    copyIfPresent('costPerPortion', 'cost_per_portion', v => parseFloat(v) || 0);
    copyIfPresent('costSnapshotAtApproval', 'cost_snapshot_at_approval');
    copyIfPresent('instructions', 'instructions');
    result.updated_at = new Date().toISOString();
    const rawData = p.data || p;
    const unnested = (rawData && rawData.data && typeof rawData.data === 'object') ? { ...rawData.data, ...rawData } : { ...rawData };
    delete unnested.data;
    result.data = {
      ...unnested,
      ...(result.status !== undefined ? { status: result.status } : {}),
      ...(result.total_cost !== undefined ? { totalCost: result.total_cost } : {}),
      ...(result.cost_per_portion !== undefined ? { costPerPortion: result.cost_per_portion } : {}),
      ...(p.variantId ? { variantId: p.variantId } : {}),
      ...(p.variantName ? { variantName: p.variantName } : {}),
      ...(p.ingredients ? { ingredients: p.ingredients } : {}),
      ...(p.glassware ? { glassware: p.glassware } : {}),
      ...(p.instructions ? { instructions: p.instructions } : {})
    };
  } else if (entityName === 'stock_balances') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('locationCode', 'location_code');
    copyIfPresent('itemCode', 'item_code');
    copyIfPresent('quantity', 'quantity', v => parseFloat(v) || 0);
    copyIfPresent('unitCost', 'unit_cost', v => parseFloat(v) || 0);
    copyIfPresent('valuation', 'valuation', v => parseFloat(v) || 0);
    result.updated_at = new Date().toISOString();
    // Synchronize embedded data payload and unnest any legacy recursive data wrappers
    if (result.quantity !== undefined || result.valuation !== undefined) {
      const rawData = p.data || p;
      const unnested = (rawData && rawData.data && typeof rawData.data === 'object') ? { ...rawData.data, ...rawData } : { ...rawData };
      delete unnested.data;
      result.data = {
        ...unnested,
        ...(result.quantity !== undefined ? { quantity: result.quantity } : {}),
        ...(result.valuation !== undefined ? { valuation: result.valuation } : {})
      };
    }
  } else if (entityName === 'orders') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('orderNumber', 'order_number');
    copyIfPresent('tableId', 'table_id');
    copyIfPresent('tableCode', 'table_id');
    copyIfPresent('waiterId', 'waiter_id');
    copyIfPresent('orderStatus', 'status');
    copyIfPresent('status', 'status');
    copyIfPresent('totalAmount', 'total_amount', v => parseFloat(v) || 0);
    copyIfPresent('items', 'items');
    result.data = {
      ...(p.data || p),
      ...(result.status ? { status: result.status, orderStatus: result.status } : {}),
      ...(result.items ? { items: result.items } : {}),
      ...(p.tickets ? { tickets: p.tickets } : {})
    };
  } else if (entityName === 'table_sessions') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('tableNumber', 'table_number', v => parseInt(v) || null);
    copyIfPresent('tableCode', 'table_code');
    copyIfPresent('status', 'status');
    copyIfPresent('billStatus', 'bill_status');
    result.data = {
      ...(p.data || p),
      ...(result.status ? { status: result.status } : {}),
      ...(result.bill_status ? { billStatus: result.bill_status, bill_status: result.bill_status } : {}),
      ...(result.table_code ? { tableCode: result.table_code, table_code: result.table_code } : {})
    };
  } else if (entityName === 'bill_revisions') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('sessionId', 'session_id');
    copyIfPresent('billNumber', 'bill_number');
    copyIfPresent('revisionNumber', 'revision_number', v => parseInt(v) || 1);
    copyIfPresent('grandTotal', 'grand_total', v => parseFloat(v) || 0);
    copyIfPresent('revisionStatus', 'revision_status');
    copyIfPresent('invoiceStatus', 'invoice_status');
    copyIfPresent('paymentStatus', 'payment_status');
    result.data = {
      ...(p.data || p),
      ...(result.revision_status ? { revisionStatus: result.revision_status, status: result.revision_status } : {}),
      ...(result.invoice_status ? { invoiceStatus: result.invoice_status } : {}),
      ...(result.payment_status ? { paymentStatus: result.payment_status } : {})
    };
  } else if (entityName === 'orders') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('orderNumber', 'order_number');
    copyIfPresent('tableId', 'table_id');
    copyIfPresent('tableCode', 'table_id');
    copyIfPresent('waiterId', 'waiter_id');
    copyIfPresent('status', 'status');
    copyIfPresent('totalAmount', 'total_amount', v => parseFloat(v) || 0);
    if (p.items !== undefined) result.items = Array.isArray(p.items) ? p.items : (p.data?.items || []);
    
    const existingData = (p.data && typeof p.data === 'object') ? p.data : {};
    const sId = p.sessionId || p.session_id || existingData.sessionId || existingData.session_id;
    result.data = {
      ...existingData,
      ...(sId ? { sessionId: sId, session_id: sId } : {}),
      ...(p.tableNumber ? { tableNumber: p.tableNumber } : {}),
      ...(p.tableCode ? { tableCode: p.tableCode } : {}),
      ...(p.status ? { status: p.status, orderStatus: p.status } : {}),
      ...(p.items ? { items: p.items } : {}),
      ...(p.tickets ? { tickets: p.tickets } : {})
    };
  } else if (entityName === 'invoices') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('sessionId', 'session_id');
    copyIfPresent('invoiceNumber', 'invoice_number');
    copyIfPresent('billNumber', 'bill_number');
    copyIfPresent('grandTotal', 'grand_total', v => parseFloat(v) || 0);
    copyIfPresent('status', 'status');
    result.data = { ...(p.data || p), ...(result.status ? { status: result.status } : {}) };
  } else if (entityName === 'payments') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('sessionId', 'session_id');
    copyIfPresent('billNumber', 'bill_number');
    copyIfPresent('invoiceNumber', 'invoice_number');
    copyIfPresent('amount', 'amount', v => parseFloat(v) || 0);
    copyIfPresent('paymentMethod', 'payment_method');
    copyIfPresent('status', 'status');
    result.data = { ...(p.data || p), ...(result.status ? { status: result.status } : {}) };
  } else if (entityName === 'stock_transfers') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('transferNumber', 'transfer_number');
    copyIfPresent('transferNo', 'transfer_number');
    copyIfPresent('transfer_no', 'transfer_number');
    copyIfPresent('fromLocationCode', 'from_location_code');
    copyIfPresent('toLocationCode', 'to_location_code');
    copyIfPresent('status', 'status');
  } else if (entityName === 'stock_issues') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('issueNumber', 'issue_number');
    copyIfPresent('issueNo', 'issue_number');
    copyIfPresent('issue_no', 'issue_number');
    copyIfPresent('locationCode', 'location_code');
    copyIfPresent('department', 'department');
    copyIfPresent('status', 'status');
  } else if (entityName === 'stock_adjustments') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('adjustmentNumber', 'adjustment_number');
    copyIfPresent('adjustmentNo', 'adjustment_number');
    copyIfPresent('adjustment_no', 'adjustment_number');
    copyIfPresent('locationCode', 'location_code');
    copyIfPresent('reason', 'reason');
    copyIfPresent('status', 'status');
  } else if (entityName === 'stock_counts') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('countNumber', 'count_number');
    copyIfPresent('countNo', 'count_number');
    copyIfPresent('count_no', 'count_number');
    copyIfPresent('locationCode', 'location_code');
    copyIfPresent('status', 'status');
  } else if (entityName === 'stock_operations') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('operationId', 'operation_id');
    copyIfPresent('operationType', 'operation_type');
    copyIfPresent('status', 'status');
    copyIfPresent('referenceType', 'reference_type');
    copyIfPresent('referenceId', 'reference_id');
    copyIfPresent('referenceLineId', 'reference_line_id');
    copyIfPresent('recipeId', 'recipe_id');
    copyIfPresent('recipeVersion', 'recipe_version');
    copyIfPresent('occurredAt', 'occurred_at');
    copyIfPresent('performedBy', 'performed_by');
    copyIfPresent('metadata', 'metadata');
  } else if (entityName === 'stock_transactions') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('operationId', 'operation_id');
    copyIfPresent('transactionType', 'transaction_type');
    copyIfPresent('status', 'status');
    copyIfPresent('itemCode', 'item_code');
    copyIfPresent('itemName', 'item_name');
    copyIfPresent('locationCode', 'location_code');
    copyIfPresent('quantity', 'quantity', v => parseFloat(v) || 0);
    copyIfPresent('uom', 'uom');
    copyIfPresent('unitCost', 'unit_cost', v => parseFloat(v) || 0);
    copyIfPresent('totalCost', 'total_cost', v => parseFloat(v) || 0);
    copyIfPresent('reversalOfOperationId', 'reversal_of_operation_id');
    copyIfPresent('reversalReason', 'reversal_reason');
    copyIfPresent('occurredAt', 'occurred_at');
    copyIfPresent('performedBy', 'performed_by');
  } else if (entityName === 'inventory_categories' || entityName === 'categories') {
    copyIfPresent('id', 'id');
    copyIfPresent('tenantId', 'tenant_id');
    copyIfPresent('categoryCode', 'category_code');
    copyIfPresent('categoryName', 'category_name');
    copyIfPresent('categoryType', 'category_type');
    if (p.data !== undefined) {
      result.data = p.data;
    } else {
      const currentData = {};
      if (p.productFamilyCode || p.product_family_code) currentData.productFamilyCode = p.productFamilyCode || p.product_family_code;
      if (p.productFamilyName || p.product_family_name) currentData.productFamilyName = p.productFamilyName || p.product_family_name;
      if (p.defaultUom || p.default_uom) currentData.defaultUom = p.defaultUom || p.default_uom;
      if (p.status) currentData.status = p.status;
      if (p.description) currentData.description = p.description;
      if (Object.keys(currentData).length > 0) result.data = currentData;
    }
  } else {
    Object.keys(p).forEach(k => {
      result[k] = p[k];
    });
  }

  if (Object.keys(result).length === 0) {
    return { ...p };
  }

  return result;
}
