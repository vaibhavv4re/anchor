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
import { resolveBarConsumption, BAR_SKU_MAP, BAR_COCKTAIL_CODES } from '../bar/barConsumptionMapping.js';

export function isBarInventorySku(itemCode) {
  const code = String(itemCode || '').toUpperCase().trim();
  if (!code) return false;
  if (code.startsWith('BAR')) return true;
  if (code.startsWith('RC-BAR-')) return true;
  if (BAR_COCKTAIL_CODES.has(code)) return true;
  if (Object.values(BAR_SKU_MAP).includes(code)) return true;
  if (BAR_SKU_MAP[code]) return true;
  return false;
}

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
   * Authoritatively enforces Bar Store (LOC-314) isolation for Bar inventory SKUs.
   * Prioritizes kitchen locations (LOC-886, LOC-KIT, LOC-901, LOC-KITCHEN) for food ingredients.
   */
  resolveLocationForItem(itemCode, tenantId = 'tenant_h0qc7wf') {
    // 1. Authoritative Bar Store isolation: all Bar SKUs strictly map to LOC-314
    if (isBarInventorySku(itemCode)) {
      return 'LOC-314';
    }

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

    // 2. Kitchen Store match
    const kitBal = balances.find(b => {
      const code = norm(b.itemCode || b.item_code);
      const loc = String(b.locationCode || b.location_code || '').toUpperCase().trim();
      const isKit = loc === 'LOC-886' || loc === 'LOC-KIT' || loc === 'LOC-901' || loc === 'LOC-KITCHEN' || loc.includes('KIT');
      return (code === target || code.includes(target) || target.includes(code)) && isKit;
    });
    if (kitBal) return kitBal.locationCode || kitBal.location_code;

    // 3. Any non-bar location match
    const anyBal = balances.find(b => {
      const code = norm(b.itemCode || b.item_code);
      const loc = String(b.locationCode || b.location_code || '').toUpperCase().trim();
      return (code === target || code.includes(target) || target.includes(code)) && loc !== 'LOC-314';
    });
    if (anyBal) return anyBal.locationCode || anyBal.location_code;

    // 4. Authoritative kitchen default
    return 'LOC-886';
  }

  /**
   * Authoritative sale consumption execution for an ordered line item.
   * Triggered when Chef/Bartender marks item READY in KDS/BDS.
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

    // 1. Determine domain: Bar vs Kitchen
    const itemId = item.itemId || item.itemCode || item.id;
    const menuItems = offlineStore.getCollection('kitchen_menu_items', tId) || [];
    const menuItem = menuItems.find(m => m.id === itemId || m.itemCode === itemId || m.item_code === itemId) || null;

    const itemCodeUpper = String(item.itemCode || item.itemId || menuItem?.itemCode || '').toUpperCase().trim();
    const catUpper = String(item.category || menuItem?.category || '').toUpperCase().trim();
    const isBar = (item.productionArea === 'BAR' || item.routing === 'BAR_LINE' || item.routing === 'BAR' || item.destination === 'BAR') ||
      (menuItem && (menuItem.productionArea === 'BAR' || menuItem.routing === 'BAR_LINE' || menuItem.routing === 'BAR' || catUpper.includes('BAR') || catUpper.includes('BEER') || catUpper.includes('WINE') || catUpper.includes('WHISKY') || catUpper.includes('COCKTAIL') || catUpper.includes('MOCKTAIL') || catUpper.includes('BRANDY') || catUpper.includes('GIN') || catUpper.includes('VODKA') || catUpper.includes('RUM') || catUpper.includes('TEQUILA') || catUpper.includes('BREEZER'))) ||
      Boolean(BAR_SKU_MAP[itemCodeUpper]) ||
      BAR_COCKTAIL_CODES.has(itemCodeUpper) ||
      itemCodeUpper.startsWith('RC-BAR-');

    let resolved = null;

    if (isBar) {
      // Bar Item Domain Branch
      const isRecipeCocktail = BAR_COCKTAIL_CODES.has(itemCodeUpper) || 
        catUpper.includes('COCKTAIL') || 
        catUpper.includes('MOCKTAIL');

      if (isRecipeCocktail) {
        // Check if an approved or published recipe exists
        const recipes = offlineStore.getCollection('recipes', tId) || [];
        const targetRecipeId = item.recipeId || menuItem?.recipeId;
        const approvedRecipe = recipes.find(r => 
          (r.status === 'APPROVED' || r.status === 'PUBLISHED') && (
            (targetRecipeId && (r.id === targetRecipeId || r.recipeId === targetRecipeId || r.recipeCode === targetRecipeId)) ||
            r.menuItemId === itemId || 
            r.menu_item_id === itemId ||
            r.menuItemCode === itemCodeUpper ||
            r.menu_item_code === itemCodeUpper
          )
        );

        if (approvedRecipe) {
          // Resolve approved Bar recipe BOM
          resolved = resolvedBomEngine.resolveOrderLineBOM(item, tId);
        } else {
          // Explicit hard gate for the 14 un-recipied drinks
          resolved = {
            domain: 'BAR',
            mode: 'RECIPE',
            recipeRequired: true,
            recipeMissing: true,
            deductionDisabled: true,
            warningCode: 'RECIPE_MISSING_DEDUCTION_DISABLED',
            consumption: []
          };
        }
      } else {
        // Deterministic POUR or UNIT Bar Item
        // Variant resolution must never blindly match on undefined === undefined (defaulted to first
        // variant, e.g. 30ml peg deducted for a 60ml order line). Match explicit ids/names first,
        // then fall back to order-line name containment ("Singleton … (60 ml)" contains "60 ml").
        const variantObj = item.variant || (menuItem && Array.isArray(menuItem.variants)
          ? menuItem.variants.find(v => (item.variantId && (v.variantId === item.variantId || v.id === item.variantId || v.variantCode === item.variantId)) ||
              (item.variantName && (v.name === item.variantName || v.variantName === item.variantName)) ||
              (!item.variantId && !item.variantName && v.name && String(item.name || item.itemName || '').toLowerCase().includes(String(v.name).toLowerCase())))
          : null);
        
        const barResult = resolveBarConsumption(menuItem || { itemCode: itemCodeUpper, itemName: item.name || item.itemName }, variantObj, { orderQty: item.quantity || 1 });

        if (barResult && barResult.success && barResult.totalDeduction > 0) {
          resolved = {
            domain: 'BAR',
            mode: barResult.mode,
            recipeRequired: false,
            deductionDisabled: false,
            bomVersionId: 'v1.0',
            consumption: [
              {
                inventoryItemCode: barResult.inventoryItemCode,
                inventoryItemName: barResult.inventoryItemName,
                itemType: 'BAR_SKU',
                quantity: barResult.totalDeduction,
                uom: barResult.baseUom || 'LTR',
                source: `BAR_${barResult.mode}_MAPPING`,
                locationCode: 'LOC-314'
              }
            ]
          };
        } else {
          resolved = {
            domain: 'BAR',
            mode: barResult?.mode || 'UNKNOWN',
            recipeRequired: false,
            deductionDisabled: true,
            warningCode: 'BAR_CONSUMPTION_UNRESOLVED',
            consumption: []
          };
        }
      }
    } else {
      // Kitchen Item Domain Branch: Generic Kitchen BOM Resolver
      resolved = resolvedBomEngine.resolveOrderLineBOM(item, tId);
    }

    // Step 2: Hard gate for deductionDisabled (Cocktail safeguard)
    if (resolved && resolved.deductionDisabled) {
      console.warn(`[InventoryConsumptionService] ⚠️ ${resolved.warningCode || 'Deduction Disabled'} for line item "${item.name || item.itemName || item.itemCode}". Skipping consumption without stock mutation.`);
      return {
        success: false,
        status: 'SKIPPED',
        reason: resolved.warningCode || 'RECIPE_MISSING_DEDUCTION_DISABLED',
        warningCode: resolved.warningCode || 'RECIPE_MISSING_DEDUCTION_DISABLED',
        operationId
      };
    }

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

    // 2b. Normalize every deduction line to the target stock balance UOM BEFORE execution.
    // The deployed rpc_record_sale_consumption compares p_items.quantity directly against
    // stock_balances.quantity without UOM conversion (200 ML vs 9.4 LTR falsely short-circuits
    // with INSUFFICIENT_STOCK), and its error path skips the client fallback entirely.
    const balCache = offlineStore.getCollection('stock_balances', tId) || [];
    itemsToDeduct.forEach(d => {
      const bal = balCache.find(b =>
        (b.itemCode || b.item_code) === d.itemCode &&
        (b.locationCode || b.location_code) === d.locationCode);
      const balUom = String(bal?.uom || bal?.base_uom || bal?.data?.baseUom || bal?.data?.base_uom ||
        (isBarInventorySku(d.itemCode) ? 'LTR' : 'KG')).toUpperCase();
      const rawQty = this._sanitizeBarDeductionQuantity(d);
      d.quantity = parseFloat(this._convertDeductionQuantity(rawQty, d.uom, balUom).toFixed(4));
      d.uom = balUom;
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
   * Normalize recipe BOM quantity to target stock balance unit of measure
   */
  _convertDeductionQuantity(qty, fromUom, targetUom) {
    const q = parseFloat(qty) || 0;
    const from = String(fromUom || '').toUpperCase().trim();
    const to = String(targetUom || '').toUpperCase().trim();

    if (!from || !to || from === to) return q;

    // ML to LTR / L
    if (from === 'ML' && (to === 'LTR' || to === 'L')) return q / 1000;
    // LTR / L to ML
    if ((from === 'LTR' || from === 'L') && to === 'ML') return q * 1000;

    // G to KG
    if (from === 'G' && to === 'KG') return q / 1000;
    // KG to G
    if (from === 'KG' && to === 'G') return q * 1000;

    // Liquid density equivalence (1 KG = 1 LTR, 1 G = 1 ML)
    if (from === 'KG' && (to === 'LTR' || to === 'L')) return q;
    if ((from === 'LTR' || from === 'L') && to === 'KG') return q;
    if (from === 'G' && (to === 'LTR' || to === 'L')) return q / 1000;
    if (from === 'ML' && to === 'KG') return q / 1000;

    return q;
  }

  /**
   * Data-quality safeguard for Bar SKUs (B-02B invariant: bar SKUs are stock-managed in LTR at LOC-314).
   * Recipe authoring mistakes historically stored ML-scale peg numbers with weight UOM (e.g. Gin "0.6 KG"
   * for a 600 ML batch entry), which the KG=LTR density equivalence silently inflated into 0.6 LTR per peg.
   * Bar SKU lines carrying weight UOM are therefore normalized to liquid volume before deduction.
   * @returns {number} sanitized quantity in dItem.uom (still converted to balance UOM by caller)
   */
  _sanitizeBarDeductionQuantity(dItem) {
    let qty = Math.abs(parseFloat(dItem.quantity) || 0);
    if (!qty || !isBarInventorySku(dItem.itemCode)) return qty;

    const from = String(dItem.uom || '').toUpperCase().trim();
    if (from === 'KG' || from === 'G') {
      console.warn(`[InventoryConsumptionService] \u26a0\ufe0f Bar SKU ${dItem.itemCode} BOM line has weight UOM (${qty} ${from}); normalizing to liquid volume for LTR-based bar stock.`);
      const mlScale = from === 'KG' ? qty * 1000 : qty;
      qty = mlScale > 5000 ? mlScale / 1000 : mlScale;
      dItem.uom = 'ML';
    } else if ((from === 'LTR' || from === 'L') && qty > 5) {
      console.warn(`[InventoryConsumptionService] \u26a0\ufe0f Bar SKU ${dItem.itemCode} quantity ${qty} ${from} exceeds sane per-line bound; interpreting as ML-scale entry error.`);
      qty = qty / 1000;
      dItem.uom = 'ML';
    }
    return qty;
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

      const balUom = (match?.uom || match?.base_uom || match?.data?.baseUom || match?.data?.base_uom || match?.data?.uom || (isBarInventorySku(dItem.itemCode) ? 'LTR' : 'KG')).toUpperCase();
      const currentQty = match ? parseFloat(match.quantity !== undefined ? match.quantity : (match.data?.quantity || 0)) : 0;
      const rawDeductQty = this._sanitizeBarDeductionQuantity(dItem);
      const deductQty = parseFloat(this._convertDeductionQuantity(rawDeductQty, dItem.uom, balUom).toFixed(4));

      if (!match || currentQty < deductQty) {
        const avail = match ? currentQty : 0;
        throw new Error(`INSUFFICIENT_STOCK: Item ${dItem.itemCode} at ${dItem.locationCode} requires ${deductQty} ${balUom} (${rawDeductQty} ${dItem.uom}), but only ${avail} is available`);
      }

      const unitCost = parseFloat(match.unitCost || match.unit_cost || (match.data?.unitCost) || 0);
      const newQty = parseFloat((currentQty - deductQty).toFixed(4));
      const newVal = parseFloat((newQty * unitCost).toFixed(2));

      balanceUpdates.push({
        balanceRecord: match,
        deductQty,
        balUom,
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
        uom: bUp.balUom,
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
          p_reversal_operation_id: operationId,
          p_original_operation_id: origOperationId,
          p_reason: reason,
          p_occurred_at: occurredAt,
          p_performed_by: performedBy
        };

        const rpcRes = await dg.rpc('rpc_reverse_sale_consumption', rpcPayload);
        if (rpcRes && rpcRes.success && rpcRes.data) {
          const resData = rpcRes.data;
          console.log(`[InventoryConsumptionService] PostgreSQL RPC rpc_reverse_sale_consumption success:`, resData);

          // Update local cache and offline store from reversed transactions
          if (Array.isArray(resData.reversedTransactions)) {
            const localBals = offlineStore.getCollection('stock_balances', tId) || [];
            resData.reversedTransactions.forEach(rt => {
              const itemCode = rt.itemCode || rt.item_code;
              const locCode = rt.locationCode || rt.location_code;
              const newBal = rt.newBalance !== undefined ? parseFloat(rt.newBalance) : null;
              if (itemCode && locCode && newBal !== null) {
                const bIdx = localBals.findIndex(b => (b.itemCode || b.item_code) === itemCode && (b.locationCode || b.location_code) === locCode);
                if (bIdx >= 0) {
                  const unitCost = parseFloat(localBals[bIdx].unitCost || localBals[bIdx].unit_cost || 0);
                  localBals[bIdx].quantity = newBal;
                  localBals[bIdx].currentStock = newBal;
                  localBals[bIdx].valuation = parseFloat((newBal * unitCost).toFixed(2));
                  if (localBals[bIdx].data) {
                    localBals[bIdx].data.quantity = newBal;
                    localBals[bIdx].data.valuation = localBals[bIdx].valuation;
                  }
                }
              }
            });
            offlineStore.setCollection('stock_balances', localBals);
          }

          platformEventBus.publish('stock:balance:updated', { tenantId: tId, operationId });
          platformEventBus.publish('inventory:reversed', { tenantId: tId, operationId, origOperationId });
          return resData;
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
