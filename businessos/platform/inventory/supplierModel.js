/**
 * BusinessOS Platform - Supplier Master & Price Trend Ledger (F3.2)
 * Manages supplier profiles, price history points, and derived Accounts Payable projections.
 * Derived Rule: Outstanding Payable = SUM(Supplier Invoices) - SUM(Supplier Payments)
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class SupplierModel {
  constructor() {
    this._initSeedSuppliers();
  }

  _initSeedSuppliers() {
    if (!offlineStore.getCollection('suppliers')) {
      const initialSuppliers = [
        {
          id: 'supp_abc_foods',
          supplierId: 'supp_abc_foods',
          supplierCode: 'SUPP-ABC',
          name: 'ABC Foods & Meat Supplies',
          contactPerson: 'Ramesh Sharma',
          phone: '+91 98450 11223',
          email: 'orders@abcfoods.com',
          gstin: '29ABCDE1234F1Z5',
          paymentTerms: 'NET_15',
          active: true,
          tenantId: 'tenant_h0qc7wf'
        },
        {
          id: 'supp_prestige_dairy',
          supplierId: 'supp_prestige_dairy',
          supplierCode: 'SUPP-PRESTIGE',
          name: 'Prestige Dairy & Provisions',
          contactPerson: 'Suresh Gowda',
          phone: '+91 98450 44556',
          email: 'billing@prestigedairy.com',
          gstin: '29FGHIJ5678K1Z2',
          paymentTerms: 'NET_30',
          active: true,
          tenantId: 'tenant_h0qc7wf'
        }
      ];
      offlineStore.setCollection('suppliers', initialSuppliers);
    }

    if (!offlineStore.getCollection('supplier_price_history')) {
      const initialPriceHistory = [
        { id: 'sph-1', supplierId: 'supp_abc_foods', itemId: 'invitem_chicken', unitCost: 390.00, date: '2026-08-01T10:00:00.000Z' },
        { id: 'sph-2', supplierId: 'supp_abc_foods', itemId: 'invitem_chicken', unitCost: 410.00, date: '2026-08-10T10:00:00.000Z' },
        { id: 'sph-3', supplierId: 'supp_abc_foods', itemId: 'invitem_chicken', unitCost: 420.00, date: '2026-08-20T10:00:00.000Z' },
        { id: 'sph-4', supplierId: 'supp_prestige_dairy', itemId: 'invitem_paneer', unitCost: 350.00, date: '2026-08-01T10:00:00.000Z' },
        { id: 'sph-5', supplierId: 'supp_prestige_dairy', itemId: 'invitem_paneer', unitCost: 360.00, date: '2026-08-15T10:00:00.000Z' }
      ];
      offlineStore.setCollection('supplier_price_history', initialPriceHistory);
    }
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

  getAllSuppliers(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = offlineStore.getCollection('suppliers') || [];
    return store.filter(s => !targetTenantId || s.tenantId === targetTenantId || s.tenant_id === targetTenantId);
  }

  getSupplierById(supplierId, tenantId = null) {
    const suppliers = this.getAllSuppliers(tenantId);
    return suppliers.find(s => s.id === supplierId || s.supplierId === supplierId) || null;
  }

  /**
   * Derived Rule: Outstanding Payable = SUM(Invoices) - SUM(Payments)
   */
  getOutstandingPayable(supplierId, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const invoices = offlineStore.getCollection('supplier_invoices') || [];
    const payments = offlineStore.getCollection('supplier_payments') || [];

    const suppInvoices = invoices.filter(i => (i.supplierId === supplierId) && (!targetTenantId || i.tenantId === targetTenantId));
    const suppPayments = payments.filter(p => (p.supplierId === supplierId) && (!targetTenantId || p.tenantId === targetTenantId));

    const totalBilled = suppInvoices.reduce((sum, i) => sum + (parseFloat(i.invoiceAmount || i.grandTotal) || 0), 0);
    const totalPaid = suppPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    return Math.round(Math.max(0, totalBilled - totalPaid) * 100) / 100;
  }

  /**
   * Record Price History Point
   */
  recordPricePoint(supplierId, itemId, unitCost, tenantId = null) {
    const store = offlineStore.getCollection('supplier_price_history') || [];
    const entry = {
      id: `sph-${Date.now()}`,
      supplierId,
      itemId,
      unitCost: parseFloat(unitCost) || 0,
      date: new Date().toISOString(),
      tenantId: this._getTenantId(tenantId)
    };
    store.push(entry);
    offlineStore.setCollection('supplier_price_history', store);
    return entry;
  }

  /**
   * Get 30-Day Purchase Price Escalation Trend
   */
  getPriceTrendForItem(itemId, tenantId = null) {
    const store = offlineStore.getCollection('supplier_price_history') || [];
    const history = store.filter(h => h.itemId === itemId).sort((a, b) => new Date(a.date) - new Date(b.date));

    if (history.length < 2) {
      return { hasTrend: false, latestCost: history.length > 0 ? history[0].unitCost : 0, changePercent: 0 };
    }

    const oldest = history[0].unitCost;
    const latest = history[history.length - 1].unitCost;
    const diff = latest - oldest;
    const percent = Math.round((diff / Math.max(1, oldest)) * 1000) / 10;

    return {
      hasTrend: true,
      oldestCost: oldest,
      latestCost: latest,
      changePercent: percent,
      isPriceIncrease: percent > 0
    };
  }
}

export const supplierModel = new SupplierModel();
