/**
 * BusinessOS Platform - Pure Inventory Master Import Controller (Frozen Contract)
 * Handles parsing, schema validation, mandatory field enforcement (code, name, type, base_uom),
 * conditional UOM conversion rules, in-file duplicate error blocking, side-by-side diff generation,
 * incremental update value preservation (keeping existing DB values for blank CSV cells),
 * atomic commitment, error report CSV generation, and live Supabase Cloud DB / DataGateway exports.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

export class InventoryImportController {
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
    } else if (gw && typeof gw.getCollection === 'function') {
      list = gw.getCollection(collectionName, tenantId);
    }
    if (!Array.isArray(list) || list.length === 0) {
      const store = this.offlineStore || offlineStore;
      list = store.getCollection(collectionName) || [];
      if ((!list || list.length === 0) && (collectionName === 'inventory' || collectionName === 'inventory_items')) {
        const altName = collectionName === 'inventory' ? 'inventory_items' : 'inventory';
        list = store.getCollection(altName) || [];
      }
    }
    if (!tenantId) return list;
    return list.filter(i => !i.tenantId || i.tenantId === tenantId || i.tenant_id === tenantId);
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
   * Validates parsed CSV rows against Frozen Inventory Master Schema rules.
   * @param {Array<Object>} rows 
   * @param {string} tenantId 
   * @returns {Object} Validation summary { isValid, errors [], warnings [] }
   */
  validateRows(rows = [], tenantId = 'tenant-demo') {
    const errors = [];
    const warnings = [];
    const seenInFileCodes = new Map();

    const existingItems = this._getCollection('inventory', tenantId);
    const existingCodeMap = new Map(existingItems.map(i => [(i.itemCode || i.item_code || i.sku || i.code || i.id || '').toUpperCase(), i]));

    rows.forEach(row => {
      const rowNum = row._rowNum;
      const itemCode = String(row.item_code || row.itemcode || row.code || '').trim().toUpperCase();
      const itemName = String(row.item_name || row.itemname || row.name || '').trim();
      const itemType = String(row.item_type || row.itemtype || row.type || '').trim();
      const rawCategory = String(row.category || row.category_code || '').trim();
      const rawBaseUom = String(row.base_uom || row.baseuom || row.baseunit || '').trim();
      const rawPurchaseUom = String(row.purchase_uom || row.purchaseuom || row.purchaseunit || '').trim();
      const rawConvFactor = String(row.conversion_factor || row.conversionfactor || '').trim();
      const rawReorderLevel = String(row.reorder_level || row.reorderlevel || '').trim();

      const existing = existingCodeMap.get(itemCode);

      // 1. Mandatory Item Code Check
      if (!itemCode) {
        errors.push({ row: rowNum, itemCode: 'MISSING', field: 'item_code', message: 'Missing mandatory item_code.' });
      }

      // 2. In-File Duplicate Check (HARD ERROR BLOCK)
      if (itemCode) {
        if (seenInFileCodes.has(itemCode)) {
          const prevRow = seenInFileCodes.get(itemCode);
          errors.push({
            row: rowNum,
            itemCode,
            field: 'item_code',
            message: `Duplicate item_code "${itemCode}" found in file (Row ${prevRow} and Row ${rowNum}). In-file duplicates must be resolved before importing.`
          });
        } else {
          seenInFileCodes.set(itemCode, rowNum);
        }
      }

      // 3. Mandatory Item Name Check (Only if NEW record or explicit update)
      if (!itemName && !existing) {
        errors.push({ row: rowNum, itemCode, field: 'item_name', message: 'Missing mandatory item_name for new inventory record.' });
      }

      // 4. Mandatory Item Type Check
      if (!itemType && !existing) {
        errors.push({ row: rowNum, itemCode, field: 'item_type', message: 'Missing mandatory item_type (e.g., RAW_MATERIAL, SEMI_FINISHED, PACKAGING).' });
      }

      // 5. Mandatory Base UOM Check
      if (!rawBaseUom && !existing) {
        errors.push({ row: rowNum, itemCode, field: 'base_uom', message: 'Missing mandatory base_uom (e.g., KG, LTR, PCS, G, ML). Never guess base UOM.' });
      }

      // 6. Conditional Purchase UOM & Conversion Factor Logic
      const effectiveBaseUom = rawBaseUom || (existing ? (existing.baseUom || existing.base_uom) : '');
      const effectivePurchUom = rawPurchaseUom || (existing ? (existing.purchaseUom || existing.purchase_uom) : effectiveBaseUom);

      if (effectiveBaseUom && effectivePurchUom) {
        const isSameUom = effectiveBaseUom.toUpperCase() === effectivePurchUom.toUpperCase();
        if (isSameUom) {
          if (rawConvFactor && Number(rawConvFactor) !== 1) {
            warnings.push({
              row: rowNum,
              itemCode,
              field: 'conversion_factor',
              message: `Purchase UOM (${effectivePurchUom}) equals Base UOM (${effectiveBaseUom}). Conversion factor has been normalized to 1.`
            });
          }
        } else {
          // Different UOMs: Conversion factor is MANDATORY
          if (!rawConvFactor && !existing) {
            errors.push({
              row: rowNum,
              itemCode,
              field: 'conversion_factor',
              message: `Conversion factor is mandatory when Purchase UOM (${effectivePurchUom}) differs from Base UOM (${effectiveBaseUom}). Cannot guess conversion factor.`
            });
          } else if (rawConvFactor && (isNaN(rawConvFactor) || Number(rawConvFactor) <= 0)) {
            errors.push({
              row: rowNum,
              itemCode,
              field: 'conversion_factor',
              message: 'Conversion factor must be a positive number greater than 0.'
            });
          }
        }
      }

      // 7. Optional Category Warning for NEW records
      if (!rawCategory && !existing) {
        warnings.push({
          row: rowNum,
          itemCode,
          field: 'category',
          message: 'Category is missing. Defaulted to "GENERAL".'
        });
      }

      // 8. Reorder Level Numeric Check
      if (rawReorderLevel && (isNaN(rawReorderLevel) || Number(rawReorderLevel) < 0)) {
        errors.push({ row: rowNum, itemCode, field: 'reorder_level', message: 'Reorder level must be a non-negative number.' });
      }

      // 9. Strictly Prohibited Columns Check
      if (row.supplier || row.supplier_id || row.supplier_sku || row.purchase_price || row.last_purchase_price) {
        warnings.push({
          row: rowNum,
          itemCode,
          field: 'supplier_or_price',
          message: 'Supplier mapping and pricing columns are ignored on Inventory Master import (managed by Supplier Catalogue).'
        });
      }

      if (row.current_stock || row.opening_stock || row.stock_balance) {
        warnings.push({
          row: rowNum,
          itemCode,
          field: 'opening_stock',
          message: 'Stock balance columns are ignored on Inventory Master import (managed by Opening Stock workflow).'
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
   * Computes incremental diff breakdown and side-by-side row comparisons.
   * Preserves existing DB values for blank CSV cells on UPDATE records.
   * @param {Array<Object>} rows 
   * @param {string} tenantId 
   * @returns {Object} Diff Summary { NEW [], UPDATED [], UNCHANGED [], ERRORS [] }
   */
  generateDiffPreview(rows = [], tenantId = 'tenant-demo') {
    const existingItems = this._getCollection('inventory', tenantId);
    const existingMap = new Map(existingItems.map(i => [(i.itemCode || i.item_code || i.sku || i.code || i.id || '').toUpperCase(), i]));

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

      const itemCode = String(row.item_code || row.itemcode || row.code || '').trim().toUpperCase();
      const rawName = String(row.item_name || row.itemname || row.name || '').trim();
      const rawType = String(row.item_type || row.itemtype || row.type || '').trim();
      const rawCat = String(row.category || row.category_code || '').trim();
      const rawBaseUom = String(row.base_uom || row.baseuom || row.baseunit || '').trim();
      const rawPurchUom = String(row.purchase_uom || row.purchaseuom || row.purchaseunit || '').trim();
      const rawConvFactor = row.conversion_factor !== undefined ? String(row.conversion_factor).trim() : (row.conversionfactor !== undefined ? String(row.conversionfactor).trim() : '');
      const rawReorderLevel = row.reorder_level !== undefined ? String(row.reorder_level).trim() : (row.reorderlevel !== undefined ? String(row.reorderlevel).trim() : '');

      const existing = existingMap.get(itemCode);

      if (!existing) {
        // NEW Record
        const itemName = rawName;
        const itemType = rawType || 'RAW_MATERIAL';
        const category = rawCat || 'GENERAL';
        const baseUom = rawBaseUom || 'KG';
        const purchaseUom = rawPurchUom || baseUom;
        let convFactor = Number(rawConvFactor || 1);
        if (baseUom.toUpperCase() === purchaseUom.toUpperCase()) convFactor = 1;
        const reorderLevel = Number(rawReorderLevel || 0);

        diff.NEW.push({
          itemCode,
          itemName,
          itemType,
          category,
          baseUom,
          purchaseUom,
          conversionFactor: convFactor,
          reorderLevel
        });
      } else {
        // EXISTING Record: Preserve existing values for blank cells
        const exName = existing.itemName || existing.item_name || existing.name || '';
        const exType = existing.itemType || existing.item_type || existing.type || 'RAW_MATERIAL';
        const exCat = existing.categoryCode || existing.category || 'GENERAL';
        const exBaseUom = existing.baseUom || existing.base_uom || existing.baseUnit || 'KG';
        const exPurchUom = existing.purchaseUom || existing.purchase_uom || existing.purchaseUnit || exBaseUom;
        const exConv = Number(existing.conversionFactor || existing.conversion_factor || 1);
        const exReorder = Number(existing.reorderLevel || existing.reorder_level || 0);

        const fieldChanges = [];

        if (rawName && rawName !== exName) fieldChanges.push({ field: 'Item Name', existing: exName, import: rawName });
        if (rawType && rawType !== exType) fieldChanges.push({ field: 'Item Type', existing: exType, import: rawType });
        if (rawCat && rawCat !== exCat) fieldChanges.push({ field: 'Category', existing: exCat, import: rawCat });
        if (rawBaseUom && rawBaseUom !== exBaseUom) fieldChanges.push({ field: 'Base UOM', existing: exBaseUom, import: rawBaseUom });
        if (rawPurchUom && rawPurchUom !== exPurchUom) fieldChanges.push({ field: 'Purchase UOM', existing: exPurchUom, import: rawPurchUom });

        const targetBaseUom = rawBaseUom || exBaseUom;
        const targetPurchUom = rawPurchUom || exPurchUom;
        let targetConv = rawConvFactor ? Number(rawConvFactor) : exConv;
        if (targetBaseUom.toUpperCase() === targetPurchUom.toUpperCase()) targetConv = 1;

        if (rawConvFactor && targetConv !== exConv) {
          fieldChanges.push({ field: 'Conversion Factor', existing: `${exConv} (${exPurchUom} → ${exBaseUom})`, import: `${targetConv} (${targetPurchUom} → ${targetBaseUom})` });
        }

        if (rawReorderLevel && Number(rawReorderLevel) !== exReorder) {
          fieldChanges.push({ field: 'Reorder Level', existing: `${exReorder} ${exBaseUom}`, import: `${Number(rawReorderLevel)} ${targetBaseUom}` });
        }

        if (fieldChanges.length > 0) {
          diff.UPDATED.push({
            itemCode,
            itemName: rawName || exName,
            fieldChanges
          });
        } else {
          diff.UNCHANGED.push({
            itemCode,
            itemName: exName
          });
        }
      }
    });

    return diff;
  }

  /**
   * Commits package atomically to live database store.
   * Preserves existing DB values for blank CSV cells on UPDATE records.
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
    const existingItems = this._getCollection('inventory', tenantId);
    const itemMap = new Map(existingItems.map(i => [(i.itemCode || i.item_code || i.sku || i.code || i.id || '').toUpperCase(), i]));

    let createdCount = 0;
    let updatedCount = 0;

    rows.forEach(row => {
      const itemCode = String(row.item_code || row.itemcode || row.code || '').trim().toUpperCase();
      const rawName = String(row.item_name || row.itemname || row.name || '').trim();
      const rawType = String(row.item_type || row.itemtype || row.type || '').trim();
      const rawCat = String(row.category || row.category_code || '').trim();
      const rawBaseUom = String(row.base_uom || row.baseuom || row.baseunit || '').trim();
      const rawPurchUom = String(row.purchase_uom || row.purchaseuom || row.purchaseunit || '').trim();
      const rawConvFactor = row.conversion_factor !== undefined ? String(row.conversion_factor).trim() : (row.conversionfactor !== undefined ? String(row.conversionfactor).trim() : '');
      const rawReorderLevel = row.reorder_level !== undefined ? String(row.reorder_level).trim() : (row.reorderlevel !== undefined ? String(row.reorderlevel).trim() : '');
      const rawActive = String(row.active !== undefined ? row.active : '').trim();

      const existing = itemMap.get(itemCode);

      // Value Resolution Logic (Preserves Existing Value for Blank CSV Cell)
      const itemName = rawName || (existing ? (existing.itemName || existing.item_name || existing.name) : '');
      const itemType = rawType || (existing ? (existing.itemType || existing.item_type || existing.type) : 'RAW_MATERIAL');
      const category = rawCat || (existing ? (existing.categoryCode || existing.category) : 'GENERAL');
      const baseUom = rawBaseUom || (existing ? (existing.baseUom || existing.base_uom || existing.baseUnit) : 'KG');
      const purchaseUom = rawPurchUom || (existing ? (existing.purchaseUom || existing.purchase_uom || existing.purchaseUnit) : baseUom);

      let convFactor = rawConvFactor ? Number(rawConvFactor) : (existing ? Number(existing.conversionFactor || existing.conversion_factor || 1) : 1);
      if (baseUom.toUpperCase() === purchaseUom.toUpperCase()) convFactor = 1;

      const reorderLevel = rawReorderLevel !== '' ? Number(rawReorderLevel) : (existing ? Number(existing.reorderLevel || existing.reorder_level || 0) : 0);
      const active = rawActive !== '' ? (rawActive.toLowerCase() !== 'false') : (existing ? (existing.active !== false) : true);

      const record = {
        id: existing ? existing.id : `inv-${itemCode.toLowerCase()}`,
        tenantId,
        tenant_id: tenantId,
        itemCode,
        item_code: itemCode,
        sku: itemCode,
        itemName,
        item_name: itemName,
        name: itemName,
        itemType,
        item_type: itemType,
        type: itemType,
        categoryCode: category,
        category,
        category_code: category,
        baseUom,
        base_uom: baseUom,
        baseUnit: baseUom,
        purchaseUom,
        purchase_uom: purchaseUom,
        purchaseUnit: purchaseUom,
        conversionFactor: convFactor,
        conversion_factor: convFactor,
        reorderLevel,
        reorder_level: reorderLevel,
        active,
        status: active ? 'ACTIVE' : 'INACTIVE',
        updatedAt: new Date().toISOString()
      };

      if (!existing) createdCount++;
      else updatedCount++;

      itemMap.set(itemCode, record);
    });

    const updatedList = Array.from(itemMap.values());
    const store = this.offlineStore || offlineStore;
    store.setCollection('inventory', updatedList);
    store.setCollection('inventory_items', updatedList);

    const gw = this._getDataGateway();
    if (gw && typeof gw.setCollection === 'function') {
      await gw.setCollection('inventory', updatedList);
      await gw.setCollection('inventory_items', updatedList);
    }

    return {
      importId: `IMP-${Date.now()}`,
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
    let csv = 'row,item_code,field,error_message\n';
    errors.forEach(err => {
      csv += `${err.row},"${err.itemCode || ''}","${err.field || ''}","${err.message || ''}"\n`;
    });
    return csv;
  }

  /**
   * Generates downloadable canonical CSV template.
   * @returns {string} CSV template text
   */
  generateTemplateCsv() {
    return 'item_code,item_name,item_type,category,base_uom,purchase_uom,conversion_factor,reorder_level,active\n' +
      'RM0309,"Onions",RAW_MATERIAL,PRODUCE,KG,BAG,50,20,true\n' +
      'RM0310,"Tomatoes",RAW_MATERIAL,PRODUCE,KG,CRATE,25,20,true\n' +
      'RM0409,"Ghee",RAW_MATERIAL,DAIRY,KG,TIN,15,5,true\n';
  }

  /**
   * Exports live inventory items from database as canonical CSV.
   * @param {string} tenantId 
   * @returns {string} CSV export text
   */
  exportLiveInventoryCsv(tenantId = 'tenant-demo') {
    let items = this._getCollection('inventory', tenantId);
    if (!items || items.length === 0) {
      items = this._getCollection('inventory_items', tenantId);
    }

    let csv = 'item_code,item_name,item_type,category,base_uom,purchase_uom,conversion_factor,reorder_level,active\n';
    items.forEach(i => {
      const code = i.itemCode || i.item_code || i.sku || i.code || i.id || '';
      const name = i.itemName || i.item_name || i.name || '';
      const type = i.itemType || i.item_type || i.type || 'RAW_MATERIAL';
      const cat = i.categoryCode || i.category_code || i.category || 'GENERAL';
      const base = i.baseUom || i.base_uom || i.baseUnit || 'KG';
      const purch = i.purchaseUom || i.purchase_uom || i.purchaseUnit || base;
      let conv = Number(i.conversionFactor !== undefined ? i.conversionFactor : (i.conversion_factor !== undefined ? i.conversion_factor : 1));
      if (base.toUpperCase() === purch.toUpperCase()) conv = 1;

      const reorder = Number(i.reorderLevel !== undefined ? i.reorderLevel : (i.reorder_level !== undefined ? i.reorder_level : 0));
      const active = i.active !== false;

      csv += `"${code}","${name}",${type},${cat},${base},${purch},${conv},${reorder},${active}\n`;
    });
    return csv;
  }
}

export const inventoryImportController = new InventoryImportController();
