/**
 * BusinessOS Platform - Inventory Categories & Product Families Combined Taxonomy Controller
 * Handles unified parsing, schema validation, Product Family FK validation, in-file duplicate detection,
 * side-by-side diff generation, atomic commitment, error report CSV generation, and live Supabase exports.
 * 
 * Supports unified taxonomy CSV schema (PRODUCT_FAMILY + CATEGORY record types).
 */

import { offlineStore } from '../offline_store/offlineStore.js';

export class CategoryImportController {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.offlineStore = deps.offlineStore || offlineStore;
  }

  _getCollection(collectionName, tenantId) {
    let list = [];
    if (this.dataGateway && typeof this.dataGateway.getCollection === 'function') {
      list = this.dataGateway.getCollection(collectionName, tenantId);
    }
    if (!Array.isArray(list) || list.length === 0) {
      const store = this.offlineStore || offlineStore;
      list = store.getCollection(collectionName) || [];
    }
    if (!tenantId) return list;
    return list.filter(i => !i.tenantId || i.tenantId === tenantId || i.tenant_id === tenantId);
  }

  /**
   * Returns canonical default Product Families.
   */
  getDefaultProductFamilies() {
    return [
      { code: 'FAM-MEAT', name: 'Meat & Poultry', description: 'Fresh chicken, mutton, beef, pork, and poultry cuts' },
      { code: 'FAM-SEAFOOD', name: 'Seafood', description: 'Fresh fish, prawns, crabs, and shellfish' },
      { code: 'FAM-PRODUCE', name: 'Fruits & Vegetables', description: 'Fresh vegetables, greens, herbs, and fruits' },
      { code: 'FAM-DAIRY', name: 'Dairy & Fats', description: 'Milk, butter, ghee, cheese, paneer, and cream' },
      { code: 'FAM-SPICES', name: 'Spices & Seasonings', description: 'Whole spices, ground spices, pastes, and seasonings' },
      { code: 'FAM-GRAINS', name: 'Grains & Staples', description: 'Rice, wheat flour, pulses, dals, and grains' },
      { code: 'FAM-CONDIMENTS', name: 'Cooking Oils & Condiments', description: 'Oils, sauces, dressings, and condiments' },
      { code: 'FAM-BEVERAGES', name: 'Beverages & Soft Drinks', description: 'Juices, syrups, carbonated drinks, tea, and coffee' },
      { code: 'FAM-LIQUOR', name: 'Bar Spirits & Liquor', description: 'Spirits, wine, beer, liqueurs, and cocktail mixers' },
      { code: 'FAM-SUPPLIES', name: 'Packaging & Supplies', description: 'Takeaway boxes, bags, cutlery, and hygiene supplies' }
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
   * Validates taxonomy CSV rows (handles PRODUCT_FAMILY and CATEGORY record types).
   * Enforces Product Family FK validation for categories against both DB and in-file families.
   * @param {Array<Object>} rows 
   * @param {string} tenantId 
   * @returns {Object} Validation summary { isValid, errors [], warnings [] }
   */
  validateRows(rows = [], tenantId = 'tenant-demo') {
    const errors = [];
    const warnings = [];
    const seenInFileCodes = new Map();

    const existingPfList = this._getCollection('product_families', tenantId);
    const validPfCodes = new Set(
      existingPfList.length > 0
        ? existingPfList.map(pf => (pf.code || pf.product_family_code || pf.id || '').toUpperCase())
        : this.getDefaultProductFamilies().map(pf => pf.code.toUpperCase())
    );

    // Harvest Product Family codes declared inside the file itself
    rows.forEach(r => {
      const rawType = (r.record_type || r.type || '').trim().toUpperCase();
      const code = (r.code || r.category_code || r.product_family_code || '').trim().toUpperCase();
      if (rawType === 'PRODUCT_FAMILY' || code.startsWith('PF-')) {
        if (code) validPfCodes.add(code);
      }
    });

    rows.forEach(row => {
      const rowNum = row._rowNum;
      const rawRecordType = (row.record_type || row.type || '').trim().toUpperCase();
      const code = (row.code || row.category_code || row.product_family_code || '').trim().toUpperCase();
      const name = (row.name || row.category_name || row.product_family_name || '').trim();
      const pfCode = (row.product_family_code || row.productfamilycode || row.family || '').trim().toUpperCase();
      const defaultUom = (row.default_base_uom || row.defaultuom || row.uom || 'KG').trim();

      const isProductFamily = rawRecordType === 'PRODUCT_FAMILY' || (code.startsWith('PF-') && !pfCode);

      if (isProductFamily) {
        // PRODUCT FAMILY VALIDATION
        if (!code) {
          errors.push({ row: rowNum, categoryCode: 'MISSING', field: 'code', message: 'Missing mandatory product family code.' });
        }
        if (code) {
          if (seenInFileCodes.has(`PF:${code}`)) {
            const prevRow = seenInFileCodes.get(`PF:${code}`);
            errors.push({
              row: rowNum,
              categoryCode: code,
              field: 'code',
              message: `Duplicate product family code "${code}" found in file (Row ${prevRow} and Row ${rowNum}). In-file duplicates must be resolved before importing.`
            });
          } else {
            seenInFileCodes.set(`PF:${code}`, rowNum);
          }
        }
        if (!name) {
          errors.push({ row: rowNum, categoryCode: code, field: 'name', message: 'Missing mandatory product family name.' });
        }
      } else {
        // CATEGORY VALIDATION
        if (!code) {
          errors.push({ row: rowNum, categoryCode: 'MISSING', field: 'category_code', message: 'Missing mandatory category_code.' });
        }
        if (code) {
          if (seenInFileCodes.has(`CAT:${code}`)) {
            const prevRow = seenInFileCodes.get(`CAT:${code}`);
            errors.push({
              row: rowNum,
              categoryCode: code,
              field: 'category_code',
              message: `Duplicate category_code "${code}" found in file (Row ${prevRow} and Row ${rowNum}). In-file duplicates must be resolved before importing.`
            });
          } else {
            seenInFileCodes.set(`CAT:${code}`, rowNum);
          }
        }
        if (!name) {
          errors.push({ row: rowNum, categoryCode: code, field: 'category_name', message: 'Missing mandatory category_name.' });
        }
        if (!pfCode) {
          errors.push({ row: rowNum, categoryCode: code, field: 'product_family_code', message: 'Missing mandatory product_family_code (e.g., PF-MEAT, PF-PROD, PF-DAIRY).' });
        } else if (!validPfCodes.has(pfCode)) {
          errors.push({
            row: rowNum,
            categoryCode: code,
            field: 'product_family_code',
            message: `Invalid product_family_code "${pfCode}". Referenced Product Family does not exist in master catalog.`
          });
        }
        if (!defaultUom) {
          warnings.push({
            row: rowNum,
            categoryCode: code,
            field: 'default_base_uom',
            message: 'Default base UOM is missing. Defaulted to "KG".'
          });
        }
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
   * Computes incremental diff breakdown and side-by-side row comparisons for combined taxonomy.
   * @param {Array<Object>} rows 
   * @param {string} tenantId 
   * @returns {Object} Diff Summary { NEW [], UPDATED [], UNCHANGED [], ERRORS [] }
   */
  generateDiffPreview(rows = [], tenantId = 'tenant-demo') {
    const existingCats = this._getCollection('inventory_categories', tenantId);
    const catMap = new Map(existingCats.map(c => [(c.categoryCode || c.category_code || c.code || c.id || '').toUpperCase(), c]));

    const existingPfs = this._getCollection('product_families', tenantId);
    const pfMap = new Map(existingPfs.map(p => [(p.code || p.product_family_code || p.id || '').toUpperCase(), p]));

    const validation = this.validateRows(rows, tenantId);
    const errorRows = new Set(validation.errors.map(e => e.row));

    const diff = {
      NEW: [],
      UPDATED: [],
      UNCHANGED: [],
      ERRORS: validation.errors,
      familyCount: 0,
      categoryCount: 0
    };

    rows.forEach(row => {
      if (errorRows.has(row._rowNum)) return;

      const rawRecordType = (row.record_type || row.type || '').trim().toUpperCase();
      const code = (row.code || row.category_code || row.product_family_code || '').trim().toUpperCase();
      const name = (row.name || row.category_name || row.product_family_name || '').trim();
      const pfCode = (row.product_family_code || row.productfamilycode || row.family || '').trim().toUpperCase();
      const rawUom = (row.default_base_uom || row.defaultuom || row.uom || '').trim();
      const rawActive = (row.active || '').trim();
      const desc = (row.description || '').trim();

      const isProductFamily = rawRecordType === 'PRODUCT_FAMILY' || (code.startsWith('PF-') && !pfCode);

      if (isProductFamily) {
        diff.familyCount++;
        const existing = pfMap.get(code);
        if (!existing) {
          diff.NEW.push({
            recordType: 'PRODUCT_FAMILY',
            code,
            name,
            categoryCode: code,
            categoryName: name,
            productFamilyCode: 'FAMILY',
            description: desc,
            active: rawActive !== '' ? (rawActive.toLowerCase() !== 'false') : true
          });
        } else {
          const exName = existing.name || existing.product_family_name || '';
          const fieldChanges = [];
          if (name && name !== exName) fieldChanges.push({ field: 'Family Name', existing: exName, import: name });

          if (fieldChanges.length > 0) {
            diff.UPDATED.push({ recordType: 'PRODUCT_FAMILY', code, categoryCode: code, name: name || exName, categoryName: name || exName, fieldChanges });
          } else {
            diff.UNCHANGED.push({ recordType: 'PRODUCT_FAMILY', code, categoryCode: code, name: exName, categoryName: exName });
          }
        }
      } else {
        diff.categoryCount++;
        const existing = catMap.get(code);
        if (!existing) {
          diff.NEW.push({
            recordType: 'CATEGORY',
            code,
            name,
            categoryCode: code,
            categoryName: name,
            productFamilyCode: pfCode,
            defaultBaseUom: rawUom || 'KG',
            active: rawActive !== '' ? (rawActive.toLowerCase() !== 'false') : true
          });
        } else {
          const exName = existing.categoryName || existing.category_name || existing.name || '';
          const exPfCode = existing.productFamilyCode || existing.product_family_code || 'FAM-PRODUCE';
          const exUom = existing.defaultBaseUom || existing.default_base_uom || 'KG';

          const fieldChanges = [];
          if (name && name !== exName) fieldChanges.push({ field: 'Category Name', existing: exName, import: name });
          if (pfCode && pfCode !== exPfCode) fieldChanges.push({ field: 'Product Family', existing: exPfCode, import: pfCode });
          if (rawUom && rawUom !== exUom) fieldChanges.push({ field: 'Default Base UOM', existing: exUom, import: rawUom });

          if (fieldChanges.length > 0) {
            diff.UPDATED.push({ recordType: 'CATEGORY', categoryCode: code, categoryName: name || exName, fieldChanges });
          } else {
            diff.UNCHANGED.push({ recordType: 'CATEGORY', categoryCode: code, categoryName: exName });
          }
        }
      }
    });

    return diff;
  }

  /**
   * Commits combined taxonomy package atomically to live database store.
   * Upserts Product Families first, then Categories.
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

    const existingCats = this._getCollection('inventory_categories', tenantId);
    const catMap = new Map(existingCats.map(c => [(c.categoryCode || c.category_code || c.code || c.id || '').toUpperCase(), c]));

    const existingPfs = this._getCollection('product_families', tenantId);
    const pfMap = new Map(existingPfs.map(p => [(p.code || p.product_family_code || p.id || '').toUpperCase(), p]));

    let createdCount = 0;
    let updatedCount = 0;

    rows.forEach(row => {
      const rawRecordType = (row.record_type || row.type || '').trim().toUpperCase();
      const code = (row.code || row.category_code || row.product_family_code || '').trim().toUpperCase();
      const name = (row.name || row.category_name || row.product_family_name || '').trim();
      const pfCode = (row.product_family_code || row.productfamilycode || row.family || '').trim().toUpperCase();
      const rawUom = (row.default_base_uom || row.defaultuom || row.uom || '').trim();
      const rawActive = (row.active || '').trim();
      const desc = (row.description || '').trim();

      const isProductFamily = rawRecordType === 'PRODUCT_FAMILY' || (code.startsWith('PF-') && !pfCode);

      if (isProductFamily) {
        const existing = pfMap.get(code);
        const record = {
          id: existing ? existing.id : `pf-${code.toLowerCase()}`,
          tenantId,
          tenant_id: tenantId,
          code,
          product_family_code: code,
          name: name || (existing ? existing.name : code),
          product_family_name: name || (existing ? existing.name : code),
          description: desc || (existing ? existing.description : ''),
          active: rawActive !== '' ? (rawActive.toLowerCase() !== 'false') : (existing ? (existing.active !== false) : true),
          updatedAt: new Date().toISOString()
        };
        if (!existing) createdCount++;
        else updatedCount++;
        pfMap.set(code, record);
      } else {
        const existing = catMap.get(code);
        const categoryName = name || (existing ? (existing.categoryName || existing.category_name || existing.name) : '');
        const productFamilyCode = pfCode || (existing ? (existing.productFamilyCode || existing.product_family_code) : 'PF-PROD');
        const defaultBaseUom = rawUom || (existing ? (existing.defaultBaseUom || existing.default_base_uom) : 'KG');
        const active = rawActive !== '' ? (rawActive.toLowerCase() !== 'false') : (existing ? (existing.active !== false) : true);

        const record = {
          id: existing ? existing.id : `cat-${code.toLowerCase()}`,
          tenantId,
          tenant_id: tenantId,
          categoryCode: code,
          category_code: code,
          code,
          categoryName,
          category_name: categoryName,
          name: categoryName,
          productFamilyCode,
          product_family_code: productFamilyCode,
          defaultBaseUom,
          default_base_uom: defaultBaseUom,
          active,
          status: active ? 'ACTIVE' : 'INACTIVE',
          updatedAt: new Date().toISOString()
        };
        if (!existing) createdCount++;
        else updatedCount++;
        catMap.set(code, record);
      }
    });

    const store = this.offlineStore || offlineStore;

    const updatedPfList = Array.from(pfMap.values());
    store.setCollection('product_families', updatedPfList);
    if (this.dataGateway && typeof this.dataGateway.setCollection === 'function') {
      await this.dataGateway.setCollection('product_families', updatedPfList);
    }

    const updatedCatList = Array.from(catMap.values());
    store.setCollection('inventory_categories', updatedCatList);
    if (this.dataGateway && typeof this.dataGateway.setCollection === 'function') {
      await this.dataGateway.setCollection('inventory_categories', updatedCatList);
    }

    return {
      importId: `IMP-TAX-${Date.now()}`,
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
    let csv = 'row,code,field,error_message\n';
    errors.forEach(err => {
      csv += `${err.row},"${err.categoryCode || ''}","${err.field || ''}","${err.message || ''}"\n`;
    });
    return csv;
  }

  /**
   * Generates downloadable canonical CSV template for combined taxonomy.
   * @returns {string} CSV template text
   */
  generateTemplateCsv() {
    return 'record_type,code,name,product_family_code,default_base_uom,description,active\n' +
      'PRODUCT_FAMILY,PF-MEAT,"Meat & Poultry",,,"Fresh chicken, mutton, and poultry cuts",true\n' +
      'PRODUCT_FAMILY,PF-PROD,"Fruits & Vegetables",,,"Fresh produce, herbs, and fruits",true\n' +
      'CATEGORY,CAT-CHICKEN,"Chicken",PF-MEAT,KG,"Fresh chicken cuts",true\n' +
      'CATEGORY,CAT-VEG,"Fresh Vegetables",PF-PROD,KG,"Leafy and root vegetables",true\n' +
      'CATEGORY,CAT-DAIRY,"Butter & Ghee",PF-DAIRY,KG,"Dairy products and fats",true\n';
  }

  /**
   * Exports live combined inventory taxonomy (Product Families + Categories) as canonical CSV.
   * @param {string} tenantId 
   * @returns {string} CSV export text
   */
  exportLiveCategoriesCsv(tenantId = 'tenant-demo') {
    let pfs = this._getCollection('product_families', tenantId);
    if (!pfs || pfs.length === 0) pfs = this.getDefaultProductFamilies();

    const cats = this._getCollection('inventory_categories', tenantId);

    let csv = 'record_type,code,name,product_family_code,default_base_uom,description,active\n';

    // 1. Export Product Families
    pfs.forEach(p => {
      const code = p.code || p.product_family_code || p.id || '';
      const name = p.name || p.product_family_name || code;
      const desc = (p.description || '').replace(/"/g, '""');
      const active = p.active !== false;
      csv += `PRODUCT_FAMILY,"${code}","${name}",,,"${desc}",${active}\n`;
    });

    // 2. Export Categories
    cats.forEach(c => {
      const code = c.categoryCode || c.category_code || c.code || c.id || '';
      const name = (c.categoryName || c.category_name || c.name || '').replace(/"/g, '""');
      const pfCode = c.productFamilyCode || c.product_family_code || 'PF-PROD';
      const uom = c.defaultBaseUom || c.default_base_uom || 'KG';
      const active = c.active !== false;
      csv += `CATEGORY,"${code}","${name}",${pfCode},${uom},"",${active}\n`;
    });

    return csv;
  }
}

export const categoryImportController = new CategoryImportController();
