/**
 * BusinessOS Platform - Cash Box Reconciliation Helper
 *
 * The single question a till must answer before it can close: "are there any
 * bills still unsettled for this window?" Returns them so the Cashier/Retail
 * register can block end-of-day close until every one is paid, and so the EOD
 * audit records exactly what was outstanding at lock time.
 *
 * Deliberately reads the durable collections from the offlineStore (payments /
 * invoices / retail_sales) rather than importing the heavy billing models, to
 * keep this leaf dependency-light and headlessly testable. Tolerates camel /
 * snake / hydrated data-JSONB field shapes.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

function rows(collection) {
  return offlineStore.getCollection(collection) || [];
}

function field(rec, camel, snake) {
  if (rec == null) return undefined;
  if (rec[camel] !== undefined && rec[camel] !== null) return rec[camel];
  if (snake && rec[snake] !== undefined && rec[snake] !== null) return rec[snake];
  const d = rec.data;
  if (d && typeof d === 'object' && d[camel] !== undefined && d[camel] !== null) return d[camel];
  return undefined;
}

function tenantOf(rec) {
  return field(rec, 'tenantId', 'tenant_id');
}

function inWindow(iso, from, to) {
  if (!iso) return false;
  const s = String(iso);
  if (from && s < String(from)) return false;
  if (to && s > String(to)) return false;
  return true;
}

class CashBoxService {
  _tenant(tenantId) {
    return tenantId || 'tenant_h0qc7wf';
  }

  /**
   * Unsettled bills for a shift window.
   * @param {String} businessUnit 'RESTAURANT' | 'RETAIL'
   * @param {String} tenantId
   * @param {Object} window { from: ISO, to: ISO }
   * @returns {Array<{referenceId, sessionId, saleNumber, amount, occurredAt}>}
   */
  getUnsettledBills(businessUnit = 'RESTAURANT', tenantId = null, window = {}) {
    const t = this._tenant(tenantId);
    const from = window.from || null;
    const to = window.to || new Date().toISOString();

    const payments = rows('payments').filter(p => tenantOf(p) === t);

    if (String(businessUnit).toUpperCase() === 'RETAIL') {
      const settledSales = new Set(
        payments
          .map(p => field(p, 'saleNumber', 'sale_number') || field(p, 'retailSaleNumber'))
          .filter(Boolean)
      );
      return rows('retail_sales')
        .filter(s => tenantOf(s) === t)
        .filter(s => String(field(s, 'status') || '').toUpperCase() === 'CONFIRMED')
        .filter(s => inWindow(field(s, 'occurredAt', 'occurred_at') || field(s, 'createdAt'), from, to))
        .filter(s => !settledSales.has(field(s, 'saleNumber', 'sale_number')))
        .map(s => ({
          referenceId: field(s, 'invoiceNumber', 'invoice_number') || field(s, 'saleNumber', 'sale_number'),
          saleNumber: field(s, 'saleNumber', 'sale_number'),
          amount: parseFloat(field(s, 'grandTotal', 'grand_total')) || 0,
          occurredAt: field(s, 'occurredAt', 'occurred_at') || field(s, 'createdAt')
        }));
    }

    // RESTAURANT: issued invoices whose session has no settled payment.
    const paidSessions = new Set(
      payments.map(p => field(p, 'sessionId', 'session_id')).filter(Boolean)
    );
    const invoices = rows('invoices')
      .filter(i => tenantOf(i) === t)
      .filter(i => String(field(i, 'businessUnit', 'business_unit') || 'RESTAURANT').toUpperCase() !== 'RETAIL')
      .filter(i => String(field(i, 'status') || '').toUpperCase() === 'ISSUED')
      .filter(i => inWindow(field(i, 'issuedAt') || field(i, 'createdAt'), from, to))
      .filter(i => {
        const sid = field(i, 'sessionId', 'session_id');
        return sid && !paidSessions.has(sid);
      });

    // A mixed bill can carry two linked invoices (FOOD+BAR); collapse to one
    // outstanding row per session so the pending count is truthful.
    const bySession = new Map();
    for (const inv of invoices) {
      const sid = field(inv, 'sessionId', 'session_id');
      if (!bySession.has(sid)) {
        bySession.set(sid, {
          sessionId: sid,
          referenceId: field(inv, 'invoiceNumber', 'invoice_number'),
          amount: parseFloat(field(inv, 'combinedGrandTotal')) || parseFloat(field(inv, 'grandTotal', 'grand_total')) || 0,
          occurredAt: field(inv, 'issuedAt') || field(inv, 'createdAt')
        });
      }
    }
    return Array.from(bySession.values());
  }

  /** Convenience count for the close gate. */
  getUnsettledCount(businessUnit = 'RESTAURANT', tenantId = null, window = {}) {
    return this.getUnsettledBills(businessUnit, tenantId, window).length;
  }
}

export const cashBoxService = new CashBoxService();
