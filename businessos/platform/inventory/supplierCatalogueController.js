/**
 * BusinessOS Platform - Supplier Catalogue Import Controller
 * Decoupled domain engine handling Supplier Catalogue CSV parsing, composite key validation
 * (supplier_code + item_code), structured pack math (pack_quantity + pack_uom), FK validation
 * against Suppliers Master & Inventory Master, single preferred supplier per item enforcement,
 * side-by-side diff generation, atomic commitment, error report export, price history tracking,
 * and live Supabase Cloud DB / DataGateway exports.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

export class SupplierCatalogueController {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.offlineStore = deps.offlineStore || offlineStore;
  }

  _getDataGateway() {
    if (this.dataGateway) return this.dataGateway;
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      return window.__APP__.platform.dataGateway;
    }
    return null;
  }

  _getCollection(collectionName, tenantId) {
    let list = [];
    const gw = this._getDataGateway();
    if (gw && typeof gw.getCachedCollection === 'function') {
      list = gw.getCachedCollection(collectionName, tenantId);
      if (!Array.isArray(list) || list.length === 0) {
        const altName = collectionName === 'supplier_catalogue' ? 'supplier_catalog' : 'supplier_catalogue';
        list = gw.getCachedCollection(altName, tenantId);
      }
    }
    if (!Array.isArray(list) || list.length === 0) {
      const store = this.offlineStore || offlineStore;
      list = store.getCollection(collectionName) || [];
      if (!Array.isArray(list) || list.length === 0) {
        const altName = collectionName === 'supplier_catalogue' ? 'supplier_catalog' : 'supplier_catalogue';
        list = store.getCollection(altName) || [];
      }
    }
    if (!tenantId) return list;
    return list.filter(i => !i.tenantId || i.tenantId === tenantId || i.tenant_id === tenantId);
  }

  /**
   * Returns canonical default Supplier Catalogue fixture.
   */
  getDefaultCatalogue() {
    return [
      { supplierCode: 'SUP-001', itemCode: 'RM0309', supplierSku: 'ON-50', supplierItemName: 'Fresh Farm Onion', purchaseUom: 'BAG', packQuantity: 50, packUom: 'KG', unitPrice: 2000, gstRate: 5, moq: 1, leadTimeDays: 2, preferred: true, active: true },
      { supplierCode: 'SUP-001', itemCode: 'RM0310', supplierSku: 'TOM-25', supplierItemName: 'Fresh Farm Tomato', purchaseUom: 'CRATE', packQuantity: 25, packUom: 'KG', unitPrice: 1250, gstRate: 5, moq: 1, leadTimeDays: 2, preferred: true, active: true },
      { supplierCode: 'SUP-002', itemCode: 'RM0202', supplierSku: 'SUR-10', supplierItemName: 'Coastal Surmai Fish', purchaseUom: 'BOX', packQuantity: 10, packUom: 'KG', unitPrice: 9500, gstRate: 5, moq: 1, leadTimeDays: 1, preferred: true, active: true },
      { supplierCode: 'SUP-003', itemCode: 'BAR-RUM-WHT', supplierSku: 'WR-750', supplierItemName: 'White Rum Premium', purchaseUom: 'BOTTLE_750ML', packQuantity: 750, packUom: 'ML', unitPrice: 1200, gstRate: null, moq: 1, leadTimeDays: 1, preferred: true, active: true }
    ];
  }

  /**
   * Parses raw CSV text into structured rows.
   * @param {string} csvContent 
   * @returns {Array<Object>} Parsed row objects
   */
  parseCsv(csvContent = '') {
    const lines = csvContent.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = this._parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = this._parseCsvLine(lines[i]);
      if (parts.length === 0) continue;

      const rowObj = { _rowNum: i + 1 };
      headers.forEach((h, idx) => {
        rowObj[h] = parts[idx] ? parts[idx].trim() : '';
      });
      rows.push(rowObj);
    }
    return rows;
  }

  _parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  }

  /**
   * Validates supplier catalogue CSV rows against Master Data rules.
   * Enforces composite key uniqueness, FK references to Suppliers Master & Inventory Master,
   * structured pack math, and explicit price checks.
   * @param {Array<Object>} rows 
   * @param {string} tenantId 
   * @returns {Object} Validation summary { isValid, errors [], warnings [] }
   */
  validateRows(rows = [], tenantId = 'tenant-demo') {
    const errors = [];
    const warnings = [];
    const seenCompositeKeys = new Map();

    const existingSuppliers = this._getCollection('suppliers', tenantId);
    const validSupplierCodes = new Set(existingSuppliers.map(s => (s.supplierCode || s.supplier_code || s.code || s.id || '').toUpperCase()));

    const existingItems = this._getCollection('inventory', tenantId);
    const validItemCodes = new Set(existingItems.map(i => (i.itemCode || i.item_code || i.sku || i.code || i.id || '').toUpperCase()));

    rows.forEach(row => {
      const rowNum = row._rowNum;
      const supplierCode = String(row.supplier_code || row.suppliercode || row.supplier_id || '').trim().toUpperCase();
      const itemCode = String(row.item_code || row.itemcode || row.item_id || '').trim().toUpperCase();
      const purchaseUom = String(row.purchase_uom || row.purchaseuom || row.uom || '').trim().toUpperCase();
      const rawPackQty = String(row.pack_quantity !== undefined ? row.pack_quantity : (row.packquantity !== undefined ? row.packquantity : (row.pack_qty !== undefined ? row.pack_qty : ''))).trim();
      const packUom = String(row.pack_uom || row.packuom || '').trim().toUpperCase();
      const rawPrice = String(row.unit_price !== undefined ? row.unit_price : (row.unitprice !== undefined ? row.unitprice : (row.price !== undefined ? row.price : (row.catalogue_price !== undefined ? row.catalogue_price : '')))).trim();
      const rawGst = String(row.gst_rate !== undefined ? row.gst_rate : (row.gstrate !== undefined ? row.gstrate : (row.gst !== undefined ? row.gst : ''))).trim();

      const compositeKey = `${supplierCode}::${itemCode}`;

      // 1. Mandatory Supplier Code Check & FK Validation
      if (!supplierCode) {
        errors.push({ row: rowNum, supplierCode: 'MISSING', itemCode, field: 'supplier_code', message: 'Missing mandatory supplier_code.' });
      } else if (!validSupplierCodes.has(supplierCode)) {
        errors.push({
          row: rowNum,
          supplierCode,
          itemCode,
          field: 'supplier_code',
          message: `Referenced supplier_code "${supplierCode}" does not exist in Suppliers Master. Please create supplier first.`
        });
      }

      // 2. Mandatory Item Code Check & FK Validation (ABSOLUTE BOUNDARY)
      if (!itemCode) {
        errors.push({ row: rowNum, supplierCode, itemCode: 'MISSING', field: 'item_code', message: 'Missing mandatory item_code.' });
      } else if (!validItemCodes.has(itemCode)) {
        errors.push({
          row: rowNum,
          supplierCode,
          itemCode,
          field: 'item_code',
          message: `Referenced item_code "${itemCode}" does not exist in Inventory Master. Catalogue import cannot auto-create inventory items.`
        });
      }

      // 3. In-File Duplicate Composite Key Check (HARD ERROR BLOCK)
      if (supplierCode && itemCode) {
        if (seenCompositeKeys.has(compositeKey)) {
          const prevRow = seenCompositeKeys.get(compositeKey);
          errors.push({
            row: rowNum,
            supplierCode,
            itemCode,
            field: 'composite_key',
            message: `Duplicate supplier catalogue mapping for "${supplierCode} + ${itemCode}" found in file (Row ${prevRow} and Row ${rowNum}). In-file duplicate mappings are blocked.`
          });
        } else {
          seenCompositeKeys.set(compositeKey, rowNum);
        }
      }

      // 4. Mandatory Purchase UOM Check
      if (!purchaseUom) {
        errors.push({ row: rowNum, supplierCode, itemCode, field: 'purchase_uom', message: 'Missing mandatory purchase_uom (e.g., BAG, BOX, BOTTLE_750ML).' });
      }

      // 5. Structured Pack Size Validation (pack_quantity + pack_uom)
      const packQtyNum = parseFloat(rawPackQty);
      if (!rawPackQty || isNaN(packQtyNum) || packQtyNum <= 0) {
        errors.push({ row: rowNum, supplierCode, itemCode, field: 'pack_quantity', message: 'Missing or invalid pack_quantity. Must be a positive number (e.g., 50, 25, 750).' });
      }
      if (!packUom) {
        errors.push({ row: rowNum, supplierCode, itemCode, field: 'pack_uom', message: 'Missing mandatory pack_uom symbol (e.g., KG, ML, PCS).' });
      }

      // 6. Unit Price Validation
      const priceNum = parseFloat(rawPrice);
      if (!rawPrice || isNaN(priceNum) || priceNum < 0) {
        errors.push({ row: rowNum, supplierCode, itemCode, field: 'unit_price', message: 'Missing or invalid unit_price. Must be a non-negative number.' });
      }

      // 7. No Fake GST Tax Defaults Warning
      if (!rawGst) {
        warnings.push({
          row: rowNum,
          supplierCode,
          itemCode,
          field: 'gst_rate',
          message: 'GST rate not specified in CSV. Tax will remain unassigned until explicitly confirmed by operator.'
        });
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      totalRows: rows.length
    };
  }

  /**
   * Computes incremental diff breakdown for Supplier Catalogue.
   * Enforces 1-preferred-supplier-per-item rule preview.
   * @param {Array<Object>} rows 
   * @param {string} tenantId 
   * @returns {Object} Diff Summary { NEW [], UPDATED [], UNCHANGED [], ERRORS [] }
   */
  generateDiffPreview(rows = [], tenantId = 'tenant-demo') {
    const existingCatalogue = this._getCollection('supplier_catalogue', tenantId);
    const existingMap = new Map(existingCatalogue.map(c => [`${(c.supplierCode || c.supplier_code).toUpperCase()}::${(c.itemCode || c.item_code).toUpperCase()}`, c]));

    const validation = this.validateRows(rows, tenantId);
    const errorRows = new Set(validation.errors.map(e => e.row));

    const diff = {
      NEW: [],
      UPDATED: [],
      UNCHANGED: [],
      ERRORS: validation.errors
    };

    rows.forEach(row => {
      if (errorRows.has(row._rowNum)) return;

      const supplierCode = String(row.supplier_code || row.suppliercode || row.supplier_id || '').trim().toUpperCase();
      const itemCode = String(row.item_code || row.itemcode || row.item_id || '').trim().toUpperCase();
      const sku = String(row.supplier_sku || row.suppliersku || row.sku || itemCode).trim();
      const name = String(row.supplier_item_name || row.supplieritemname || row.name || '').trim();
      const purchaseUom = String(row.purchase_uom || row.purchaseuom || row.uom || '').trim().toUpperCase();
      const packQty = parseFloat(row.pack_quantity || row.packquantity || row.pack_qty) || 1;
      const packUom = String(row.pack_uom || row.packuom || 'KG').trim().toUpperCase();
      const price = parseFloat(row.unit_price !== undefined ? row.unit_price : (row.unitprice !== undefined ? row.unitprice : (row.price !== undefined ? row.price : (row.catalogue_price || 0)))) || 0;
      const rawGst = String(row.gst_rate !== undefined ? row.gst_rate : (row.gstrate !== undefined ? row.gstrate : (row.gst !== undefined ? row.gst : ''))).trim();
      const gstRate = rawGst !== '' ? parseFloat(rawGst) : null;
      const moq = parseInt(row.moq, 10) || 1;
      const leadTimeDays = parseInt(row.lead_time_days || row.leadtime, 10) || 2;
      const preferred = String(row.preferred !== undefined ? row.preferred : '').trim() !== '' ? (String(row.preferred).toLowerCase() !== 'false') : true;
      const active = String(row.active !== undefined ? row.active : '').trim() !== '' ? (String(row.active).toLowerCase() !== 'false') : true;

      const compositeKey = `${supplierCode}::${itemCode}`;
      const existing = existingMap.get(compositeKey);

      if (!existing) {
        diff.NEW.push({
          supplierCode,
          itemCode,
          supplierSku: sku,
          supplierItemName: name || itemCode,
          purchaseUom,
          packQuantity: packQty,
          packUom,
          unitPrice: price,
          gstRate,
          moq,
          leadTimeDays,
          preferred,
          active
        });
      } else {
        const exSku = existing.supplierSku || existing.supplier_sku || '';
        const exName = existing.supplierItemName || existing.supplier_item_name || '';
        const exUom = existing.purchaseUom || existing.purchase_uom || '';
        const exPackQty = parseFloat(existing.packQuantity || existing.pack_quantity || 1);
        const exPackUom = existing.packUom || existing.pack_uom || 'KG';
        const exPrice = parseFloat(existing.unitPrice || existing.unit_price || existing.cataloguePrice || 0);
        const exGst = existing.gstRate !== undefined ? existing.gstRate : (existing.gst_rate !== undefined ? existing.gst_rate : null);
        const exMoq = parseInt(existing.moq || 1, 10);
        const exLead = parseInt(existing.leadTimeDays || existing.lead_time_days || 2, 10);
        const exPref = existing.preferred !== false;
        const exAct = existing.active !== false;

        const fieldChanges = [];

        if (sku && sku !== exSku) fieldChanges.push({ field: 'Supplier SKU', existing: exSku, import: sku });
        if (name && name !== exName) fieldChanges.push({ field: 'Supplier Item Name', existing: exName, import: name });
        if (purchaseUom && purchaseUom !== exUom) fieldChanges.push({ field: 'Purchase UOM', existing: exUom, import: purchaseUom });
        if (packQty && packQty !== exPackQty) fieldChanges.push({ field: 'Pack Quantity', existing: exPackQty, import: packQty });
        if (packUom && packUom !== exPackUom) fieldChanges.push({ field: 'Pack UOM', existing: exPackUom, import: packUom });
        if (price !== exPrice) fieldChanges.push({ field: 'Catalogue Unit Price', existing: `₹${exPrice}`, import: `₹${price}` });
        if (gstRate !== exGst) fieldChanges.push({ field: 'GST Rate', existing: exGst !== null ? `${exGst}%` : 'Unassigned', import: gstRate !== null ? `${gstRate}%` : 'Unassigned' });
        if (moq !== exMoq) fieldChanges.push({ field: 'MOQ', existing: exMoq, import: moq });
        if (leadTimeDays !== exLead) fieldChanges.push({ field: 'Lead Time Days', existing: `${exLead} days`, import: `${leadTimeDays} days` });
        if (preferred !== exPref) fieldChanges.push({ field: 'Preferred Supplier', existing: exPref ? 'Yes' : 'No', import: preferred ? 'Yes' : 'No' });

        if (fieldChanges.length > 0) {
          diff.UPDATED.push({
            supplierCode,
            itemCode,
            supplierSku: sku || exSku,
            fieldChanges
          });
        } else {
          diff.UNCHANGED.push({
            supplierCode,
            itemCode
          });
        }
      }
    });

    return diff;
  }

  /**
   * Commits supplier catalogue package atomically to live database store.
   * Enforces single preferred supplier per item code across catalogue collection.
   * Maintains Catalogue Price History.
   * @param {Array<Object>} rows 
   * @param {string} tenantId 
   * @returns {Object} Commit report
   */
  async commitImport(rows = [], tenantId = 'tenant-demo') {
    const validation = this.validateRows(rows, tenantId);
    if (!validation.isValid) {
      throw new Error(`[Atomic Commit Blocked] ${validation.errors.length} validation error(s) must be resolved before committing.`);
    }

    const diff = this.generateDiffPreview(rows, tenantId);
    const existingCatalogue = this._getCollection('supplier_catalogue', tenantId);
    const catalogueMap = new Map(existingCatalogue.map(c => [`${(c.supplierCode || c.supplier_code).toUpperCase()}::${(c.itemCode || c.item_code).toUpperCase()}`, c]));

    let createdCount = 0;
    let updatedCount = 0;

    rows.forEach(row => {
      const supplierCode = String(row.supplier_code || row.suppliercode || row.supplier_id || '').trim().toUpperCase();
      const itemCode = String(row.item_code || row.itemcode || row.item_id || '').trim().toUpperCase();
      const sku = String(row.supplier_sku || row.suppliersku || row.sku || itemCode).trim();
      const name = String(row.supplier_item_name || row.supplieritemname || row.name || '').trim();
      const purchaseUom = String(row.purchase_uom || row.purchaseuom || row.uom || '').trim().toUpperCase();
      const packQty = parseFloat(row.pack_quantity || row.packquantity || row.pack_qty) || 1;
      const packUom = String(row.pack_uom || row.packuom || 'KG').trim().toUpperCase();
      const price = parseFloat(row.unit_price !== undefined ? row.unit_price : (row.unitprice !== undefined ? row.unitprice : (row.price !== undefined ? row.price : (row.catalogue_price || 0)))) || 0;
      const rawGst = String(row.gst_rate !== undefined ? row.gst_rate : (row.gstrate !== undefined ? row.gstrate : (row.gst !== undefined ? row.gst : ''))).trim();
      const gstRate = rawGst !== '' ? parseFloat(rawGst) : null;
      const moq = parseInt(row.moq, 10) || 1;
      const leadTimeDays = parseInt(row.lead_time_days || row.leadtime, 10) || 2;
      const preferred = String(row.preferred !== undefined ? row.preferred : '').trim() !== '' ? (String(row.preferred).toLowerCase() !== 'false') : true;
      const active = String(row.active !== undefined ? row.active : '').trim() !== '' ? (String(row.active).toLowerCase() !== 'false') : true;

      const compositeKey = `${supplierCode}::${itemCode}`;
      const existing = catalogueMap.get(compositeKey);

      // Price History Entry
      let priceHistory = existing && Array.isArray(existing.priceHistory) ? [...existing.priceHistory] : [];
      const exPrice = existing ? parseFloat(existing.unitPrice || existing.unit_price || 0) : null;

      if (exPrice !== null && exPrice !== price) {
        priceHistory.push({
          effectiveFrom: new Date().toISOString(),
          previousPrice: exPrice,
          newPrice: price,
          source: 'CATALOGUE_IMPORT'
        });
      }

      const record = {
        id: existing ? existing.id : `cat-${supplierCode.toLowerCase()}-${itemCode.toLowerCase()}`,
        tenantId,
        tenant_id: tenantId,
        supplierCode,
        supplier_code: supplierCode,
        itemCode,
        item_code: itemCode,
        supplierSku: sku || (existing ? existing.supplierSku : itemCode),
        supplier_sku: sku || (existing ? existing.supplier_sku : itemCode),
        supplierItemName: name || (existing ? existing.supplierItemName : itemCode),
        supplier_item_name: name || (existing ? existing.supplier_item_name : itemCode),
        purchaseUom: purchaseUom || (existing ? existing.purchaseUom : 'BAG'),
        purchase_uom: purchaseUom || (existing ? existing.purchase_uom : 'BAG'),
        packQuantity: packQty || (existing ? existing.packQuantity : 1),
        pack_quantity: packQty || (existing ? existing.pack_quantity : 1),
        packUom: packUom || (existing ? existing.packUom : 'KG'),
        pack_uom: packUom || (existing ? existing.pack_uom : 'KG'),
        unitPrice: price !== undefined ? price : (existing ? existing.unitPrice : 0),
        unit_price: price !== undefined ? price : (existing ? existing.unit_price : 0),
        cataloguePrice: price,
        gstRate: gstRate !== null ? gstRate : (existing ? existing.gstRate : null),
        gst_rate: gstRate !== null ? gstRate : (existing ? existing.gst_rate : null),
        moq: moq || (existing ? existing.moq : 1),
        leadTimeDays: leadTimeDays || (existing ? existing.leadTimeDays : 2),
        lead_time_days: leadTimeDays || (existing ? existing.lead_time_days : 2),
        preferred: preferred,
        active: active,
        priceHistory,
        updatedAt: new Date().toISOString()
      };

      if (!existing) createdCount++;
      else updatedCount++;

      catalogueMap.set(compositeKey, record);
    });

    let updatedList = Array.from(catalogueMap.values());

    // 1-PREFERRED-SUPPLIER-PER-ITEM ENFORCEMENT
    // Group records by itemCode and ensure only the latest preferred item remains preferred = true
    const itemPreferredMap = new Map();
    updatedList.forEach(rec => {
      if (rec.preferred) {
        itemPreferredMap.set(rec.itemCode, rec.supplierCode);
      }
    });

    updatedList = updatedList.map(rec => {
      const preferredSupplier = itemPreferredMap.get(rec.itemCode);
      if (preferredSupplier && preferredSupplier !== rec.supplierCode && rec.preferred) {
        return { ...rec, preferred: false };
      }
      return rec;
    });

    const store = this.offlineStore || offlineStore;
    store.setCollection('supplier_catalogue', updatedList);

    const gw = this._getDataGateway();
    if (gw && typeof gw.setCollection === 'function') {
      await gw.setCollection('supplier_catalogue', updatedList);
    }

    return {
      importId: `IMP-CAT-${Date.now()}`,
      timestamp: new Date().toISOString(),
      tenantId,
      createdCount,
      updatedCount,
      unchangedCount: diff.UNCHANGED.length,
      rejectedCount: 0,
      totalCommitted: createdCount + updatedCount
    };
  }

  /**
   * Generates downloadable CSV Error Report.
   * @param {Array<Object>} errors 
   * @returns {string} CSV error report text
   */
  generateErrorReportCsv(errors = []) {
    let csv = 'row,supplier_code,item_code,field,error_message\n';
    errors.forEach(err => {
      csv += `${err.row},"${err.supplierCode || ''}","${err.itemCode || ''}","${err.field || ''}","${err.message || ''}"\n`;
    });
    return csv;
  }

  /**
   * Generates downloadable canonical CSV template for Supplier Catalogue.
   * @returns {string} CSV template text
   */
  generateTemplateCsv() {
    return 'supplier_code,item_code,supplier_sku,supplier_item_name,purchase_uom,pack_quantity,pack_uom,unit_price,gst_rate,moq,lead_time_days,preferred,active\n' +
      'SUP-001,RM0309,ON-50,"Fresh Farm Onion",BAG,50,KG,2000,5,1,2,true,true\n' +
      'SUP-001,RM0310,TOM-25,"Fresh Farm Tomato",CRATE,25,KG,1250,5,1,2,true,true\n' +
      'SUP-002,RM0202,SUR-10,"Coastal Surmai Fish",BOX,10,KG,9500,5,1,1,true,true\n' +
      'SUP-003,BAR-RUM-WHT,WR-750,"White Rum Premium",BOTTLE_750ML,750,ML,1200,,1,1,true,true\n';
  }

  /**
   * Exports live Supplier Catalogue from database as canonical CSV.
   * @param {string} tenantId 
   * @returns {string} CSV export text
   */
  exportLiveCatalogueCsv(tenantId = 'tenant-demo') {
    let catalogue = this._getCollection('supplier_catalogue', tenantId);
    if (!catalogue || catalogue.length === 0) {
      catalogue = this.getDefaultCatalogue();
    }

    let csv = 'supplier_code,item_code,supplier_sku,supplier_item_name,purchase_uom,pack_quantity,pack_uom,unit_price,gst_rate,moq,lead_time_days,preferred,active\n';
    catalogue.forEach(c => {
      const supCode = c.supplierCode || c.supplier_code || '';
      const itemCode = c.itemCode || c.item_code || '';
      const sku = c.supplierSku || c.supplier_sku || '';
      const name = (c.supplierItemName || c.supplier_item_name || '').replace(/"/g, '""');
      const uom = c.purchaseUom || c.purchase_uom || '';
      const packQty = c.packQuantity || c.pack_quantity || 1;
      const packUom = c.packUom || c.pack_uom || 'KG';
      const price = c.unitPrice !== undefined ? c.unitPrice : (c.unit_price !== undefined ? c.unit_price : 0);
      const gst = c.gstRate !== undefined && c.gstRate !== null ? c.gstRate : (c.gst_rate !== undefined && c.gst_rate !== null ? c.gst_rate : '');
      const moq = c.moq || 1;
      const lead = c.leadTimeDays || c.lead_time_days || 2;
      const pref = c.preferred !== false;
      const act = c.active !== false;

      csv += `"${supCode}","${itemCode}","${sku}","${name}","${uom}",${packQty},"${packUom}",${price},"${gst}",${moq},${lead},${pref},${act}\n`;
    });
    return csv;
  }
}

export const supplierCatalogueController = new SupplierCatalogueController();
