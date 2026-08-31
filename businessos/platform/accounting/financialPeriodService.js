/**
 * BusinessOS Platform - Financial Accounting Period Management (F1.1)
 * Manages financial accounting period statuses ('OPEN' | 'REVIEW' | 'LOCKED').
 * Prevents retrospective modification of accounting entries in locked periods.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class FinancialPeriodService {
  constructor() {
    this._initStore();
  }

  _initStore() {
    if (!offlineStore.getCollection('financial_periods')) {
      offlineStore.setCollection('financial_periods', []);
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

  /**
   * Generates a canonical period ID from start/end dates (e.g., "PERIOD_2026-08")
   */
  getPeriodIdForDate(dateStr) {
    const d = new Date(dateStr || Date.now());
    if (isNaN(d.getTime())) return 'PERIOD_CURRENT';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `PERIOD_${year}-${month}`;
  }

  /**
   * Gets all financial periods for tenant
   */
  getAllPeriods(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const periods = offlineStore.getCollection('financial_periods') || [];
    return periods.filter(p => !targetTenantId || p.tenantId === targetTenantId || p.tenant_id === targetTenantId);
  }

  /**
   * Get period status for a specific date
   * @param {string|Date} dateVal 
   * @param {string|null} tenantId 
   * @returns {Object} Period details & status ('OPEN' | 'REVIEW' | 'LOCKED')
   */
  getPeriodStatusForDate(dateVal, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const periodId = this.getPeriodIdForDate(dateVal);
    const periods = this.getAllPeriods(targetTenantId);

    const match = periods.find(p => p.id === periodId || p.periodId === periodId);
    if (match) return match;

    // Default: Return open period for current month
    const d = new Date(dateVal || Date.now());
    const year = d.getFullYear();
    const month = d.getMonth();
    const startDate = new Date(year, month, 1).toISOString();
    const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    return {
      id: periodId,
      periodId,
      tenantId: targetTenantId,
      year,
      month: month + 1,
      name: `${d.toLocaleString('en-US', { month: 'long' })} ${year}`,
      startDate,
      endDate,
      status: 'OPEN', // 'OPEN' | 'REVIEW' | 'LOCKED'
      lockedAt: null,
      lockedBy: null
    };
  }

  /**
   * Check if a specific date falls within a LOCKED accounting period
   */
  isDateLocked(dateVal, tenantId = null) {
    const period = this.getPeriodStatusForDate(dateVal, tenantId);
    return period && period.status === 'LOCKED';
  }

  /**
   * Lock a financial period (CA action)
   */
  lockPeriod(periodId, actorName = 'CA Administrator', tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const periods = offlineStore.getCollection('financial_periods') || [];
    
    let existing = periods.find(p => p.id === periodId || p.periodId === periodId);
    const now = new Date().toISOString();

    if (existing) {
      existing.status = 'LOCKED';
      existing.lockedAt = now;
      existing.lockedBy = actorName;
      existing.updatedAt = now;
    } else {
      existing = {
        id: periodId,
        periodId,
        tenantId: targetTenantId,
        status: 'LOCKED',
        lockedAt: now,
        lockedBy: actorName,
        createdAt: now,
        updatedAt: now
      };
      periods.push(existing);
    }

    offlineStore.setCollection('financial_periods', periods);
    platformEventBus.publish('financial_period:locked', { periodId, actorName, timestamp: now });

    return existing;
  }
}

export const financialPeriodService = new FinancialPeriodService();
