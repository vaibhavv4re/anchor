/**
 * BusinessOS Platform - Operational Expense & Cost Foundation (F2.0)
 * Manages immutable business expense transactions (Rent, Salaries, Utilities, Supplies, Marketing).
 * Persists to offlineStore and syncs to Supabase Cloud via DataGateway.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class ExpenseModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('expenses')) {
      // Seed initial operational expenses for realistic business P&L
      const initialExpenses = [
        {
          id: 'EXP-2026-1001',
          expenseId: 'EXP-2026-1001',
          tenantId: 'tenant_h0qc7wf',
          category: 'RENT',
          amount: 45000,
          vendorName: 'Prestige Commercial Realty',
          expenseDate: '2026-08-01T10:00:00.000Z',
          paymentMethod: 'BANK_TRANSFER',
          referenceNo: 'TXN-98421034',
          notes: 'Monthly Restaurant Premises Rent - Aug 2026',
          enteredBy: 'Sachin (Owner)',
          status: 'APPROVED',
          createdAt: '2026-08-01T10:00:00.000Z'
        },
        {
          id: 'EXP-2026-1002',
          expenseId: 'EXP-2026-1002',
          tenantId: 'tenant_h0qc7wf',
          category: 'SALARIES',
          amount: 62000,
          vendorName: 'Staff Payroll Register',
          expenseDate: '2026-08-05T12:00:00.000Z',
          paymentMethod: 'BANK_TRANSFER',
          referenceNo: 'PAYROLL-AUG-01',
          notes: 'Kitchen & Service Staff Payroll - July Month End',
          enteredBy: 'Sachin (Owner)',
          status: 'APPROVED',
          createdAt: '2026-08-05T12:00:00.000Z'
        },
        {
          id: 'EXP-2026-1003',
          expenseId: 'EXP-2026-1003',
          tenantId: 'tenant_h0qc7wf',
          category: 'UTILITIES',
          amount: 14800,
          vendorName: 'BESCOM Electricity Board',
          expenseDate: '2026-08-10T14:30:00.000Z',
          paymentMethod: 'UPI',
          referenceNo: 'BESCOM-98421',
          notes: 'Commercial Power & Gas Utilities',
          enteredBy: 'Jitu (Manager)',
          status: 'APPROVED',
          createdAt: '2026-08-10T14:30:00.000Z'
        },
        {
          id: 'EXP-2026-1004',
          expenseId: 'EXP-2026-1004',
          tenantId: 'tenant_h0qc7wf',
          category: 'MARKETING',
          amount: 8500,
          vendorName: 'Meta Ads & Local Promotion',
          expenseDate: '2026-08-15T09:00:00.000Z',
          paymentMethod: 'CARD',
          referenceNo: 'META-77412',
          notes: 'Instagram Weekend Special Campaign',
          enteredBy: 'Sachin (Owner)',
          status: 'APPROVED',
          createdAt: '2026-08-15T09:00:00.000Z'
        }
      ];
      offlineStore.setCollection('expenses', initialExpenses);
    }
  }

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
   * Record a new operational expense
   */
  recordExpense({ category = 'OTHER', amount, vendorName = '', expenseDate = null, paymentMethod = 'CASH', referenceNo = '', notes = '', enteredBy = 'Owner', tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = offlineStore.getCollection('expenses') || [];

    const now = new Date();
    const expDateStr = expenseDate ? new Date(expenseDate).toISOString() : now.toISOString();
    const count = store.length;
    const expenseId = `EXP-${now.getFullYear()}-${String(1001 + count).padStart(4, '0')}`;

    const record = {
      id: expenseId,
      expenseId,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      category: category.toUpperCase(),
      amount: parseFloat(amount) || 0,
      vendorName,
      expenseDate: expDateStr,
      paymentMethod: paymentMethod.toUpperCase(),
      referenceNo,
      notes,
      enteredBy,
      status: 'APPROVED',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    store.unshift(record);
    offlineStore.setCollection('expenses', store);

    // Sync to Supabase Cloud via DataGateway / Journal
    const dg = this._getDataGateway();
    if (dg) {
      if (typeof dg.create === 'function') {
        dg.create('expenses', record).catch(() => {});

        const journalEntry = {
          job_id: `job_${expenseId}`,
          job_type: 'EXPENSE_RECORDED',
          tenant_id: targetTenantId,
          entity_name: 'expenses',
          payload: record,
          device_id: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 30) : 'POS-TERMINAL',
          version: 1,
          actor: enteredBy,
          correlation_id: `CID-${Math.floor(10000 + Math.random() * 90000)}`,
          sync_state: 'SYNCED',
          created_at: now.toISOString()
        };
        dg.create('offline_journal', journalEntry).catch(() => {});
      }
    }

    platformEventBus.publish('expense:recorded', record);
    platformEventBus.publish('data:changed', { collection: 'expenses' });

    return record;
  }

  /**
   * Retrieve all expenses for tenant
   */
  getAllExpenses(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = offlineStore.getCollection('expenses') || [];
    return store.filter(e => !targetTenantId || e.tenantId === targetTenantId || e.tenant_id === targetTenantId);
  }

  /**
   * Filter expenses by date range
   */
  getExpensesForPeriod(dateFilter = 'month', tenantId = null) {
    const all = this.getAllExpenses(tenantId);
    if (dateFilter === 'all') return all;

    const now = new Date();
    let startTime = 0;

    if (dateFilter === 'today') {
      startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (dateFilter === 'yesterday') {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      startTime = y.getTime();
    } else if (dateFilter === 'week') {
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();
    } else if (dateFilter === 'month') {
      startTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }

    return all.filter(e => {
      const t = new Date(e.expenseDate || e.createdAt).getTime();
      return t >= startTime;
    });
  }

  /**
   * Calculate total expenses for period
   */
  getTotalExpensesForPeriod(dateFilter = 'month', tenantId = null) {
    const expenses = this.getExpensesForPeriod(dateFilter, tenantId);
    return expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  }
}

export const expenseModel = new ExpenseModel();
