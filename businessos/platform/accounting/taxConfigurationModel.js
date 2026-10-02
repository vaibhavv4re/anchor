/**
 * BusinessOS Platform - Centralized Tax Configuration Authority Engine
 * Single source of truth for restaurant tax rules (GST, State Liquor VAT, Service Charge, Cess, Tax Categories).
 * Consumed by POS, Billing, Inventory, Supplier AP, Expenses, and Tax Reports.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

export class TaxConfigurationModel {
  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  _getTenantId(providedTenantId = null) {
    if (providedTenantId) return providedTenantId;
    if (typeof sessionStorage !== 'undefined') {
      try {
        const session = JSON.parse(sessionStorage.getItem('ros_session') || '{}');
        return session.tenantId || 'tenant_h0qc7wf';
      } catch (_) {}
    }
    return 'tenant_h0qc7wf';
  }

  /**
   * Get default tax configuration schema
   */
  getDefaultConfiguration(tenantId = 'tenant_h0qc7wf') {
    return {
      tenantId,
      gstRegistration: {
        gstin: '27AAACR1234F1Z5',
        legalName: 'Anchor Harbour Hospitality Pvt Ltd',
        tradeName: 'Anchor Harbour Restaurant',
        stateCode: '27',
        stateName: 'Maharashtra',
        registrationType: 'Regular',
        effectiveFrom: '2026-04-01',
        isGstRegistered: true
      },
      taxCategories: [
        { code: 'RESTAURANT_FOOD', name: 'Restaurant Food & Non-Alcoholic Beverages', defaultTaxRuleCode: 'GST-FOOD-5' },
        { code: 'RESTAURANT_BEVERAGE', name: 'Packaged Beverages & Waters', defaultTaxRuleCode: 'GST-BEV-5' },
        { code: 'ALCOHOL_BEER', name: 'Beer & Fermented Beverages', defaultTaxRuleCode: 'LIQUOR-VAT-10' },
        { code: 'ALCOHOL_SPIRITS', name: 'Spirits & Hard Liquor', defaultTaxRuleCode: 'LIQUOR-VAT-10' },
        { code: 'ALCOHOL_WINE', name: 'Wines & Sparkling Liquors', defaultTaxRuleCode: 'LIQUOR-VAT-10' },
        { code: 'EXEMPT', name: 'Exempt / Non-Taxable Goods', defaultTaxRuleCode: 'TAX-EXEMPT' }
      ],
      taxRules: [
        {
          code: 'GST-FOOD-5',
          name: 'Restaurant Food 5% GST',
          taxType: 'GST',
          rate: 5.0,
          cgstRate: 2.5,
          sgstRate: 2.5,
          igstRate: 5.0,
          cgstAccountCode: '1410',
          sgstAccountCode: '1420',
          igstAccountCode: '1430',
          appliesTo: ['RESTAURANT_FOOD'],
          priceIncludesTax: false,
          effectiveFrom: '2026-04-01',
          effectiveTo: null,
          status: 'ACTIVE'
        },
        {
          code: 'GST-BEV-5',
          name: 'Packaged Beverage 5% GST',
          taxType: 'GST',
          rate: 5.0,
          cgstRate: 2.5,
          sgstRate: 2.5,
          igstRate: 5.0,
          cgstAccountCode: '1410',
          sgstAccountCode: '1420',
          igstAccountCode: '1430',
          appliesTo: ['RESTAURANT_BEVERAGE'],
          priceIncludesTax: false,
          effectiveFrom: '2026-04-01',
          effectiveTo: null,
          status: 'ACTIVE'
        },
        {
          code: 'LIQUOR-VAT-10',
          name: 'State Liquor VAT 10%',
          taxType: 'LIQUOR_VAT',
          rate: 10.0,
          cgstRate: 0,
          sgstRate: 0,
          igstRate: 0,
          vatAccountCode: '1440',
          appliesTo: ['ALCOHOL_BEER', 'ALCOHOL_SPIRITS', 'ALCOHOL_WINE'],
          priceIncludesTax: false,
          effectiveFrom: '2026-04-01',
          effectiveTo: null,
          status: 'ACTIVE'
        },
        {
          code: 'TAX-EXEMPT',
          name: 'Exempt Items (0%)',
          taxType: 'NONE',
          rate: 0.0,
          cgstRate: 0,
          sgstRate: 0,
          igstRate: 0,
          appliesTo: ['EXEMPT'],
          priceIncludesTax: false,
          effectiveFrom: '2026-04-01',
          effectiveTo: null,
          status: 'ACTIVE'
        }
      ],
      serviceCharge: {
        enabled: true,
        rate: 5.0,
        calculationBasis: 'ELIGIBLE_FOOD_BEVERAGE',
        isGstApplicableOnServiceCharge: true,
        accountCode: '2150'
      },
      // Bar / excise bill identity. By default the bar is billed under the SAME
      // entity/GSTIN/letterhead as the restaurant, but this is configurable: some
      // states license liquor under a separate excise licence (sometimes a distinct
      // GSTIN). When separateExciseLicence is true, the BAR invoice/bill is printed
      // with this identity instead of the restaurant GST registration. splitByDefault
      // pre-selects the cashier's "split food & bar bills" print option.
      barBilling: {
        separateExciseLicence: false,
        licenceName: '',
        licenceNumber: '',
        gstin: '',
        address: '',
        splitByDefault: false
      },
      // Maps menu categories / individual items to tax categories. This is the
      // bridge that lets the CA Tax Setup screen drive per-line billing tax.
      // Resolution order (in resolveCategoryCodeForItem): item override >
      // category default > __default. Liquor is NEVER auto-guessed - an admin
      // must explicitly mark an item/category as alcohol.
      itemTaxMappings: {
        categoryDefaults: {
          'BEVERAGES & BAR': 'RESTAURANT_BEVERAGE',
          'BEVERAGES': 'RESTAURANT_BEVERAGE',
          'BEVERAGE': 'RESTAURANT_BEVERAGE',
          'BAR': 'RESTAURANT_BEVERAGE'
        },
        itemOverrides: {},
        __default: 'RESTAURANT_FOOD'
      },
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Get active tax configuration for a tenant
   */
  getTaxConfiguration(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const dg = this._getDataGateway();
    let configs = [];
    if (dg && typeof dg.getCachedCollection === 'function') {
      configs = dg.getCachedCollection('tax_configurations', targetTenantId);
    }
    if (!Array.isArray(configs) || configs.length === 0) {
      configs = offlineStore.getCollection('tax_configurations', targetTenantId) || offlineStore.getCollection('tax_configurations') || [];
    }

    const found = configs.find(c => c.tenantId === targetTenantId || c.tenant_id === targetTenantId);
    if (!found) return this.getDefaultConfiguration(targetTenantId);

    // Merge a stored (possibly older / partial) config over the defaults so
    // newly added fields like itemTaxMappings always exist without a migration.
    const d = this.getDefaultConfiguration(targetTenantId);
    const storedMappings = (found.itemTaxMappings && typeof found.itemTaxMappings === 'object') ? found.itemTaxMappings : {};
    return {
      ...d,
      ...found,
      gstRegistration: { ...d.gstRegistration, ...(found.gstRegistration || {}) },
      serviceCharge: { ...d.serviceCharge, ...(found.serviceCharge || {}) },
      barBilling: { ...d.barBilling, ...(found.barBilling || {}) },
      taxCategories: (Array.isArray(found.taxCategories) && found.taxCategories.length) ? found.taxCategories : d.taxCategories,
      taxRules: (Array.isArray(found.taxRules) && found.taxRules.length) ? found.taxRules : d.taxRules,
      itemTaxMappings: {
        categoryDefaults: { ...(storedMappings.categoryDefaults || {}) },
        itemOverrides: { ...(storedMappings.itemOverrides || {}) },
        __default: storedMappings.__default || d.itemTaxMappings.__default
      }
    };
  }

  /**
   * Bar / excise bill identity resolved from the active tax configuration.
   * Returns the restaurant GST registration when a separate licence is NOT
   * configured, so the bar bill defaults to the same entity. When configured,
   * the returned object carries the bar's own trade name / licence no / GSTIN /
   * address used to render the BAR invoice header.
   * @returns {{ separateExciseLicence:boolean, licenceName:string, licenceNumber:string, gstin:string, address:string, splitByDefault:boolean }}
   */
  getBarBillingConfig(tenantId = null) {
    const cfg = this.getTaxConfiguration(tenantId);
    return cfg.barBilling || this.getDefaultConfiguration(this._getTenantId(tenantId)).barBilling;
  }

  /**
   * Save / Update Tax Configuration
   */
  saveTaxConfiguration(config, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const previous = this.getTaxConfiguration(targetTenantId);
    const updatedRecord = {
      ...config,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      updatedAt: new Date().toISOString()
    };

    const dg = this._getDataGateway();
    // Always persist locally so a CA edit (and its audit) survives immediately,
    // even before the cloud `tax_configurations` table is provisioned. Then
    // best-effort mirror to the cloud; a missing table must never lose the edit.
    const existing = offlineStore.getCollection('tax_configurations') || [];
    const idx = existing.findIndex(c => c.tenantId === targetTenantId || c.tenant_id === targetTenantId);
    if (idx !== -1) {
      existing[idx] = updatedRecord;
    } else {
      existing.push(updatedRecord);
    }
    offlineStore.setCollection('tax_configurations', existing);

    if (dg && typeof dg.create === 'function') {
      try {
        Promise.resolve(dg.create('tax_configurations', updatedRecord)).catch(() => {});
      } catch (_) {}
    }

    this._recordTaxAudit(targetTenantId, previous, updatedRecord);
    platformEventBus.publish('tax_config:updated', updatedRecord);
    return updatedRecord;
  }

  /**
   * Append an immutable audit entry describing what changed in a tax config
   * save (rule rate old->new, added/removed rules, mapping/liquor changes).
   * Stored in the local `tax_audit_log` collection, newest entries appended.
   */
  _recordTaxAudit(targetTenantId, previous = null, next = null) {
    try {
      let actor = 'System';
      if (typeof sessionStorage !== 'undefined') {
        try {
          const s = JSON.parse(sessionStorage.getItem('ros_session') || '{}');
          actor = s.employeeName || s.employeeId || actor;
        } catch (_) {}
      }

      const changes = [];
      const prevRules = (previous && previous.taxRules) || [];
      const nextRules = (next && next.taxRules) || [];
      for (const nr of nextRules) {
        const pr = prevRules.find(r => r.code === nr.code);
        if (!pr) {
          changes.push(`rule ${nr.code} added @ ${nr.rate}%`);
        } else if (parseFloat(pr.rate) !== parseFloat(nr.rate)) {
          changes.push(`rule ${nr.code}: ${pr.rate}% -> ${nr.rate}%`);
        }
      }
      for (const pr of prevRules) {
        if (!nextRules.find(r => r.code === pr.code)) changes.push(`rule ${pr.code} removed`);
      }

      const prevMap = (previous && previous.itemTaxMappings) || { categoryDefaults: {}, itemOverrides: {} };
      const nextMap = (next && next.itemTaxMappings) || { categoryDefaults: {}, itemOverrides: {} };
      const catKeys = new Set([...Object.keys(prevMap.categoryDefaults || {}), ...Object.keys(nextMap.categoryDefaults || {})]);
      for (const k of catKeys) {
        if ((prevMap.categoryDefaults || {})[k] !== (nextMap.categoryDefaults || {})[k]) {
          changes.push(`category '${k}': ${(prevMap.categoryDefaults || {})[k] || '-'} -> ${(nextMap.categoryDefaults || {})[k] || '-'}`);
        }
      }
      const itemKeys = new Set([...Object.keys(prevMap.itemOverrides || {}), ...Object.keys(nextMap.itemOverrides || {})]);
      for (const k of itemKeys) {
        const pv = (prevMap.itemOverrides || {})[k] || {};
        const nv = (nextMap.itemOverrides || {})[k] || {};
        if (pv.taxCategoryCode !== nv.taxCategoryCode || !!pv.isLiquor !== !!nv.isLiquor) {
          changes.push(`item ${k}: ${nv.taxCategoryCode || '-'}${nv.isLiquor ? ' (LIQUOR)' : ''}`);
        }
      }

      if ((previous && previous.serviceCharge ? previous.serviceCharge.rate : null) !== (next && next.serviceCharge ? next.serviceCharge.rate : null)) {
        changes.push(`service charge: ${previous && previous.serviceCharge ? previous.serviceCharge.rate : '-'}% -> ${next && next.serviceCharge ? next.serviceCharge.rate : '-'}%`);
      }

      const entry = {
        id: `taxaudit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tenantId: targetTenantId,
        tenant_id: targetTenantId,
        actor,
        timestamp: new Date().toISOString(),
        changeSummary: changes.length ? changes.join('; ') : 'configuration saved (no rate/mapping deltas detected)',
        changes,
        snapshotVersion: (next && next.updatedAt) || new Date().toISOString()
      };

      const log = offlineStore.getCollection('tax_audit_log') || [];
      log.push(entry);
      offlineStore.setCollection('tax_audit_log', log);
      return entry;
    } catch (_) {
      return null;
    }
  }

  /** Read the tax change log, newest-first, for the CA Tax Setup panel. */
  getTaxAuditLog(tenantId = null, limit = 50) {
    const targetTenantId = this._getTenantId(tenantId);
    const log = offlineStore.getCollection('tax_audit_log') || [];
    return log
      .filter(e => !e.tenantId || e.tenantId === targetTenantId || e.tenant_id === targetTenantId)
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Core rule math shared by every caller. Given a resolved tax rule, a taxable
   * amount and the intra/inter-state flag, returns the correct split. Single
   * source of truth so the category helper and the per-line bill engine agree.
   */
  _computeRuleTax(rule, amount = 0, isIntraState = true) {
    const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (rule && rule.taxType === 'GST') {
      const totalTax = Math.round((amt * (rule.rate / 100)) * 100) / 100;
      if (isIntraState) {
        const cgstAmount = Math.round((totalTax / 2) * 100) / 100;
        const sgstAmount = Math.round((totalTax - cgstAmount) * 100) / 100;
        return { taxType: 'GST', taxRuleCode: rule.code, taxRate: rule.rate, taxableAmount: amt, cgstAmount, sgstAmount, igstAmount: 0, vatAmount: 0, totalTax, totalAmount: Math.round((amt + totalTax) * 100) / 100 };
      }
      return { taxType: 'GST', taxRuleCode: rule.code, taxRate: rule.rate, taxableAmount: amt, cgstAmount: 0, sgstAmount: 0, igstAmount: totalTax, vatAmount: 0, totalTax, totalAmount: Math.round((amt + totalTax) * 100) / 100 };
    }
    if (rule && rule.taxType === 'LIQUOR_VAT') {
      const vatAmount = Math.round((amt * (rule.rate / 100)) * 100) / 100;
      return { taxType: 'LIQUOR_VAT', taxRuleCode: rule.code, taxRate: rule.rate, taxableAmount: amt, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, vatAmount, totalTax: vatAmount, totalAmount: Math.round((amt + vatAmount) * 100) / 100 };
    }
    return { taxType: 'NONE', taxRuleCode: 'TAX-EXEMPT', taxRate: 0, taxableAmount: amt, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, vatAmount: 0, totalTax: 0, totalAmount: amt };
  }

  /**
   * Calculate Tax Breakdown for a given category & taxable amount
   */
  calculateTaxForCategory({ categoryCode = 'RESTAURANT_FOOD', taxableAmount = 0, supplierStateCode = '27', tenantId = null } = {}) {
    const config = this.getTaxConfiguration(tenantId);
    const category = config.taxCategories.find(c => c.code === categoryCode) || config.taxCategories[0];
    const rule = config.taxRules.find(r => r.code === category.defaultTaxRuleCode && r.status === 'ACTIVE') || config.taxRules[0];
    const isIntraState = String(supplierStateCode).trim() === String(config.gstRegistration.stateCode).trim();
    return this._computeRuleTax(rule, taxableAmount, isIntraState);
  }

  /**
   * Resolve the tax category code for a menu line from the config mapping:
   * per-item override > explicit liquor mark > per-category default > __default.
   */
  resolveCategoryCodeForItem({ itemCode = null, category = null, isLiquor = false } = {}, config = null) {
    const cfg = config || this.getTaxConfiguration();
    const mappings = cfg.itemTaxMappings || { categoryDefaults: {}, itemOverrides: {}, __default: 'RESTAURANT_FOOD' };
    const override = (itemCode && mappings.itemOverrides && mappings.itemOverrides[itemCode]) || null;

    if (override && override.taxCategoryCode) return override.taxCategoryCode;
    if (isLiquor || (override && override.isLiquor)) {
      const alcohol = cfg.taxCategories.find(c => c.code === 'ALCOHOL_SPIRITS')
        || cfg.taxCategories.find(c => String(c.code).indexOf('ALCOHOL') === 0);
      if (alcohol) return alcohol.code;
    }
    if (category && mappings.categoryDefaults && mappings.categoryDefaults[category]) {
      return mappings.categoryDefaults[category];
    }
    return mappings.__default || 'RESTAURANT_FOOD';
  }

  /** Resolve the {categoryCode, rule} for a single bill/order line. */
  _resolveForLine(line = {}, config) {
    const code = this.resolveCategoryCodeForItem(
      { itemCode: line.itemCode || line.itemId, category: line.category || line.rawCategory, isLiquor: line.isLiquor },
      config
    );
    const category = config.taxCategories.find(c => c.code === code) || config.taxCategories[0];
    const rule = config.taxRules.find(r => r.code === category.defaultTaxRuleCode && r.status === 'ACTIVE') || config.taxRules[0];
    return { categoryCode: code, rule };
  }

  /**
   * Map a resolved line to a fiscal billing section. This is the SINGLE place
   * the food-vs-bar split is decided - the UI must never re-check the category
   * code. A line is BAR when its rule is a liquor VAT (or its category is an
   * ALCOHOL_* one); everything else (including 0% exempt food) is the FOOD/GST
   * section. Drives the cashier's separated-but-single-checkout view.
   */
  _sectionForLine(categoryCode = null, rule = null) {
    const isBar = (rule && rule.taxType === 'LIQUOR_VAT') || String(categoryCode).indexOf('ALCOHOL') === 0;
    return isBar ? 'BAR' : 'FOOD';
  }

  /**
   * Tax for a single line (used by the mapping preview and the bill engine).
   */
  calculateLineTax({ line = {}, isIntraState = true, tenantId = null } = {}) {
    const config = this.getTaxConfiguration(tenantId);
    const amount = parseFloat(line.lineTotal || line.total || ((parseFloat(line.price || 0)) * (parseInt(line.quantity || 1, 10)))) || 0;
    const { categoryCode, rule } = this._resolveForLine(line, config);
    const tax = this._computeRuleTax(rule, amount, isIntraState);
    return {
      itemCode: line.itemCode || line.itemId,
      name: line.name,
      taxCategoryCode: categoryCode,
      taxRuleCode: rule ? rule.code : 'TAX-EXEMPT',
      isLiquor: String(categoryCode).indexOf('ALCOHOL') === 0,
      ...tax
    };
  }

  /**
   * The single authoritative bill tax engine. Computes tax PER LINE (so food
   * and liquor can carry different rules), aggregates CGST/SGST/IGST/VAT, then
   * applies the service charge on the eligible (non-alcohol) base. Returns a
   * shape that fills the existing revision/invoice fields (taxLines, charges,
   * cgstAmount, sgstAmount, grandTotal, ...) so every downstream consumer keeps
   * working unchanged. `isIntraState` defaults true (in-state restaurant dining).
   */
  computeBillTax({ items = [], discountRecords = [], config = null, isIntraState = true, tenantId = null } = {}) {
    const cfg = config || this.getTaxConfiguration(tenantId);
    const lines = Array.isArray(items) ? items : [];

    const lineBase = (it) => parseFloat(it.lineTotal || it.total || ((parseFloat(it.price || 0)) * (parseInt(it.quantity || 1, 10)))) || 0;
    const grossSales = Math.round(lines.reduce((s, it) => s + lineBase(it), 0) * 100) / 100;
    const discountsTotal = Math.round((Array.isArray(discountRecords) ? discountRecords : []).reduce((s, d) => s + (parseFloat(d.discountAmount) || 0), 0) * 100) / 100;
    const discountRatio = grossSales > 0 ? Math.min(1, discountsTotal / grossSales) : 0;

    const lineTaxes = [];
    const taxBreakdownByCategory = {};
    const sections = {
      FOOD: { section: 'FOOD', label: 'Food & Non-Alcoholic Beverages', items: [], subtotal: 0, discounts: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, vatAmount: 0, serviceChargeAmount: 0, totalTax: 0 },
      BAR: { section: 'BAR', label: 'Bar & Liquor (Excise VAT)', items: [], subtotal: 0, discounts: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, vatAmount: 0, serviceChargeAmount: 0, totalTax: 0 }
    };
    let taxableAmount = 0, cgstAmount = 0, sgstAmount = 0, igstAmount = 0, vatAmount = 0;
    let serviceChargeEligibleBase = 0;
    // Track the actual configured rates from tax rules (not effective/blended %)
    const configuredRates = { cgst: 0, sgst: 0, igst: 0, vat: 0 };
    const sectionRates = {
      FOOD: { cgst: 0, sgst: 0, igst: 0, vat: 0 },
      BAR:  { cgst: 0, sgst: 0, igst: 0, vat: 0 }
    };

    for (const it of lines) {
      const raw = lineBase(it);
      const lineTaxable = Math.round(raw * (1 - discountRatio) * 100) / 100;
      const { categoryCode, rule } = this._resolveForLine(it, cfg);
      const tax = this._computeRuleTax(rule, lineTaxable, isIntraState);
      
      // Capture configured rate per tax type (max wins if multiple rules)
      if (rule && rule.taxType === 'GST') {
        const halfRate = Math.round((rule.rate / 2) * 100) / 100;
        if (isIntraState) {
          if (halfRate > configuredRates.cgst) configuredRates.cgst = halfRate;
          if (halfRate > configuredRates.sgst) configuredRates.sgst = halfRate;
        } else {
          if (rule.rate > configuredRates.igst) configuredRates.igst = rule.rate;
        }
        const secKey0 = this._sectionForLine(categoryCode, rule);
        if (isIntraState) {
          if (halfRate > sectionRates[secKey0].cgst) sectionRates[secKey0].cgst = halfRate;
          if (halfRate > sectionRates[secKey0].sgst) sectionRates[secKey0].sgst = halfRate;
        } else {
          if (rule.rate > sectionRates[secKey0].igst) sectionRates[secKey0].igst = rule.rate;
        }
      } else if (rule && rule.taxType === 'LIQUOR_VAT') {
        if (rule.rate > configuredRates.vat) configuredRates.vat = rule.rate;
        const secKey0 = this._sectionForLine(categoryCode, rule);
        if (rule.rate > sectionRates[secKey0].vat) sectionRates[secKey0].vat = rule.rate;
      }
      
      taxableAmount = Math.round((taxableAmount + lineTaxable) * 100) / 100;
      cgstAmount = Math.round((cgstAmount + tax.cgstAmount) * 100) / 100;
      sgstAmount = Math.round((sgstAmount + tax.sgstAmount) * 100) / 100;
      igstAmount = Math.round((igstAmount + tax.igstAmount) * 100) / 100;
      vatAmount = Math.round((vatAmount + tax.vatAmount) * 100) / 100;

      const isAlcohol = String(categoryCode).indexOf('ALCOHOL') === 0;
      if (!isAlcohol) serviceChargeEligibleBase = Math.round((serviceChargeEligibleBase + lineTaxable) * 100) / 100;

      const secKey = this._sectionForLine(categoryCode, rule);
      const sec = sections[secKey];
      sec.items.push({
        itemCode: it.itemCode || it.itemId || null,
        name: it.name || it.itemName || 'Menu Item',
        quantity: parseInt(it.quantity || it.qty || 1, 10),
        price: Math.round((parseFloat(it.price || it.unitPrice || it.sellingPrice || 0)) * 100) / 100,
        lineTotal: Math.round(raw * 100) / 100,
        discount: Math.round((raw - lineTaxable) * 100) / 100,
        taxableAmount: lineTaxable,
        taxCategoryCode: categoryCode,
        taxRuleCode: rule ? rule.code : 'TAX-EXEMPT',
        taxType: tax.taxType,
        totalTax: tax.totalTax
      });
      sec.subtotal = Math.round((sec.subtotal + raw) * 100) / 100;
      sec.discounts = Math.round((sec.discounts + (raw - lineTaxable)) * 100) / 100;
      sec.taxableAmount = Math.round((sec.taxableAmount + lineTaxable) * 100) / 100;
      sec.cgstAmount = Math.round((sec.cgstAmount + tax.cgstAmount) * 100) / 100;
      sec.sgstAmount = Math.round((sec.sgstAmount + tax.sgstAmount) * 100) / 100;
      sec.igstAmount = Math.round((sec.igstAmount + tax.igstAmount) * 100) / 100;
      sec.vatAmount = Math.round((sec.vatAmount + tax.vatAmount) * 100) / 100;
      sec.totalTax = Math.round((sec.totalTax + tax.totalTax) * 100) / 100;

      const bucket = taxBreakdownByCategory[categoryCode] || (taxBreakdownByCategory[categoryCode] = { taxCategoryCode: categoryCode, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, vatAmount: 0, totalTax: 0 });
      bucket.taxableAmount = Math.round((bucket.taxableAmount + lineTaxable) * 100) / 100;
      bucket.cgstAmount = Math.round((bucket.cgstAmount + tax.cgstAmount) * 100) / 100;
      bucket.sgstAmount = Math.round((bucket.sgstAmount + tax.sgstAmount) * 100) / 100;
      bucket.igstAmount = Math.round((bucket.igstAmount + tax.igstAmount) * 100) / 100;
      bucket.vatAmount = Math.round((bucket.vatAmount + tax.vatAmount) * 100) / 100;
      bucket.totalTax = Math.round((bucket.totalTax + tax.totalTax) * 100) / 100;

      lineTaxes.push({ itemCode: it.itemCode || it.itemId, name: it.name, taxCategoryCode: categoryCode, taxRuleCode: rule ? rule.code : 'TAX-EXEMPT', taxableAmount: lineTaxable, ...tax });
    }

    // Service charge on the eligible (food + non-alcohol beverage) base only.
    const sc = cfg.serviceCharge || { enabled: false, rate: 0 };
    const scEnabled = sc.enabled !== false;
    const scRate = parseFloat(sc.rate) || 0;
    const serviceChargeAmount = (scEnabled && serviceChargeEligibleBase > 0)
      ? Math.round(serviceChargeEligibleBase * (scRate / 100) * 100) / 100
      : 0;

    // Optional GST on the service-charge component (at the standard food rule).
    if (serviceChargeAmount > 0 && sc.isGstApplicableOnServiceCharge) {
      const foodRule = cfg.taxRules.find(r => r.code === 'GST-FOOD-5' && r.status === 'ACTIVE') || cfg.taxRules.find(r => r.taxType === 'GST');
      const t = this._computeRuleTax(foodRule, serviceChargeAmount, isIntraState);
      cgstAmount = Math.round((cgstAmount + t.cgstAmount) * 100) / 100;
      sgstAmount = Math.round((sgstAmount + t.sgstAmount) * 100) / 100;
      igstAmount = Math.round((igstAmount + t.igstAmount) * 100) / 100;
      sections.FOOD.cgstAmount = Math.round((sections.FOOD.cgstAmount + t.cgstAmount) * 100) / 100;
      sections.FOOD.sgstAmount = Math.round((sections.FOOD.sgstAmount + t.sgstAmount) * 100) / 100;
      sections.FOOD.igstAmount = Math.round((sections.FOOD.igstAmount + t.igstAmount) * 100) / 100;
      sections.FOOD.totalTax = Math.round((sections.FOOD.totalTax + t.totalTax) * 100) / 100;
    }
    // Service charge is levied on the food/beverage (non-alcohol) base only, so
    // it (and its GST) always belongs to the FOOD section.
    if (serviceChargeAmount > 0) sections.FOOD.serviceChargeAmount = serviceChargeAmount;

    // Use the actual configured rates from tax rules, not effective/blended %
    const taxLines = [];
    if (isIntraState) {
      if (cgstAmount > 0) taxLines.push({ type: 'CGST', rate: configuredRates.cgst, amount: cgstAmount });
      if (sgstAmount > 0) taxLines.push({ type: 'SGST', rate: configuredRates.sgst, amount: sgstAmount });
    } else if (igstAmount > 0) {
      taxLines.push({ type: 'IGST', rate: configuredRates.igst, amount: igstAmount });
    }
    if (vatAmount > 0) taxLines.push({ type: 'LIQUOR_VAT', rate: configuredRates.vat, amount: vatAmount });

    const charges = serviceChargeAmount > 0 ? [{ type: 'SERVICE_CHARGE', rate: scRate, amount: serviceChargeAmount }] : [];

    const totalTax = Math.round((cgstAmount + sgstAmount + igstAmount + vatAmount) * 100) / 100;
    const grandTotal = Math.round((taxableAmount + totalTax + serviceChargeAmount) * 100) / 100;

    // Finalize the fiscal sections. Their numbers sum exactly to the bill totals
    // above, so the cashier renders two separated blocks under one grand total
    // (and one payment) without doing any tax classification of its own.
    for (const key of ['FOOD', 'BAR']) {
      const sec = sections[key];
      const secRates = sectionRates[key];
      const secLines = [];
      if (isIntraState) {
        if (sec.cgstAmount > 0) secLines.push({ type: 'CGST', rate: secRates.cgst, amount: sec.cgstAmount });
        if (sec.sgstAmount > 0) secLines.push({ type: 'SGST', rate: secRates.sgst, amount: sec.sgstAmount });
      } else if (sec.igstAmount > 0) {
        secLines.push({ type: 'IGST', rate: secRates.igst, amount: sec.igstAmount });
      }
      if (sec.vatAmount > 0) secLines.push({ type: 'LIQUOR_VAT', rate: secRates.vat, amount: sec.vatAmount });
      sec.taxLines = secLines;
      sec.charges = sec.serviceChargeAmount > 0 ? [{ type: 'SERVICE_CHARGE', rate: scRate, amount: sec.serviceChargeAmount }] : [];
      sec.sectionTotal = Math.round((sec.taxableAmount + sec.totalTax + sec.serviceChargeAmount) * 100) / 100;
    }
    const fiscalSections = [sections.FOOD, sections.BAR];

    return {
      grossSales,
      discountsTotal,
      taxableAmount,
      lineTaxes,
      taxBreakdownByCategory,
      fiscalSections,
      cgstAmount, sgstAmount, igstAmount, vatAmount,
      cgstPercent: configuredRates.cgst,
      sgstPercent: configuredRates.sgst,
      totalTax,
      serviceChargePercent: scRate,
      serviceChargeAmount,
      taxLines,
      charges,
      grandTotal
    };
  }
}

export const taxConfigurationModel = new TaxConfigurationModel();
