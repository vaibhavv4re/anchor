/**
 * barStockAlertEngine.js
 * Authoritative Reactive Low-Stock Alert & Replenishment Intelligence Engine.
 *
 * Invariants & Contract (Phase B-04D):
 *   1. Event-driven: Subscribes strictly to 'stock:balance:updated' on platformEventBus.
 *   2. Stock Truth First: Authoritative state is derived from stock_balances + inventory.reorder_level + computeBarStockStatus().
 *   3. Transition-Aware: In-memory cache detects edge changes. Suppresses duplicate alerts for LOW -> LOW, OUT -> OUT, and duplicate event deliveries.
 *   4. 8-Path Transition Matrix:
 *        HEALTHY -> LOW     = BREACH_LOW
 *        LOW     -> LOW     = suppressed
 *        LOW     -> OUT     = BREACH_OUT (Escalation)
 *        OUT     -> OUT     = suppressed
 *        HEALTHY -> OUT     = BREACH_OUT (Direct Critical)
 *        LOW     -> HEALTHY = RECOVERY
 *        OUT     -> HEALTHY = RECOVERY
 *        OUT     -> LOW     = BREACH_LOW (De-escalation)
 *   5. Unconfigured Immunity: Positive unconfigured stock is immune to threshold breach.
 *   6. Single-Owner Calculation: Reuses B-04C calculateSuggestedRestockQuantity().
 *   7. Domain Alert Resolution: ACKNOWLEDGED != RECOVERED. Domain alert is active as long as stock is below threshold; resolved strictly upon recovery to HEALTHY.
 *   8. Strictly Read/React/Notify: Zero stock mutations, zero transfer creation, zero reorder modifications.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import {
  computeBarStockStatus,
  BarStockStatus,
  BAR_POLICY_CLASSIFICATION_MAP,
  calculateSuggestedRestockQuantity
} from './barReplenishmentModel.js';

export const BAR_STORE_LOCATION = 'LOC-314';

export const BarAlertEventTypes = Object.freeze({
  THRESHOLD_BREACHED: 'stock:threshold_breached',
  THRESHOLD_RECOVERED: 'stock:threshold_recovered'
});

export const BarAlertTransitionTypes = Object.freeze({
  BREACH_LOW: 'BREACH_LOW',
  BREACH_OUT: 'BREACH_OUT',
  RECOVERY: 'RECOVERY'
});

export class BarStockAlertEngine {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || offlineStore;
    this.eventBus = deps.eventBus || platformEventBus;
    this.transitionCache = new Map(); // Key: `${tenantId}:${itemCode}` -> { status, quantity, reorderLevel, lastUpdated }
    this.isListening = false;
    this._boundHandler = this.handleBalanceUpdate.bind(this);
  }

  /**
   * Starts listening to stock:balance:updated on platformEventBus.
   */
  startListening() {
    if (this.isListening) return;
    if (this.eventBus && typeof this.eventBus.subscribe === 'function') {
      this._unsub = this.eventBus.subscribe('stock:balance:updated', this._boundHandler);
      this.isListening = true;
    }
  }

  /**
   * Stops listening to stock:balance:updated.
   */
  stopListening() {
    if (!this.isListening) return;
    if (typeof this._unsub === 'function') {
      this._unsub();
      this._unsub = null;
    }
    this.isListening = false;
  }

  /**
   * Clears the in-memory transition cache (for testing and restarts).
   */
  clearCache() {
    this.transitionCache.clear();
  }

  /**
   * Reconstructs the in-memory transition cache safely from current authoritative stock truth.
   * Does NOT emit breach or recovery events during reconstruction.
   *
   * @param {string} tenantId
   */
  reconstructFromAuthoritativeState(tenantId = 'tenant_h0qc7wf') {
    const targetTenantId = tenantId || 'tenant_h0qc7wf';
    const invItems = this.offlineStore.getCollection('inventory', targetTenantId) || [];
    const balances = this.offlineStore.getCollection('stock_balances', targetTenantId) || [];

    const barItems = invItems.filter(i => {
      const code = String(i.itemCode || i.item_code || i.id || '').toUpperCase();
      return code.startsWith('BAR00') || Boolean(BAR_POLICY_CLASSIFICATION_MAP[code]);
    });

    for (const item of barItems) {
      const code = String(item.itemCode || item.item_code || item.id || '').toUpperCase();
      const balRow = balances.find(b => 
        String(b.itemCode || b.item_code || '').toUpperCase() === code &&
        String(b.locationCode || b.location_code || '').toUpperCase() === BAR_STORE_LOCATION
      );
      const qty = balRow ? parseFloat(balRow.quantity !== undefined ? balRow.quantity : balRow.data?.quantity || 0) : 0;
      const reorderLevel = item.reorder_level !== undefined ? item.reorder_level : item.data?.reorderLevel;
      const status = computeBarStockStatus(qty, reorderLevel);

      const cacheKey = `${targetTenantId}:${code}`;
      this.transitionCache.set(cacheKey, {
        status,
        quantity: qty,
        reorderLevel: parseFloat(reorderLevel) || 0,
        lastUpdated: new Date().toISOString()
      });
    }

    return this.transitionCache.size;
  }

  /**
   * Core Event-Driven Handler: Reacts to authoritative stock:balance:updated.
   *
   * @param {Object} event
   * @returns {Array<Object>} List of emitted alert/recovery events
   */
  handleBalanceUpdate(arg = {}) {
    const event = (arg && arg.payload) ? arg.payload : (arg || {});
    const tenantId = event.tenantId || 'tenant_h0qc7wf';
    const affectedSkus = new Set();

    // 1. Check for single item direct balance update
    if (event.itemCode) {
      const loc = String(event.locationCode || event.location || '').toUpperCase();
      if (!loc || loc === BAR_STORE_LOCATION) {
        affectedSkus.add(String(event.itemCode).toUpperCase().trim());
      }
    }

    // 2. Check for stock transfer affecting LOC-314
    const toLoc = String(event.toLoc || event.toLocationCode || event.to_location || '').toUpperCase();
    const fromLoc = String(event.fromLoc || event.fromLocationCode || event.from_location || '').toUpperCase();
    if (toLoc === BAR_STORE_LOCATION || fromLoc === BAR_STORE_LOCATION) {
      if (Array.isArray(event.lines)) {
        for (const line of event.lines) {
          if (line.itemCode) {
            affectedSkus.add(String(line.itemCode).toUpperCase().trim());
          }
        }
      }
    }

    // 3. Fallback: If event is general sync without itemCode, evaluate all known Bar SKUs
    if (affectedSkus.size === 0 && (event.source === 'realtime_sync' || !event.itemCode)) {
      const invItems = this.offlineStore.getCollection('inventory', tenantId) || [];
      for (const i of invItems) {
        const code = String(i.itemCode || i.item_code || i.id || '').toUpperCase();
        if (code.startsWith('BAR00') || BAR_POLICY_CLASSIFICATION_MAP[code]) {
          affectedSkus.add(code);
        }
      }
    }

    const emittedEvents = [];
    const invItems = this.offlineStore.getCollection('inventory', tenantId) || [];
    const balances = this.offlineStore.getCollection('stock_balances', tenantId) || [];

    for (const code of affectedSkus) {
      // Find master item
      const item = invItems.find(i => String(i.itemCode || i.item_code || i.id || '').toUpperCase() === code);
      if (!item) continue;

      // Find current physical on-hand at LOC-314
      let currentQty = 0;
      if (event.itemCode && String(event.itemCode).toUpperCase() === code && event.newBalance !== undefined) {
        currentQty = parseFloat(event.newBalance);
      } else {
        const balRow = balances.find(b => 
          String(b.itemCode || b.item_code || '').toUpperCase() === code &&
          String(b.locationCode || b.location_code || '').toUpperCase() === BAR_STORE_LOCATION
        );
        currentQty = balRow ? parseFloat(balRow.quantity !== undefined ? balRow.quantity : balRow.data?.quantity || 0) : 0;
      }
      const reorderLevel = item.reorder_level !== undefined ? item.reorder_level : item.data?.reorderLevel;
      const currentStatus = computeBarStockStatus(currentQty, reorderLevel);

      const cacheKey = `${tenantId}:${code}`;
      const cached = this.transitionCache.get(cacheKey);
      const previousStatus = cached ? cached.status : null;
      const previousQty = cached ? cached.quantity : null;

      // Gate 6 Idempotency: If exact same quantity and status received again, suppress completely
      if (cached && previousStatus === currentStatus && previousQty === currentQty) {
        continue;
      }

      // Transition Machine Evaluation
      let transitionType = null;
      let eventType = null;

      if (currentStatus === BarStockStatus.OUT) {
        if (previousStatus !== BarStockStatus.OUT) {
          transitionType = BarAlertTransitionTypes.BREACH_OUT;
          eventType = BarAlertEventTypes.THRESHOLD_BREACHED;
        }
      } else if (currentStatus === BarStockStatus.LOW) {
        if (previousStatus === BarStockStatus.HEALTHY || previousStatus === BarStockStatus.UNCONFIGURED || previousStatus === null) {
          transitionType = BarAlertTransitionTypes.BREACH_LOW;
          eventType = BarAlertEventTypes.THRESHOLD_BREACHED;
        } else if (previousStatus === BarStockStatus.OUT) {
          transitionType = BarAlertTransitionTypes.BREACH_LOW; // De-escalation to low
          eventType = BarAlertEventTypes.THRESHOLD_BREACHED;
        }
      } else if (currentStatus === BarStockStatus.HEALTHY) {
        if (previousStatus === BarStockStatus.LOW || previousStatus === BarStockStatus.OUT) {
          transitionType = BarAlertTransitionTypes.RECOVERY;
          eventType = BarAlertEventTypes.THRESHOLD_RECOVERED;
        }
      }
      // Note: UNCONFIGURED items with positive stock emit nothing (Gate 4 immunity)

      // Update in-memory transition cache
      this.transitionCache.set(cacheKey, {
        status: currentStatus,
        quantity: currentQty,
        reorderLevel: parseFloat(reorderLevel) || 0,
        lastUpdated: new Date().toISOString()
      });

      if (eventType && transitionType) {
        const payload = {
          tenantId,
          itemCode: code,
          itemName: item.name || item.itemName || item.item_name || code,
          locationCode: BAR_STORE_LOCATION,
          previousStatus: previousStatus || 'UNKNOWN',
          currentStatus,
          transitionType,
          previousQuantity: previousQty !== null ? previousQty : undefined,
          quantity: currentQty,
          currentQuantity: currentQty,
          currentBalance: currentQty,
          reorderLevel: parseFloat(reorderLevel) || 0,
          uom: item.baseUom || item.base_uom || 'LTR',
          suggestedRestockQty: calculateSuggestedRestockQuantity(code, currentQty, reorderLevel),
          timestamp: new Date().toISOString()
        };

        if (this.eventBus && typeof this.eventBus.publish === 'function') {
          this.eventBus.publish(eventType, payload);
        }

        emittedEvents.push({ eventType, payload });
      }
    }

    return emittedEvents;
  }

  /**
   * Retrieves active alerts for Bar Store (LOC-314) derived strictly from current stock truth.
   * Domain Alert Invariant: ACKNOWLEDGED != RECOVERED.
   * Alerts remain active as long as physical stock is LOW or OUT.
   *
   * @param {string} tenantId
   * @returns {Array<Object>}
   */
  getActiveAlerts(tenantId = 'tenant_h0qc7wf') {
    const targetTenantId = tenantId || 'tenant_h0qc7wf';
    const invItems = this.offlineStore.getCollection('inventory', targetTenantId) || [];
    const balances = this.offlineStore.getCollection('stock_balances', targetTenantId) || [];

    const activeAlerts = [];

    const barItems = invItems.filter(i => {
      const code = String(i.itemCode || i.item_code || i.id || '').toUpperCase();
      return code.startsWith('BAR00') || Boolean(BAR_POLICY_CLASSIFICATION_MAP[code]);
    });

    for (const item of barItems) {
      const code = String(item.itemCode || item.item_code || item.id || '').toUpperCase();
      const balRow = balances.find(b => 
        String(b.itemCode || b.item_code || '').toUpperCase() === code &&
        String(b.locationCode || b.location_code || '').toUpperCase() === BAR_STORE_LOCATION
      );
      const currentQty = balRow ? parseFloat(balRow.quantity !== undefined ? balRow.quantity : balRow.data?.quantity || 0) : 0;
      const reorderLevel = item.reorder_level !== undefined ? item.reorder_level : item.data?.reorderLevel;
      const status = computeBarStockStatus(currentQty, reorderLevel);

      if (status === BarStockStatus.LOW || status === BarStockStatus.OUT) {
        activeAlerts.push({
          itemCode: code,
          itemName: item.name || item.itemName || item.item_name || code,
          locationCode: BAR_STORE_LOCATION,
          status,
          severity: status === BarStockStatus.OUT ? 'CRITICAL' : 'WARNING',
          quantity: currentQty,
          reorderLevel: parseFloat(reorderLevel) || 0,
          uom: item.baseUom || item.base_uom || 'LTR',
          suggestedRestockQty: calculateSuggestedRestockQuantity(code, currentQty, reorderLevel)
        });
      }
    }

    // Sort: OUT first, then LOW, then by itemCode
    return activeAlerts.sort((a, b) => {
      if (a.status === BarStockStatus.OUT && b.status !== BarStockStatus.OUT) return -1;
      if (a.status !== BarStockStatus.OUT && b.status === BarStockStatus.OUT) return 1;
      return a.itemCode.localeCompare(b.itemCode);
    });
  }
}

export const barStockAlertEngine = new BarStockAlertEngine();
barStockAlertEngine.startListening();
