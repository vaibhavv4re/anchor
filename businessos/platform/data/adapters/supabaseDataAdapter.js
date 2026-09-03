/**
 * Supabase Cloud Data Adapter
 * Bridges DataGateway requests to live Supabase REST API endpoints.
 */
export class SupabaseDataAdapter {
  constructor(client) {
    this.client = client;
  }

  _resolveTable(collection) {
    if (collection === 'supplier_catalogue') return 'supplier_catalog';
    if (collection === 'inventory_items') return 'inventory';
    if (collection === 'categories') return 'inventory_categories';
    if (collection === 'goods_received_notes') return 'goods_receipt_notes';
    return collection;
  }

  async getCollection(collection, tenantId = null) {
    const targetTable = this._resolveTable(collection);
    const virtualCollections = [
      'roles', 'sessions', 'table_runtime_states',
      'stock_transactions', 'stock_requisitions', 'menu_catalog',
      'production_batches', 'devices', 'system_config'
    ];
    if (!this.client || virtualCollections.includes(targetTable)) return [];
    
    try {
      const res = await this.client.fetchTableData(targetTable);
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

        // Kitchen domain: kitchen_menu_items
        if (item.item_name && !item.itemName) item.itemName = item.item_name;
        if (item.selling_price !== undefined && item.sellingPrice === undefined) item.sellingPrice = parseFloat(item.selling_price);
        if (item.tax_profile && !item.taxProfile) item.taxProfile = item.tax_profile;
        if (item.dietary_type && !item.dietaryType) item.dietaryType = item.dietary_type;
        if (item.portion_size && !item.portionSize) item.portionSize = item.portion_size;
        if (item.availability_status && !item.availabilityStatus) item.availabilityStatus = item.availability_status;
        if (item.lifecycle_status && !item.lifecycleStatus) item.lifecycleStatus = item.lifecycle_status;
        if (item.recipe_id !== undefined && item.recipeId === undefined) item.recipeId = item.recipe_id;
        if (item.recipe_notes !== undefined && item.recipeNotes === undefined) item.recipeNotes = item.recipe_notes;
        if (item.spiciness_level && !item.spicinessLevel) item.spicinessLevel = item.spiciness_level;

        // Kitchen domain: recipes
        if (item.recipe_code && !item.recipeCode) item.recipeCode = item.recipe_code;
        if (item.recipe_name && !item.recipeName) item.recipeName = item.recipe_name;
        if (item.menu_item_id && !item.menuItemId) item.menuItemId = item.menu_item_id;
        if (item.menu_item_code && !item.menuItemCode) item.menuItemCode = item.menu_item_code;
        if (item.yield_quantity !== undefined && item.yieldQuantity === undefined) item.yieldQuantity = parseFloat(item.yield_quantity);
        if (item.yield_uom && !item.yieldUom) item.yieldUom = item.yield_uom;
        if (item.portion_count !== undefined && item.portionCount === undefined) item.portionCount = parseInt(item.portion_count);
        if (item.total_cost !== undefined && item.totalCost === undefined) item.totalCost = parseFloat(item.total_cost);
        if (item.cost_per_portion !== undefined && item.costPerPortion === undefined) item.costPerPortion = parseFloat(item.cost_per_portion);

        // Kitchen domain: recipe_ingredients
        if (item.inventory_item_code && !item.inventoryItemCode) item.inventoryItemCode = item.inventory_item_code;
        if (item.inventory_item_name && !item.inventoryItemName) item.inventoryItemName = item.inventory_item_name;
        if (item.unit_cost_snapshot !== undefined && item.unitCost === undefined) item.unitCost = parseFloat(item.unit_cost_snapshot);
        if (item.recipe_wastage_percent !== undefined && item.recipeWastagePercent === undefined) item.recipeWastagePercent = parseFloat(item.recipe_wastage_percent);
        if (item.line_cost !== undefined && item.lineCost === undefined) item.lineCost = parseFloat(item.line_cost);

        // Kitchen domain: orders
        if (collection === 'orders') {
          if (item.order_number && !item.orderNumber) item.orderNumber = item.order_number;
          if (item.table_code && !item.tableCode) item.tableCode = item.table_code;
          if (item.session_id && !item.sessionId) item.sessionId = item.session_id;
          if (!item.orderId) item.orderId = item.id;
          if (!item.tableNumber && item.tableCode) {
            item.tableNumber = parseInt(item.tableCode.replace(/\D/g, '')) || 1;
          }
          if (item.data && Array.isArray(item.data.items) && (!item.items || item.items.length === 0)) {
            item.items = item.data.items;
          }
          if (item.data && Array.isArray(item.data.tickets) && (!item.tickets || item.tickets.length === 0)) {
            item.tickets = item.data.tickets;
          }
          if (!item.totalAmount && item.total_amount) item.totalAmount = parseFloat(item.total_amount);
        }

        // Operational domain: table_sessions
        if (collection === 'table_sessions') {
          if (item.table_number && !item.tableNumber) item.tableNumber = parseInt(item.table_number);
          if (item.table_code && !item.tableCode) item.tableCode = item.table_code;
          if (item.assigned_waiter_id && !item.assignedWaiterId) item.assignedWaiterId = item.assigned_waiter_id;
          if (item.guest_count && !item.guestCount) item.guestCount = parseInt(item.guest_count);
          if (!item.sessionId) item.sessionId = item.id;
        }

        // Financial domain: bill_revisions
        if (collection === 'bill_revisions') {
          if (item.session_id && !item.sessionId) item.sessionId = item.session_id;
          if (item.bill_number && !item.billNumber) item.billNumber = item.bill_number;
          if (item.revision_number !== undefined && item.revisionNumber === undefined) item.revisionNumber = parseInt(item.revision_number);
          if (item.grand_total !== undefined && item.grandTotal === undefined) item.grandTotal = parseFloat(item.grand_total);
          if (item.revision_status && !item.revisionStatus) item.revisionStatus = item.revision_status;
          if (!item.revisionId) item.revisionId = item.id;
        }

        // Financial domain: invoices
        if (collection === 'invoices') {
          if (item.session_id && !item.sessionId) item.sessionId = item.session_id;
          if (item.invoice_number && !item.invoiceNumber) item.invoiceNumber = item.invoice_number;
          if (item.bill_number && !item.billNumber) item.billNumber = item.bill_number;
          if (item.grand_total !== undefined && item.grandTotal === undefined) item.grandTotal = parseFloat(item.grand_total);
        }

        // Financial domain: payments
        if (collection === 'payments') {
          if (item.session_id && !item.sessionId) item.sessionId = item.session_id;
          if (item.bill_number && !item.billNumber) item.billNumber = item.bill_number;
          if (item.invoice_number && !item.invoiceNumber) item.invoiceNumber = item.invoice_number;
          if (item.payment_method && !item.paymentMethod) item.paymentMethod = item.payment_method;
          if (!item.paymentId) item.paymentId = item.id;
        }

        // Inventory Requests domain: inventory_requests
        if (item.request_number && !item.requestNumber) item.requestNumber = item.request_number;
        if (item.request_number && !item.reqCode) item.reqCode = item.request_number;
        if (item.source_location && !item.sourceLocation) item.sourceLocation = item.source_location;
        if (item.destination_location && !item.destinationLocation) item.destinationLocation = item.destination_location;
        
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
    const targetTable = this._resolveTable(collection);
    if (!this.client || targetTable === 'roles' || targetTable === 'sessions') return record;
    try {
      const res = await this.client.createRecord(targetTable, record);
      return res.success ? (res.data || record) : record;
    } catch (e) {
      console.warn(`[SupabaseDataAdapter] Cloud create Record for ${targetTable} caught:`, e.message);
      return record;
    }
  }

  async update(collection, id, patch) {
    const targetTable = this._resolveTable(collection);
    if (!this.client || targetTable === 'roles' || targetTable === 'sessions') return patch;
    try {
      const res = await this.client.updateRecord(targetTable, id, patch);
      return res.success ? (res.data || patch) : patch;
    } catch (e) {
      console.warn(`[SupabaseDataAdapter] Cloud update Record for ${targetTable} caught:`, e.message);
      return patch;
    }
  }

  async delete(collection, id) {
    const targetTable = this._resolveTable(collection);
    if (!this.client || targetTable === 'roles' || targetTable === 'sessions') return true;
    try {
      const filter = targetTable === 'tenants' ? `tenant_id=eq.${id}` : `id=eq.${id}`;
      const res = await this.client.deleteRecords(targetTable, filter);
      return res.success;
    } catch (e) {
      console.warn(`[SupabaseDataAdapter] Cloud delete Record for ${targetTable} caught:`, e.message);
      return true;
    }
  }
}
