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
    return found || this.getDefaultConfiguration(targetTenantId);
  }

  /**
   * Save / Update Tax Configuration
   */
  saveTaxConfiguration(config, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const updatedRecord = {
      ...config,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      updatedAt: new Date().toISOString()
    };

    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
      dg.create('tax_configurations', updatedRecord);
    } else {
      const existing = offlineStore.getCollection('tax_configurations') || [];
      const idx = existing.findIndex(c => c.tenantId === targetTenantId || c.tenant_id === targetTenantId);
      if (idx !== -1) {
        existing[idx] = updatedRecord;
      } else {
        existing.push(updatedRecord);
      }
      offlineStore.setCollection('tax_configurations', existing);
    }

    platformEventBus.publish('tax_config:updated', updatedRecord);
    return updatedRecord;
  }

  /**
   * Calculate Tax Breakdown for a given category & taxable amount
   */
  calculateTaxForCategory({ categoryCode = 'RESTAURANT_FOOD', taxableAmount = 0, supplierStateCode = '27', tenantId = null }) {
    const config = this.getTaxConfiguration(tenantId);
    const category = config.taxCategories.find(c => c.code === categoryCode) || config.taxCategories[0];
    const ruleCode = category.defaultTaxRuleCode;
    const rule = config.taxRules.find(r => r.code === ruleCode && r.status === 'ACTIVE') || config.taxRules[0];

    const amount = parseFloat(taxableAmount) || 0;
    const isIntraState = String(supplierStateCode).trim() === String(config.gstRegistration.stateCode).trim();

    if (rule.taxType === 'GST') {
      const totalTax = Math.round((amount * (rule.rate / 100)) * 100) / 100;
      if (isIntraState) {
        const cgstAmount = Math.round((totalTax / 2) * 100) / 100;
        const sgstAmount = Math.round((totalTax - cgstAmount) * 100) / 100;
        return {
          taxType: 'GST',
          taxRuleCode: rule.code,
          taxRate: rule.rate,
          taxableAmount: amount,
          cgstAmount,
          sgstAmount,
          igstAmount: 0,
          totalTax,
          totalAmount: amount + totalTax
        };
      } else {
        return {
          taxType: 'GST',
          taxRuleCode: rule.code,
          taxRate: rule.rate,
          taxableAmount: amount,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: totalTax,
          totalTax,
          totalAmount: amount + totalTax
        };
      }
    } else if (rule.taxType === 'LIQUOR_VAT') {
      const vatAmount = Math.round((amount * (rule.rate / 100)) * 100) / 100;
      return {
        taxType: 'LIQUOR_VAT',
        taxRuleCode: rule.code,
        taxRate: rule.rate,
        taxableAmount: amount,
        vatAmount,
        totalTax: vatAmount,
        totalAmount: amount + vatAmount
      };
    }

    return {
      taxType: 'NONE',
      taxRuleCode: 'TAX-EXEMPT',
      taxRate: 0,
      taxableAmount: amount,
      totalTax: 0,
      totalAmount: amount
    };
  }
}

export const taxConfigurationModel = new TaxConfigurationModel();
