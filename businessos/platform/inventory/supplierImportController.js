/**
 * BusinessOS Platform - Suppliers Master Import Controller
 * Decoupled domain engine handling supplier CSV parsing, pure schema validation,
 * in-file duplicate error detection, side-by-side diff generation, atomic commitment,
 * error report CSV generation, and live Supabase Cloud DB / DataGateway exports.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

export class SupplierImportController {
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
   * Returns canonical default Suppliers fixture.
   */
  getDefaultSuppliers() {
    return [
      { code: 'SUP-001', name: 'Zai Local Produce', contactPerson: 'Zainab Khan', phone: '+91 98201 12345', email: 'zai@localproduce.com', address: '12 Market St, Mumbai', gstin: '27AAAFF1234A1Z5', active: true },
      { code: 'SUP-002', name: 'Coastal Fresh Seafood', contactPerson: 'Ramesh Naik', phone: '+91 98202 23456', email: 'orders@coastalseafood.in', address: 'Dock 4, Sassoon Docks, Mumbai', gstin: '27BBBFF2345B1Z6', active: true },
      { code: 'SUP-003', name: 'Beverage World Supplies', contactPerson: 'Vikram Mehta', phone: '+91 98203 34567', email: 'vikram@beverageworld.com', address: '88 Industrial Estate, Pune', gstin: '27CCCFF3456C1Z7', active: true },
      { code: 'SUP-004', name: 'Metro Meat & Poultry', contactPerson: 'Anil Deshmukh', phone: '+91 98204 45678', email: 'orders@metromeat.com', address: '45 Abattoir Rd, Thane', gstin: '27DDDFF4567D1Z8', active: true },
      { code: 'SUP-005', name: 'Apex Dairy & Packaging', contactPerson: 'Sanjay Patil', phone: '+91 98205 56789', email: 'sanjay@apexdairy.com', address: '102 MIDC, Navi Mumbai', gstin: '27EEEFF5678E1Z9', active: true }
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
   * Validates supplier CSV rows against Pure Supplier Master Schema.
   * @param {Array<Object>} rows 
   * @param {string} tenantId 
   * @returns {Object} Validation summary { isValid, errors [], warnings [] }
   */
  validateRows(rows = [], tenantId = 'tenant-demo') {
    const errors = [];
    const warnings = [];
    const seenInFileCodes = new Map();

    rows.forEach(row => {
      const rowNum = row._rowNum;
      const supplierCode = (row.supplier_code || row.suppliercode || row.code || '').trim().toUpperCase();
      const supplierName = (row.supplier_name || row.suppliername || row.name || '').trim();
      const gstin = (row.gstin || row.gst_number || row.tax_id || '').trim().toUpperCase();

      // 1. Mandatory Supplier Code Check
      if (!supplierCode) {
        errors.push({ row: rowNum, supplierCode: 'MISSING', field: 'supplier_code', message: 'Missing mandatory supplier_code.' });
      }

      // 2. In-File Duplicate Check (HARD ERROR BLOCK)
      if (supplierCode) {
        if (seenInFileCodes.has(supplierCode)) {
          const prevRow = seenInFileCodes.get(supplierCode);
          errors.push({
            row: rowNum,
            supplierCode,
            field: 'supplier_code',
            message: `Duplicate supplier_code "${supplierCode}" found in file (Row ${prevRow} and Row ${rowNum}). In-file duplicates must be resolved before importing.`
          });
        } else {
          seenInFileCodes.set(supplierCode, rowNum);
        }
      }

      // 3. Mandatory Supplier Name Check
      if (!supplierName) {
        errors.push({ row: rowNum, supplierCode, field: 'supplier_name', message: 'Missing mandatory supplier_name.' });
      }

      // 4. GSTIN Format Warning (Informational warning for 15-char Indian GSTIN pattern)
      if (gstin && gstin.length !== 15) {
        warnings.push({
          row: rowNum,
          supplierCode,
          field: 'gstin',
          message: `GSTIN "${gstin}" is not 15 characters long. Standard Indian GSTIN should be 15 alphanumeric characters.`
        });
      }

      // 5. Prohibited Catalogue Columns Warning
      if (row.item_code || row.purchase_price || row.pack_size || row.moq) {
        warnings.push({
          row: rowNum,
          supplierCode,
          field: 'catalogue_columns',
          message: 'Item mappings and pricing columns are ignored on Supplier Master import (managed by Supplier Catalogue).'
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
   * Computes incremental diff breakdown and side-by-side row comparisons for suppliers.
   * Preserves existing DB values for blank CSV cells on UPDATE records.
   * @param {Array<Object>} rows 
   * @param {string} tenantId 
   * @returns {Object} Diff Summary { NEW [], UPDATED [], UNCHANGED [], ERRORS [] }
   */
  generateDiffPreview(rows = [], tenantId = 'tenant-demo') {
    const existingSuppliers = this._getCollection('suppliers', tenantId);
    const existingMap = new Map(existingSuppliers.map(s => [(s.supplierCode || s.supplier_code || s.code || s.id || '').toUpperCase(), s]));

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

      const supplierCode = (row.supplier_code || row.suppliercode || row.code || '').trim().toUpperCase();
      const rawName = (row.supplier_name || row.suppliername || row.name || '').trim();
      const rawContact = (row.contact_person || row.contactperson || row.contact || '').trim();
      const rawPhone = (row.phone || row.contact_number || '').trim();
      const rawEmail = (row.email || '').trim();
      const rawAddress = (row.address || '').trim();
      const rawGstin = (row.gstin || row.gst_number || row.tax_id || '').trim().toUpperCase();
      const rawActive = (row.active || '').trim();

      const existing = existingMap.get(supplierCode);

      if (!existing) {
        // NEW Record
        diff.NEW.push({
          supplierCode,
          supplierName: rawName,
          contactPerson: rawContact,
          phone: rawPhone,
          email: rawEmail,
          address: rawAddress,
          gstin: rawGstin,
          active: rawActive !== '' ? (rawActive.toLowerCase() !== 'false') : true
        });
      } else {
        // EXISTING Record: Preserve existing values for blank cells
        const exName = existing.supplierName || existing.supplier_name || existing.name || '';
        const exContact = existing.contactPerson || existing.contact_person || existing.contact || '';
        const exPhone = existing.phone || existing.contact_number || '';
        const exEmail = existing.email || '';
        const exAddress = existing.address || '';
        const exGstin = existing.gstin || existing.gst_number || '';
        const exActive = existing.active !== false;

        const fieldChanges = [];

        if (rawName && rawName !== exName) fieldChanges.push({ field: 'Supplier Name', existing: exName, import: rawName });
        if (rawContact && rawContact !== exContact) fieldChanges.push({ field: 'Contact Person', existing: exContact, import: rawContact });
        if (rawPhone && rawPhone !== exPhone) fieldChanges.push({ field: 'Phone', existing: exPhone, import: rawPhone });
        if (rawEmail && rawEmail !== exEmail) fieldChanges.push({ field: 'Email', existing: exEmail, import: rawEmail });
        if (rawAddress && rawAddress !== exAddress) fieldChanges.push({ field: 'Address', existing: exAddress, import: rawAddress });
        if (rawGstin && rawGstin !== exGstin) fieldChanges.push({ field: 'GSTIN', existing: exGstin, import: rawGstin });
        if (rawActive !== '' && (rawActive.toLowerCase() !== 'false') !== exActive) {
          fieldChanges.push({ field: 'Status', existing: exActive ? 'Active' : 'Inactive', import: (rawActive.toLowerCase() !== 'false') ? 'Active' : 'Inactive' });
        }

        if (fieldChanges.length > 0) {
          diff.UPDATED.push({
            supplierCode,
            supplierName: rawName || exName,
            fieldChanges
          });
        } else {
          diff.UNCHANGED.push({
            supplierCode,
            supplierName: exName
          });
        }
      }
    });

    return diff;
  }

  /**
   * Commits supplier package atomically to live database store.
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
    const existingSuppliers = this._getCollection('suppliers', tenantId);
    const supplierMap = new Map(existingSuppliers.map(s => [(s.supplierCode || s.supplier_code || s.code || s.id || '').toUpperCase(), s]));

    let createdCount = 0;
    let updatedCount = 0;

    rows.forEach(row => {
      const supplierCode = (row.supplier_code || row.suppliercode || row.code || '').trim().toUpperCase();
      const rawName = (row.supplier_name || row.suppliername || row.name || '').trim();
      const rawContact = (row.contact_person || row.contactperson || row.contact || '').trim();
      const rawPhone = (row.phone || row.contact_number || '').trim();
      const rawEmail = (row.email || '').trim();
      const rawAddress = (row.address || '').trim();
      const rawGstin = (row.gstin || row.gst_number || row.tax_id || '').trim().toUpperCase();
      const rawActive = (row.active || '').trim();

      const existing = supplierMap.get(supplierCode);

      // Value Resolution Logic (Preserves Existing Value for Blank CSV Cell)
      const supplierName = rawName || (existing ? (existing.supplierName || existing.supplier_name || existing.name) : '');
      const contactPerson = rawContact || (existing ? (existing.contactPerson || existing.contact_person || existing.contact) : '');
      const phone = rawPhone || (existing ? (existing.phone || existing.contact_number) : '');
      const email = rawEmail || (existing ? existing.email : '');
      const address = rawAddress || (existing ? existing.address : '');
      const gstin = rawGstin || (existing ? (existing.gstin || existing.gst_number) : '');
      const active = rawActive !== '' ? (rawActive.toLowerCase() !== 'false') : (existing ? (existing.active !== false) : true);

      const record = {
        id: existing ? existing.id : `sup-${supplierCode.toLowerCase()}`,
        tenantId,
        tenant_id: tenantId,
        supplierCode,
        supplier_code: supplierCode,
        code: supplierCode,
        supplierName,
        supplier_name: supplierName,
        name: supplierName,
        contactPerson,
        contact_person: contactPerson,
        phone,
        contact_number: phone,
        email,
        address,
        gstin,
        gst_number: gstin,
        active,
        status: active ? 'ACTIVE' : 'INACTIVE',
        updatedAt: new Date().toISOString()
      };

      if (!existing) createdCount++;
      else updatedCount++;

      supplierMap.set(supplierCode, record);
    });

    const updatedList = Array.from(supplierMap.values());
    const store = this.offlineStore || offlineStore;
    store.setCollection('suppliers', updatedList);

    if (this.dataGateway && typeof this.dataGateway.setCollection === 'function') {
      await this.dataGateway.setCollection('suppliers', updatedList);
    }

    return {
      importId: `IMP-SUP-${Date.now()}`,
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
    let csv = 'row,supplier_code,field,error_message\n';
    errors.forEach(err => {
      csv += `${err.row},"${err.supplierCode || ''}","${err.field || ''}","${err.message || ''}"\n`;
    });
    return csv;
  }

  /**
   * Generates downloadable canonical CSV template for Suppliers Master.
   * @returns {string} CSV template text
   */
  generateTemplateCsv() {
    return 'supplier_code,supplier_name,contact_person,phone,email,address,gstin,active\n' +
      'SUP-001,"Zai Local Produce","Zainab Khan","+91 98201 12345","zai@localproduce.com","12 Market St, Mumbai","27AAAFF1234A1Z5",true\n' +
      'SUP-002,"Coastal Fresh Seafood","Ramesh Naik","+91 98202 23456","orders@coastalseafood.in","Dock 4, Sassoon Docks, Mumbai","27BBBFF2345B1Z6",true\n' +
      'SUP-003,"Beverage World Supplies","Vikram Mehta","+91 98203 34567","vikram@beverageworld.com","88 Industrial Estate, Pune","27CCCFF3456C1Z7",true\n';
  }

  /**
   * Exports live Suppliers Master from database as canonical CSV.
   * @param {string} tenantId 
   * @returns {string} CSV export text
   */
  exportLiveSuppliersCsv(tenantId = 'tenant-demo') {
    let suppliers = this._getCollection('suppliers', tenantId);
    if (!suppliers || suppliers.length === 0) {
      suppliers = this.getDefaultSuppliers();
    }

    let csv = 'supplier_code,supplier_name,contact_person,phone,email,address,gstin,active\n';
    suppliers.forEach(s => {
      const code = s.supplierCode || s.supplier_code || s.code || s.id || '';
      const name = (s.supplierName || s.supplier_name || s.name || '').replace(/"/g, '""');
      const contact = (s.contactPerson || s.contact_person || s.contact || '').replace(/"/g, '""');
      const phone = s.phone || s.contact_number || '';
      const email = s.email || '';
      const address = (s.address || '').replace(/"/g, '""');
      const gstin = s.gstin || s.gst_number || '';
      const active = s.active !== false;

      csv += `"${code}","${name}","${contact}","${phone}","${email}","${address}","${gstin}",${active}\n`;
    });
    return csv;
  }
}

export const supplierImportController = new SupplierImportController();
