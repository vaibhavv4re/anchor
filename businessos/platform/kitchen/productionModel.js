/**
 * BusinessOS / RestaurantOS - Kitchen Domain (K-04 Production Platform Model)
 * Manages Preparation BOMs, Batch Executions, Scaling, Yield Variance Tracking,
 * Stock Ledger Transactions, and Main Warehouse Stock Requisitions.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

function convertRecipeUomToNormalized(qty, recipeUom, baseUom) {
  const q = parseFloat(qty) || 0;
  const rUom = String(recipeUom || 'G').trim().toUpperCase();
  const bUom = String(baseUom || 'KG').trim().toUpperCase();

  if (bUom === 'KG') {
    if (rUom === 'G' || rUom === 'GM' || rUom === 'GRAMS' || rUom === 'GRAM') return q / 1000;
    if (rUom === 'MG' || rUom === 'MILLIGRAM') return q / 1000000;
    if (rUom === 'KG' || rUom === 'KILOGRAM') return q;
  }
  if (bUom === 'LTR' || bUom === 'L' || bUom === 'LITRE') {
    if (rUom === 'ML' || rUom === 'MILLILITRE') return q / 1000;
    if (rUom === 'LTR' || rUom === 'L') return q;
  }
  return q;
}

export class ProductionModel {
  // --- PREPARATION BOMS ---
  getPrepBoms(tenantId = null) {
    return offlineStore.getCollection('prep_boms', tenantId) || [];
  }

  getPrepBomById(id, tenantId = null) {
    const list = this.getPrepBoms(tenantId);
    return list.find(b => b.id === id) || null;
  }

  getPrepBomByItemCode(itemCode, tenantId = null) {
    const list = this.getPrepBoms(tenantId);
    return list.find(b => String(b.inventoryItemCode || b.inventory_item_code).toUpperCase() === String(itemCode).toUpperCase()) || null;
  }

  savePrepBom(data, tenantId = null) {
    const list = this.getPrepBoms(tenantId);
    const now = new Date().toISOString();
    const id = data.id || `pbom-${Math.random().toString(36).substring(2, 9)}`;

    const bomObj = {
      id,
      bomCode: data.bomCode || `PREP-${data.inventoryItemCode || 'SF0001'}`,
      inventoryItemCode: data.inventoryItemCode,
      inventoryItemName: data.inventoryItemName || data.inventoryItemCode,
      standardYieldQuantity: parseFloat(data.standardYieldQuantity) || 1,
      standardYieldUom: data.standardYieldUom || 'KG',
      version: data.version || 'v1.0',
      status: data.status || 'APPROVED', // DRAFT | APPROVED
      ingredients: data.ingredients || [],
      tenantId: data.tenantId || tenantId,
      createdAt: data.createdAt || now,
      updatedAt: now
    };

    const existingIdx = list.findIndex(b => b.id === id);
    if (existingIdx >= 0) {
      list[existingIdx] = bomObj;
    } else {
      list.unshift(bomObj);
    }

    offlineStore.setCollection('prep_boms', list);
    return bomObj;
  }

  approvePrepBom(id, tenantId = null) {
    const list = this.getPrepBoms(tenantId);
    const bom = list.find(b => b.id === id);
    if (bom) {
      bom.status = 'APPROVED';
      bom.updatedAt = new Date().toISOString();
      offlineStore.setCollection('prep_boms', list);
    }
    return bom;
  }

  deletePrepBom(id, tenantId = null) {
    const list = this.getPrepBoms(tenantId);
    const filtered = list.filter(b => b.id !== id);
    offlineStore.setCollection('prep_boms', filtered);
    return true;
  }

  // --- PRODUCTION BATCHES ---
  getBatches(tenantId = null) {
    return offlineStore.getCollection('production_batches', tenantId) || [];
  }

  getBatchById(id, tenantId = null) {
    const list = this.getBatches(tenantId);
    return list.find(b => b.id === id) || null;
  }

  startBatch(data, tenantId = null) {
    const list = this.getBatches(tenantId);
    const now = new Date();
    const batchNum = list.length + 1;
    const batchCode = data.batchCode || `PB-2026-${String(batchNum).padStart(4, '0')}`;
    const prepBom = this.getPrepBomById(data.prepBomId, tenantId);

    if (!prepBom) throw new Error('Selected Preparation BOM not found.');

    const targetQuantity = parseFloat(data.targetQuantity) || prepBom.standardYieldQuantity || 1;
    const scalingFactor = targetQuantity / prepBom.standardYieldQuantity;

    const masterInv = offlineStore.getCollection('inventory', tenantId) || [];
    const stockBalances = offlineStore.getCollection('stock_balances', tenantId) || [];

    const scaledIngredients = (prepBom.ingredients || []).map(ing => {
      const lineCode = String(ing.inventoryItemCode || ing.inventory_item_code || '');
      const baseQty = convertRecipeUomToNormalized(ing.recipeQty, ing.recipeUom, ing.baseUom);
      const scaledBaseQty = parseFloat((baseQty * scalingFactor).toFixed(4));
      const scaledRecipeQty = parseFloat((ing.recipeQty * scalingFactor).toFixed(2));

      const stockRec = stockBalances.find(s => String(s.itemCode || s.item_code || s.itemId || s.id) === lineCode);
      const currentStock = stockRec ? (parseFloat(stockRec.currentStock || stockRec.quantity || 0)) : 0;

      return {
        ...ing,
        scaledRecipeQty,
        scaledBaseQty,
        currentStock,
        hasSufficientStock: currentStock >= scaledBaseQty,
        shortageQty: currentStock < scaledBaseQty ? parseFloat((scaledBaseQty - currentStock).toFixed(4)) : 0
      };
    });

    // Check for stock shortages
    const shortages = scaledIngredients.filter(i => !i.hasSufficientStock);
    if (shortages.length > 0) {
      const summary = shortages.map(s => `${s.inventoryItemName} (Shortage: ${s.shortageQty} ${s.baseUom})`).join(', ');
      throw new Error(`Cannot start production batch: Insufficient stock for ${summary}. Please raise a stock requisition first.`);
    }

    const newBatch = {
      id: batchCode,
      batchCode,
      prepBomId: prepBom.id,
      prepBomCode: prepBom.bomCode,
      inventoryItemCode: prepBom.inventoryItemCode,
      inventoryItemName: prepBom.inventoryItemName,
      targetQuantity,
      targetUom: prepBom.standardYieldUom || 'KG',
      scalingFactor: parseFloat(scalingFactor.toFixed(2)),
      status: 'IN_PROGRESS',
      startedAt: now.toISOString(),
      completedAt: null,
      scaledIngredients,
      actualYield: null,
      actualYieldUom: prepBom.standardYieldUom || 'KG',
      yieldVariance: null,
      yieldPercent: null,
      varianceReason: null,
      notes: '',
      startedBy: 'Chef Vaibhav',
      tenantId: data.tenantId || tenantId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    list.unshift(newBatch);
    offlineStore.setCollection('production_batches', list);
    return newBatch;
  }

  completeBatch(batchId, { actualYield, varianceReason, notes }, tenantId = null) {
    const list = this.getBatches(tenantId);
    const idx = list.findIndex(b => b.id === batchId);
    if (idx === -1) throw new Error(`Batch ${batchId} not found.`);

    const batch = list[idx];
    if (batch.status === 'COMPLETED') throw new Error(`Batch ${batchId} is already completed.`);

    const now = new Date().toISOString();
    const yieldNum = parseFloat(actualYield) || batch.targetQuantity;
    const yieldVariance = parseFloat((yieldNum - batch.targetQuantity).toFixed(4));
    const yieldPercent = parseFloat(((yieldNum / batch.targetQuantity) * 100).toFixed(1));

    const stockBalances = offlineStore.getCollection('stock_balances', tenantId) || [];
    const stockTxns = offlineStore.getCollection('stock_transactions', tenantId) || [];

    // 1. Deduct consumed raw material ingredients from stock balances
    batch.scaledIngredients.forEach(ing => {
      const lineCode = String(ing.inventoryItemCode || ing.inventory_item_code);
      const qtyToDeduct = ing.scaledBaseQty;

      stockTxns.unshift({
        id: `txn-cons-${Math.random().toString(36).substring(2, 9)}`,
        referenceNo: batch.batchCode,
        transactionType: 'PRODUCTION_CONSUMPTION',
        itemCode: lineCode,
        itemName: ing.inventoryItemName,
        quantity: -qtyToDeduct,
        uom: ing.baseUom,
        notes: `Raw ingredient consumption for batch ${batch.batchCode} (${batch.inventoryItemName})`,
        timestamp: now,
        tenantId
      });

      const balIdx = stockBalances.findIndex(s => String(s.itemCode || s.item_code || s.itemId || s.id) === lineCode);
      if (balIdx >= 0) {
        const cur = parseFloat(stockBalances[balIdx].currentStock || stockBalances[balIdx].quantity || 0);
        stockBalances[balIdx].currentStock = Math.max(0, parseFloat((cur - qtyToDeduct).toFixed(4)));
        stockBalances[balIdx].updatedAt = now;
      }
    });

    // 2. Post semi-finished output yield to stock balances
    const sfCode = String(batch.inventoryItemCode);
    stockTxns.unshift({
      id: `txn-out-${Math.random().toString(36).substring(2, 9)}`,
      referenceNo: batch.batchCode,
      transactionType: 'PRODUCTION_OUTPUT',
      itemCode: sfCode,
      itemName: batch.inventoryItemName,
      quantity: yieldNum,
      uom: batch.targetUom,
      notes: `Semi-finished stock yield produced by batch ${batch.batchCode}`,
      timestamp: now,
      tenantId
    });

    const sfBalIdx = stockBalances.findIndex(s => String(s.itemCode || s.item_code || s.itemId || s.id) === sfCode);
    if (sfBalIdx >= 0) {
      const cur = parseFloat(stockBalances[sfBalIdx].currentStock || stockBalances[sfBalIdx].quantity || 0);
      stockBalances[sfBalIdx].currentStock = parseFloat((cur + yieldNum).toFixed(4));
      sfBalIdx.updatedAt = now;
    } else {
      stockBalances.push({
        id: `bal-${sfCode}`,
        itemCode: sfCode,
        itemName: batch.inventoryItemName,
        currentStock: yieldNum,
        uom: batch.targetUom,
        tenantId,
        updatedAt: now
      });
    }

    offlineStore.setCollection('stock_transactions', stockTxns);
    offlineStore.setCollection('stock_balances', stockBalances);

    const updatedBatch = {
      ...batch,
      status: 'COMPLETED',
      completedAt: now,
      actualYield: yieldNum,
      yieldVariance,
      yieldPercent,
      varianceReason: varianceReason || 'Normal Preparation Loss',
      notes: notes || '',
      updatedAt: now
    };

    list[idx] = updatedBatch;
    offlineStore.setCollection('production_batches', list);
    return updatedBatch;
  }

  // --- STOCK REQUISITIONS (KITCHEN <-> MAIN WAREHOUSE) ---
  getStockRequisitions(tenantId = null) {
    return offlineStore.getCollection('stock_requisitions', tenantId) || [];
  }

  createStockRequisition({ prepBomId, prepBomCode, inventoryItemName, targetQuantity, targetUom, items, notes }, tenantId = null) {
    const list = this.getStockRequisitions(tenantId);
    const now = new Date();
    const reqNum = list.length + 1;
    const reqCode = `REQ-2026-${String(reqNum).padStart(4, '0')}`;

    const newReq = {
      id: reqCode,
      reqCode,
      requestedBy: 'Kitchen Production Dept (Chef Vaibhav)',
      sourceLocation: 'MAIN_WAREHOUSE',
      destinationLocation: 'KITCHEN_STORE',
      prepBomId,
      prepBomCode,
      inventoryItemName,
      targetQuantity,
      targetUom,
      status: 'PENDING_WAREHOUSE_FULFILLMENT', // PENDING_WAREHOUSE_FULFILLMENT | TRANSFERRED | PO_FULFILLED | REJECTED
      items: items.map(item => ({
        inventoryItemCode: item.inventoryItemCode || item.itemCode,
        inventoryItemName: item.inventoryItemName || item.itemName,
        scaledRecipeQty: item.scaledRecipeQty || item.recipeQty,
        recipeUom: item.recipeUom,
        scaledBaseQty: item.scaledBaseQty,
        baseUom: item.baseUom,
        currentStock: item.currentStock,
        shortageQty: item.shortage || Math.max(0, parseFloat((item.scaledBaseQty - item.currentStock).toFixed(4)))
      })),
      notes: notes || `Stock requisition for production batch of ${inventoryItemName} (${targetQuantity} ${targetUom})`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    list.unshift(newReq);
    offlineStore.setCollection('stock_requisitions', list);
    return newReq;
  }

  fulfillRequisitionViaTransfer(reqId, tenantId = null) {
    const list = this.getStockRequisitions(tenantId);
    const idx = list.findIndex(r => r.id === reqId);
    if (idx === -1) throw new Error(`Requisition ${reqId} not found.`);

    const req = list[idx];
    if (req.status === 'TRANSFERRED') throw new Error(`Requisition ${reqId} is already fulfilled.`);

    const now = new Date().toISOString();
    const stockBalances = offlineStore.getCollection('stock_balances', tenantId) || [];
    const stockTxns = offlineStore.getCollection('stock_transactions', tenantId) || [];

    const sourceLoc = req.sourceLocation || 'LOC-MWH';
    const destLoc = req.destinationLocation || 'LOC-KITCHEN';

    // 1. Strict Stock Availability Check at Main Warehouse before transferring
    const unfulfilledItems = [];
    req.items.forEach(item => {
      const code = String(item.inventoryItemCode);
      const qtyToTransfer = item.shortageQty > 0 ? item.shortageQty : item.scaledBaseQty;

      // Find Main Warehouse stock balance
      const mwhBal = stockBalances.find(s => 
        String(s.itemCode || s.item_code || s.itemId || s.id) === code && 
        (s.locationCode === sourceLoc || s.locationCode === 'LOC-MWH' || s.locationCode === 'MAIN_WAREHOUSE')
      );

      const mwhQty = mwhBal ? parseFloat(mwhBal.currentStock || mwhBal.quantity || 0) : 0;
      if (mwhQty < qtyToTransfer) {
        unfulfilledItems.push({
          itemName: item.inventoryItemName,
          available: mwhQty,
          required: qtyToTransfer,
          uom: item.baseUom
        });
      }
    });

    if (unfulfilledItems.length > 0) {
      const details = unfulfilledItems.map(u => `• ${u.itemName}: On-Hand ${u.available} ${u.uom}, Required Shortage ${u.required} ${u.uom}`).join('\n');
      throw new Error(`Cannot fulfill via Stock Transfer! Insufficient stock available in Main Warehouse:\n\n${details}\n\nPlease raise a Supplier Purchase Order (PO) to procure required stock.`);
    }

    // 2. Perform Transfer: Deduct from Main Warehouse & Credit to Kitchen Store
    req.items.forEach(item => {
      const code = String(item.inventoryItemCode);
      const qtyToTransfer = item.shortageQty > 0 ? item.shortageQty : item.scaledBaseQty;

      // Deduct from Main Warehouse
      const mwhBalIdx = stockBalances.findIndex(s => 
        String(s.itemCode || s.item_code || s.itemId || s.id) === code && 
        (s.locationCode === sourceLoc || s.locationCode === 'LOC-MWH' || s.locationCode === 'MAIN_WAREHOUSE')
      );
      if (mwhBalIdx >= 0) {
        const curMwh = parseFloat(stockBalances[mwhBalIdx].currentStock || stockBalances[mwhBalIdx].quantity || 0);
        stockBalances[mwhBalIdx].currentStock = Math.max(0, parseFloat((curMwh - qtyToTransfer).toFixed(4)));
        stockBalances[mwhBalIdx].updatedAt = now;
      }

      // Credit to Kitchen Store
      let kitchenBalIdx = stockBalances.findIndex(s => 
        String(s.itemCode || s.item_code || s.itemId || s.id) === code && 
        (s.locationCode === destLoc || s.locationCode === 'LOC-KITCHEN' || s.locationCode === 'KITCHEN_STORE')
      );
      
      if (kitchenBalIdx >= 0) {
        const curKit = parseFloat(stockBalances[kitchenBalIdx].currentStock || stockBalances[kitchenBalIdx].quantity || 0);
        stockBalances[kitchenBalIdx].currentStock = parseFloat((curKit + qtyToTransfer).toFixed(4));
        stockBalances[kitchenBalIdx].updatedAt = now;
      } else {
        stockBalances.push({
          id: `bal-${code}-kit`,
          itemCode: code,
          itemName: item.inventoryItemName,
          locationCode: destLoc,
          currentStock: qtyToTransfer,
          uom: item.baseUom,
          tenantId,
          updatedAt: now
        });
      }

      // Record Stock Ledger Entry
      stockTxns.unshift({
        id: `txn-trin-${Math.random().toString(36).substring(2, 9)}`,
        referenceNo: req.reqCode,
        transactionType: 'STOCK_TRANSFER_IN',
        itemCode: code,
        itemName: item.inventoryItemName,
        quantity: qtyToTransfer,
        uom: item.baseUom,
        fromLocationCode: sourceLoc,
        toLocationCode: destLoc,
        notes: `Stock transfer from Main Warehouse to Kitchen Store for Requisition ${req.reqCode}`,
        timestamp: now,
        tenantId
      });
    });

    offlineStore.setCollection('stock_transactions', stockTxns);
    offlineStore.setCollection('stock_balances', stockBalances);

    req.status = 'TRANSFERRED';
    req.fulfilledAt = now;
    req.fulfillmentType = 'MAIN_WAREHOUSE_TRANSFER';
    req.updatedAt = now;

    list[idx] = req;
    offlineStore.setCollection('stock_requisitions', list);
    return req;
  }

  fulfillRequisitionViaPO(reqId, poDetails = {}, tenantId = null) {
    const list = this.getStockRequisitions(tenantId);
    const idx = list.findIndex(r => r.id === reqId);
    if (idx === -1) throw new Error(`Requisition ${reqId} not found.`);

    const req = list[idx];
    const now = new Date().toISOString();
    const poNumber = poDetails.poNumber || `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const stockBalances = offlineStore.getCollection('stock_balances', tenantId) || [];
    const stockTxns = offlineStore.getCollection('stock_transactions', tenantId) || [];

    req.items.forEach(item => {
      const code = String(item.inventoryItemCode);
      const qtyToAdd = item.shortageQty > 0 ? item.shortageQty : item.scaledBaseQty;

      stockTxns.unshift({
        id: `txn-po-${Math.random().toString(36).substring(2, 9)}`,
        referenceNo: poNumber,
        transactionType: 'PURCHASE_ORDER_RECEIPT',
        itemCode: code,
        itemName: item.inventoryItemName,
        quantity: qtyToAdd,
        uom: item.baseUom,
        notes: `Supplier PO Receipt for Kitchen Requisition ${req.reqCode} (PO #${poNumber})`,
        timestamp: now,
        tenantId
      });

      const balIdx = stockBalances.findIndex(s => String(s.itemCode || s.item_code || s.itemId || s.id) === code);
      if (balIdx >= 0) {
        const cur = parseFloat(stockBalances[balIdx].currentStock || stockBalances[balIdx].quantity || 0);
        stockBalances[balIdx].currentStock = parseFloat((cur + qtyToAdd).toFixed(4));
        stockBalances[balIdx].updatedAt = now;
      } else {
        stockBalances.push({
          id: `bal-${code}`,
          itemCode: code,
          itemName: item.inventoryItemName,
          currentStock: qtyToAdd,
          uom: item.baseUom,
          tenantId,
          updatedAt: now
        });
      }
    });

    offlineStore.setCollection('stock_transactions', stockTxns);
    offlineStore.setCollection('stock_balances', stockBalances);

    req.status = 'PO_FULFILLED';
    req.fulfilledAt = now;
    req.fulfillmentType = 'SUPPLIER_PURCHASE_ORDER';
    req.poNumber = poNumber;
    req.updatedAt = now;

    list[idx] = req;
    offlineStore.setCollection('stock_requisitions', list);
    return req;
  }
}

export const productionModel = new ProductionModel();
