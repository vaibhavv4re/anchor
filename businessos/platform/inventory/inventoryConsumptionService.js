/**
 * BusinessOS Platform - Authoritative Inventory Consumption Service (PD-010 / K-08 / PD-034)
 * 
 * Implements Model B: Durable, append-only, idempotent ledger movement triggered when Chef marks KOT items READY.
 * Replaces direct balance mutations with an atomic boundary:
 *   - stock_operations (Operation-level idempotency header)
 *   - stock_transactions (Append-only movement lines: SALE_CONSUMPTION / SALE_REVERSAL)
 *   - stock_balances (Consistent relational projection synchronized with embedded data payload)
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { resolvedBomEngine } from '../ordering/resolvedBomEngine.js';
import { DataGateway } from '../data/dataGateway.js';
import { SupabaseClient } from '../cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../data/adapters/supabaseDataAdapter.js';

export class InventoryConsumptionService {
  constructor(options = {}) {
    this.dataGateway = options.dataGateway || null;
  }

  /**
   * Resolve active DataGateway instance (supporting browser global, injected instance, or Node fallback)
   */
  _getDataGateway() {
    if (this.dataGateway) return this.dataGateway;
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      return window.__APP__.platform.dataGateway;
    }
    // Fallback for standalone/Node test runner
    if (!this._fallbackDg) {
      const client = new SupabaseClient();
      const adapter = new SupabaseDataAdapter(client);
      this._fallbackDg = new DataGateway({ cloudAdapter: adapter, isOnline: true });
    }
    return this._fallbackDg;
  }

  /**
   * Determine storage location for ingredient consumption.
   * Prioritizes kitchen locations (LOC-886, LOC-KIT, LOC-901, LOC-KITCHEN) before fallback.
   */
  resolveLocationForItem(itemCode, tenantId = 'tenant_h0qc7wf') {
    const dg = this._getDataGateway();
    let balances = [];
    if (dg && typeof dg.getCachedCollection === 'function') {
      balances = dg.getCachedCollection('stock_balances', tenantId) || [];
    }
    if (!balances.length) {
      balances = offlineStore.getCollection('stock_balances', tenantId) || [];
    }

    const norm = (s) => String(s || '').toUpperCase().trim().replace(/[-_]/g, '');
    const target = norm(itemCode);

    // 1. Kitchen Store match
    const kitBal = balances.find(b => {
      const code = norm(b.itemCode || b.item_code);
      const loc = String(b.locationCode || b.location_code || '').toUpperCase().trim();
      const isKit = loc === 'LOC-886' || loc === 'LOC-KIT' || loc === 'LOC-901' || loc === 'LOC-KITCHEN' || loc.includes('KIT');
      return (code === target || code.includes(target) || target.includes(code)) && isKit;
    });
    if (kitBal) return kitBal.locationCode || kitBal.location_code;

    // 2. Any location match
    const anyBal = balances.find(b => {
      const code = norm(b.itemCode || b.item_code);
      return code === target || code.includes(target) || target.includes(code);
    });
    if (anyBal) return anyBal.locationCode || anyBal.location_code;

    // 3. Authoritative kitchen default
    return 'LOC-886';
  }

  /**
   * Authoritative sale consumption execution for an ordered line item.
   * Triggered when Chef marks item READY in KDS.
   * 
   * @param {Object} params
   * @param {string} params.tenantId
   * @param {string} params.orderId
   * @param {string} params.orderLineId
   * @param {Object} params.item { itemId, itemCode, name, quantity, recipeId, ... }
   * @param {string} [params.occurredAt]
   * @param {string} [params.performedBy]
   * @param {string} [params.correlationId]
   * @returns {Promise<Object>} Result envelope
   */
  async consumeForOrderLine({
    tenantId = 'tenant_h0qc7wf',
    orderId,
    orderLineId,
    item,
    occurredAt = new Date().toISOString(),
    performedBy = 'Chef',
    correlationId = null
  }) {
    if (!orderId || !orderLineId || !item) {
      throw new Error(`[InventoryConsumptionService] Missing required parameters: orderId=${orderId}, orderLineId=${orderLineId}`);
    }

    const tId = tenantId || 'tenant_h0qc7wf';
    const operationId = `cons_${tId}_${orderId}_${orderLineId}`;
    const corrId = correlationId || `corr_${orderId}_${orderLineId}`;
    const dg = this._getDataGateway();

    // 1. Resolve exact line item BOM via Resolved BOM Engine
    const resolved = resolvedBomEngine.resolveOrderLineBOM(item, tId);
    if (!resolved || !Array.isArray(resolved.consumption) || resolved.consumption.length === 0) {
      console.log(`[InventoryConsumptionService] No BOM resolved for line item "${item.name || item.itemName || item.itemCode}". Skipping consumption.`);
      return {
        success: true,
        skipped: true,
        reason: 'NO_BOM_CONFIGURED',
        operationId
      };
    }

    // 2. Build consumption items with location mapping
    const itemsToDeduct = resolved.consumption.map(c => {
      const ingCode = c.inventoryItemCode || c.itemCode;
      const locCode = this.resolveLocationForItem(ingCode, tId);
      const ingName = c.inventoryItemName || c.itemName || ingCode;
      const qty = Math.abs(parseFloat(c.quantity) || 0);
      const uom = (c.uom || 'KG').toUpperCase();
      return {
        itemCode: ingCode,
        itemcode: ingCode,
        item_code: ingCode,
        itemName: ingName,
        itemname: ingName,
        item_name: ingName,
        locationCode: locCode,
        locationcode: locCode,
        location_code: locCode,
        quantity: qty,
        qty,
        uom,
        recipeId: item.recipeId || null,
        bomVersionId: c.bomVersionId || resolved.bomVersionId || 'v1.0'
      };
    });

    // 3. Attempt Atomic Execution via PostgreSQL Stored Procedure (rpc_record_sale_consumption)
    if (dg && typeof dg.rpc === 'function') {
      try {
        const rpcPayload = {
          p_tenant_id: tId,
          p_operation_id: operationId,
          p_reference_id: String(orderId),
          p_reference_line_id: String(orderLineId),
          p_recipe_id: item.recipeId || null,
          p_recipe_version: resolved.bomVersionId || 'v1.0',
          p_occurred_at: occurredAt,
          p_performed_by: performedBy,
          p_correlation_id: corrId,
          p_items: itemsToDeduct
        };

        const rpcRes = await dg.rpc('rpc_record_sale_consumption', rpcPayload);
        if (rpcRes && rpcRes.success && rpcRes.data) {
          const resData = rpcRes.data;
          console.log(`[InventoryConsumptionService] PostgreSQL RPC rpc_record_sale_consumption success:`, resData);

          // Update local authoritative projection in DataGateway and cache immediately
          this._syncLocalCacheAfterRpc(tId, itemsToDeduct, operationId, resData.transactions);

          // Realtime multi-tab / multi-window broadcast
          if (typeof window !== 'undefined' && window.__APP__?.platform?.realtime?.broadcastLocalMutation) {
            window.__APP__.platform.realtime.broadcastLocalMutation('stock_balances', 'UPDATE', {
              tenantId: tId,
              operationId,
              transactions: resData.transactions
            });
          }

          platformEventBus.publish('inventory:consumed', { tenantId: tId, operationId, orderId, orderLineId });
          return resData;
        }

        // If error is INSUFFICIENT_STOCK from Postgres, bubble up immediately
        if (rpcRes && !rpcRes.success && rpcRes.error && rpcRes.error.includes('INSUFFICIENT_STOCK')) {
          throw new Error(rpcRes.error);
        }

        console.warn(`[InventoryConsumptionService] RPC not available or failed (${rpcRes?.error || rpcRes?.status}). Executing resilient atomic client fallback...`);
      } catch (err) {
        if (err.message && err.message.includes('INSUFFICIENT_STOCK')) {
          throw err;
        }
        console.warn(`[InventoryConsumptionService] Caught error calling RPC: ${err.message}. Falling back to atomic client engine.`);
      }
    }

    // 4. Resilient Atomic Fallback (for offline execution or pre-DDL environment)
    return await this._executeFallbackConsumption({
      tenantId: tId,
      operationId,
      orderId,
      orderLineId,
      item,
      resolved,
      itemsToDeduct,
      occurredAt,
      performedBy,
      correlationId: corrId
    });
  }

  /**
   * Resilient client-side atomic execution with strict idempotency and shortage validation.
   */
  async _executeFallbackConsumption({
    tenantId,
    operationId,
    orderId,
    orderLineId,
    item,
    resolved,
    itemsToDeduct,
    occurredAt,
    performedBy,
    correlationId
  }) {
    const dg = this._getDataGateway();

    // Step A: Operation-Level Idempotency Guard
    const existingOps = (await dg.getCollection('stock_operations', tenantId)) || [];
    const isReplay = existingOps.some(o => (o.operationId === operationId || o.operation_id === operationId) && (o.tenantId === tenantId || o.tenant_id === tenantId));
    if (isReplay) {
      console.log(`[InventoryConsumptionService] Idempotent replay detected for operation "${operationId}". Returning cached success.`);
      return {
        success: true,
        idempotentReplay: true,
        operationId
      };
    }

    // Step B: Fetch live balances & validate availability (All-or-Nothing Shortage Guard)
    const balances = (await dg.getCollection('stock_balances', tenantId)) || [];
    const balanceUpdates = [];

    for (const dItem of itemsToDeduct) {
      const match = balances.find(b => {
        const itemMatch = (b.itemCode || b.item_code) === dItem.itemCode;
        const locMatch = (b.locationCode || b.location_code) === dItem.locationCode;
        return itemMatch && locMatch;
      });

      const currentQty = match ? parseFloat(match.quantity !== undefined ? match.quantity : (match.data?.quantity || 0)) : 0;
      const deductQty = dItem.quantity;

      if (!match || currentQty < deductQty) {
        const avail = match ? currentQty : 0;
        throw new Error(`INSUFFICIENT_STOCK: Item ${dItem.itemCode} at ${dItem.locationCode} requires ${deductQty} ${dItem.uom}, but only ${avail} is available`);
      }

      const unitCost = parseFloat(match.unitCost || match.unit_cost || (match.data?.unitCost) || 0);
      const newQty = parseFloat((currentQty - deductQty).toFixed(4));
      const newVal = parseFloat((newQty * unitCost).toFixed(2));

      balanceUpdates.push({
        balanceRecord: match,
        deductQty,
        currentQty,
        newQty,
        unitCost,
        newVal,
        dItem
      });
    }

    // Step C: Post movement lines to stock_transactions
    const createdTxns = [];
    for (const bUp of balanceUpdates) {
      const txnRecord = {
        id: `txn-sale-${Math.random().toString(36).substring(2, 9)}`,
        tenantId,
        operationId,
        transactionType: 'SALE_CONSUMPTION',
        status: 'POSTED',
        referenceType: 'KOT_LINE',
        referenceId: String(orderId),
        referenceLineId: String(orderLineId),
        recipeId: item.recipeId || null,
        recipeVersion: resolved.bomVersionId || 'v1.0',
        itemCode: bUp.dItem.itemCode,
        itemName: bUp.dItem.itemName,
        locationCode: bUp.dItem.locationCode,
        quantity: -Math.abs(bUp.deductQty),
        uom: bUp.dItem.uom,
        unitCost: bUp.unitCost,
        totalCost: parseFloat((Math.abs(bUp.deductQty) * bUp.unitCost).toFixed(2)),
        performedBy,
        correlationId,
        notes: `KOT Line Ready consumption for Order ${orderId}`,
        occurredAt,
        createdAt: new Date().toISOString()
      };

      await dg.create('stock_transactions', txnRecord);
      createdTxns.push(txnRecord);
    }

    // Step D: Synchronize stock_balances projections (Columns + embedded data payload)
    for (const bUp of balanceUpdates) {
      const bRec = bUp.balanceRecord;
      const patch = {
        id: bRec.id,
        tenantId,
        itemCode: bRec.itemCode || bRec.item_code,
        locationCode: bRec.locationCode || bRec.location_code,
        quantity: bUp.newQty,
        unitCost: bUp.unitCost,
        valuation: bUp.newVal,
        data: {
          ...(bRec.data || bRec),
          quantity: bUp.newQty,
          valuation: bUp.newVal,
          unitCost: bUp.unitCost
        },
        updatedAt: new Date().toISOString()
      };

      await dg.update('stock_balances', bRec.id || bRec.itemCode, patch);

      // Also update in-memory offlineStore for immediate UI reaction
      const localBals = offlineStore.getCollection('stock_balances', tenantId) || [];
      const lIdx = localBals.findIndex(b => b.id === bRec.id || ((b.itemCode || b.item_code) === (bRec.itemCode || bRec.item_code) && (b.locationCode || b.location_code) === (bRec.locationCode || bRec.location_code)));
      if (lIdx >= 0) {
        localBals[lIdx] = { ...localBals[lIdx], ...patch };
        offlineStore.setCollection('stock_balances', localBals);
      }
    }

    // Step E: Post operation header to stock_operations
    const opRecord = {
      id: `op-${Math.random().toString(36).substring(2, 9)}`,
      tenantId,
      operationId,
      operationType: 'SALE_CONSUMPTION',
      status: 'COMPLETED',
      referenceType: 'KOT_LINE',
      referenceId: String(orderId),
      referenceLineId: String(orderLineId),
      recipeId: item.recipeId || null,
      recipeVersion: resolved.bomVersionId || 'v1.0',
      occurredAt,
      performedBy,
      metadata: {
        itemCode: item.itemCode || item.itemId,
        itemName: item.name || item.itemName,
        quantity: item.quantity || 1,
        transactionsCount: createdTxns.length
      },
      createdAt: new Date().toISOString()
    };

    await dg.create('stock_operations', opRecord);

    // Step F: Broadcast platform events
    platformEventBus.publish('stock:balance:updated', { tenantId, operationId });
    platformEventBus.publish('inventory:consumed', { tenantId, operationId, orderId, orderLineId });

    console.log(`[InventoryConsumptionService] ✅ Fallback consumption completed for operation ${operationId}. Deducted ${createdTxns.length} ingredients.`);
    return {
      success: true,
      operationId,
      transactionsCount: createdTxns.length,
      fallback: true
    };
  }

  /**
   * Reverse previous sale consumption for an order line (Void / Cancellation).
   * Generates compensating SALE_REVERSAL transactions with full lineage.
   * 
   * @param {Object} params
   * @param {string} params.tenantId
   * @param {string} params.orderId
   * @param {string} params.orderLineId
   * @param {string} [params.reason]
   * @param {string} [params.occurredAt]
   * @param {string} [params.performedBy]
   * @returns {Promise<Object>}
   */
  async reverseConsumptionForOrderLine({
    tenantId = 'tenant_h0qc7wf',
    orderId,
    orderLineId,
    reason = 'ORDER_ITEM_VOIDED',
    occurredAt = new Date().toISOString(),
    performedBy = 'System'
  }) {
    if (!orderId || !orderLineId) {
      throw new Error(`[InventoryConsumptionService] Missing orderId or orderLineId for reversal.`);
    }

    const tId = tenantId || 'tenant_h0qc7wf';
    const operationId = `rev_${tId}_${orderId}_${orderLineId}`;
    const origOperationId = `cons_${tId}_${orderId}_${orderLineId}`;
    const dg = this._getDataGateway();

    // 1. Attempt PostgreSQL RPC
    if (dg && typeof dg.rpc === 'function') {
      try {
        const rpcPayload = {
          p_tenant_id: tId,
          p_operation_id: operationId,
          p_original_operation_id: origOperationId,
          p_reversal_reason: reason,
          p_occurred_at: occurredAt,
          p_performed_by: performedBy
        };

        const rpcRes = await dg.rpc('rpc_reverse_sale_consumption', rpcPayload);
        if (rpcRes && rpcRes.success && rpcRes.data) {
          console.log(`[InventoryConsumptionService] PostgreSQL RPC rpc_reverse_sale_consumption success:`, rpcRes.data);
          platformEventBus.publish('stock:balance:updated', { tenantId: tId, operationId });
          platformEventBus.publish('inventory:reversed', { tenantId: tId, operationId, origOperationId });
          return rpcRes.data;
        }
      } catch (err) {
        console.warn(`[InventoryConsumptionService] Caught error calling reverse RPC: ${err.message}. Falling back to client reversal.`);
      }
    }

    // 2. Resilient Fallback Reversal
    return await this._executeFallbackReversal({
      tenantId: tId,
      operationId,
      origOperationId,
      orderId,
      orderLineId,
      reason,
      occurredAt,
      performedBy
    });
  }

  /**
   * Resilient client fallback for consumption reversal.
   */
  async _executeFallbackReversal({
    tenantId,
    operationId,
    origOperationId,
    orderId,
    orderLineId,
    reason,
    occurredAt,
    performedBy
  }) {
    const dg = this._getDataGateway();

    // Check Reversal Idempotency
    const existingOps = (await dg.getCollection('stock_operations', tenantId)) || [];
    const isReplay = existingOps.some(o => (o.operationId === operationId || o.operation_id === operationId));
    if (isReplay) {
      console.log(`[InventoryConsumptionService] Idempotent replay for reversal "${operationId}".`);
      return {
        success: true,
        idempotentReplay: true,
        operationId
      };
    }

    // Find original transactions
    const allTxns = (await dg.getCollection('stock_transactions', tenantId)) || [];
    const origTxns = allTxns.filter(t => (t.operationId === origOperationId || t.operation_id === origOperationId) && (t.transactionType === 'SALE_CONSUMPTION' || t.transaction_type === 'SALE_CONSUMPTION'));

    if (origTxns.length === 0) {
      console.warn(`[InventoryConsumptionService] No original SALE_CONSUMPTION transactions found for ${origOperationId}. Nothing to reverse.`);
      return {
        success: true,
        skipped: true,
        reason: 'ORIGINAL_TRANSACTIONS_NOT_FOUND',
        operationId
      };
    }

    // Restore balances & create compensating SALE_REVERSAL rows
    const balances = (await dg.getCollection('stock_balances', tenantId)) || [];
    const compensatingTxns = [];

    for (const orig of origTxns) {
      const itemCode = orig.itemCode || orig.item_code;
      const locCode = orig.locationCode || orig.location_code;
      const qtyToRestore = Math.abs(parseFloat(orig.quantity) || 0);

      const balMatch = balances.find(b => (b.itemCode || b.item_code) === itemCode && (b.locationCode || b.location_code) === locCode);
      if (balMatch) {
        const cur = parseFloat(balMatch.quantity !== undefined ? balMatch.quantity : (balMatch.data?.quantity || 0));
        const unitCost = parseFloat(balMatch.unitCost || balMatch.unit_cost || (balMatch.data?.unitCost) || 0);
        const restoredQty = parseFloat((cur + qtyToRestore).toFixed(4));
        const restoredVal = parseFloat((restoredQty * unitCost).toFixed(2));

        const patch = {
          id: balMatch.id,
          tenantId,
          itemCode,
          locationCode: locCode,
          quantity: restoredQty,
          unitCost,
          valuation: restoredVal,
          data: {
            ...(balMatch.data || balMatch),
            quantity: restoredQty,
            valuation: restoredVal,
            unitCost
          },
          updatedAt: new Date().toISOString()
        };

        await dg.update('stock_balances', balMatch.id || balMatch.itemCode, patch);

        // Update local offlineStore
        const localBals = offlineStore.getCollection('stock_balances', tenantId) || [];
        const lIdx = localBals.findIndex(b => b.id === balMatch.id);
        if (lIdx >= 0) {
          localBals[lIdx] = { ...localBals[lIdx], ...patch };
          offlineStore.setCollection('stock_balances', localBals);
        }
      }

      // Create compensating transaction row
      const revTxn = {
        id: `txn-rev-${Math.random().toString(36).substring(2, 9)}`,
        tenantId,
        operationId,
        transactionType: 'SALE_REVERSAL',
        status: 'POSTED',
        referenceType: 'KOT_LINE',
        referenceId: String(orderId),
        referenceLineId: String(orderLineId),
        reversalOfOperationId: origOperationId,
        reversalReason: reason,
        itemCode,
        itemName: orig.itemName || orig.item_name,
        locationCode: locCode,
        quantity: qtyToRestore, // Positive compensation
        uom: orig.uom || 'KG',
        unitCost: orig.unitCost || orig.unit_cost || 0,
        totalCost: orig.totalCost || orig.total_cost || 0,
        performedBy,
        occurredAt,
        createdAt: new Date().toISOString()
      };

      await dg.create('stock_transactions', revTxn);
      compensatingTxns.push(revTxn);
    }

    // Post reversal operation header
    const revOp = {
      id: `op-${Math.random().toString(36).substring(2, 9)}`,
      tenantId,
      operationId,
      operationType: 'SALE_REVERSAL',
      status: 'COMPLETED',
      referenceType: 'KOT_LINE',
      referenceId: String(orderId),
      referenceLineId: String(orderLineId),
      occurredAt,
      performedBy,
      metadata: {
        originalOperationId: origOperationId,
        reversalReason: reason,
        compensatedCount: compensatingTxns.length
      },
      createdAt: new Date().toISOString()
    };

    await dg.create('stock_operations', revOp);

    platformEventBus.publish('stock:balance:updated', { tenantId, operationId });
    platformEventBus.publish('inventory:reversed', { tenantId, operationId, origOperationId });

    console.log(`[InventoryConsumptionService] ↩️ Fallback reversal completed for operation ${origOperationId}. Restored ${compensatingTxns.length} items.`);
    return {
      success: true,
      reversalOperationId: operationId,
      compensatedCount: compensatingTxns.length,
      fallback: true
    };
  }

  _syncLocalCacheAfterRpc(tenantId, itemsDeducted, operationId, rpcTransactions = []) {
    const dg = this._getDataGateway();
    const rpcMap = new Map();
    if (Array.isArray(rpcTransactions)) {
      rpcTransactions.forEach(t => {
        const k = `${t.itemCode || t.item_code}_${t.locationCode || t.location_code}`;
        rpcMap.set(k, t);
      });
    }

    itemsDeducted.forEach(item => {
      const k = `${item.itemCode || item.item_code}_${item.locationCode || item.location_code}`;
      const rpcTxn = rpcMap.get(k);

      let targetQty = null;
      if (rpcTxn && rpcTxn.newBalance !== undefined) {
        targetQty = parseFloat(rpcTxn.newBalance);
      } else {
        const localBals = (dg && typeof dg.getCachedCollection === 'function' ? dg.getCachedCollection('stock_balances', tenantId) : null) || offlineStore.getCollection('stock_balances', tenantId) || [];
        const match = localBals.find(b => (b.itemCode || b.item_code) === item.itemCode && (b.locationCode || b.location_code) === item.locationCode);
        const cur = match ? parseFloat(match.quantity !== undefined ? match.quantity : (match.data?.quantity || 0)) : 0;
        targetQty = parseFloat((cur - item.quantity).toFixed(4));
      }

      if (dg && typeof dg.applyAuthoritativeStockBalance === 'function') {
        dg.applyAuthoritativeStockBalance(tenantId, item.itemCode, item.locationCode, targetQty, {
          operationId,
          source: 'RPC_SALE_CONSUMPTION'
        });
      } else {
        const localBals = offlineStore.getCollection('stock_balances', tenantId) || [];
        const idx = localBals.findIndex(b => (b.itemCode || b.item_code) === item.itemCode && (b.locationCode || b.location_code) === item.locationCode);
        if (idx >= 0) {
          const unitCost = parseFloat(localBals[idx].unitCost || localBals[idx].unit_cost || 0);
          localBals[idx].quantity = targetQty;
          localBals[idx].currentStock = targetQty;
          localBals[idx].valuation = parseFloat((targetQty * unitCost).toFixed(2));
          if (localBals[idx].data) {
            localBals[idx].data.quantity = targetQty;
            localBals[idx].data.valuation = localBals[idx].valuation;
          }
          offlineStore.setCollection('stock_balances', localBals);
          platformEventBus.publish('stock:balance:updated', {
            tenantId,
            itemCode: item.itemCode,
            locationCode: item.locationCode,
            newBalance: targetQty
          });
        }
      }
    });
  }
}

export const inventoryConsumptionService = new InventoryConsumptionService();
