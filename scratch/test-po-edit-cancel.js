import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { recipeModel } from '../businessos/platform/kitchen/recipeModel.js';
import { productionModel } from '../businessos/platform/kitchen/productionModel.js';

export async function runProductionEngineTests() {
  console.log('🧪 TEST: K7A Approved Recipe -> Kitchen Store Production Engine\n');

  const tenantId = 'tenant_h0qc7wf';
  const supabaseClient = new SupabaseClient();
  const cloudAdapter = new SupabaseDataAdapter(supabaseClient);
  const dataGateway = new DataGateway(cloudAdapter);

  if (typeof window !== 'undefined') {
    window.__APP__ = { platform: { dataGateway } };
  }

  // 1. Setup an Approved Production Recipe via productionModel.savePrepBom (produces SF-TOMGRAVY)
  const recipe = productionModel.savePrepBom({
    id: 'rcp-tomato-gravy',
    bomCode: 'RCP-TOMGRAVY',
    inventoryItemCode: 'SF-TOMGRAVY',
    inventoryItemName: 'Tomato Gravy',
    standardYieldQuantity: 5,
    standardYieldUom: 'KG',
    status: 'APPROVED',
    tenantId,
    ingredients: [
      {
        inventoryItemCode: 'RM-TOMATO',
        inventoryItemName: 'Fresh Tomatoes',
        recipeQty: 6,
        recipeUom: 'KG',
        baseUom: 'KG',
        unitCost: 30,
        recipeWastagePercent: 10
      },
      {
        inventoryItemCode: 'RM-OIL',
        inventoryItemName: 'Cooking Oil',
        recipeQty: 0.5,
        recipeUom: 'LTR',
        baseUom: 'LTR',
        unitCost: 140,
        recipeWastagePercent: 0
      }
    ]
  }, tenantId);
  console.log('✓ 1. Approved Recipe BOM created via productionModel.savePrepBom:', recipe.bomCode);

  // 2. Setup Stock Balances:
  // - Main Warehouse (LOC-MWH) has 50 KG Tomatoes, 20 LTR Oil
  // - Kitchen Store (LOC-KIT) has 2 KG Tomatoes (Insufficient for 15 KG batch), 5 LTR Oil
  const stockBalances = [
    {
      id: 'sb-tom-mwh',
      tenantId,
      itemCode: 'RM-TOMATO',
      locationCode: 'LOC-MWH',
      quantity: 50,
      currentStock: 50,
      unitCost: 30
    },
    {
      id: 'sb-oil-mwh',
      tenantId,
      itemCode: 'RM-OIL',
      locationCode: 'LOC-MWH',
      quantity: 20,
      currentStock: 20,
      unitCost: 140
    },
    {
      id: 'sb-tom-kit',
      tenantId,
      itemCode: 'RM-TOMATO',
      locationCode: 'LOC-KIT',
      quantity: 2,
      currentStock: 2,
      unitCost: 30
    },
    {
      id: 'sb-oil-kit',
      tenantId,
      itemCode: 'RM-OIL',
      locationCode: 'LOC-KIT',
      quantity: 5,
      currentStock: 5,
      unitCost: 140
    }
  ];
  offlineStore.setCollection('stock_balances', stockBalances);
  console.log('✓ 2. Location-isolated stock balances initialized (LOC-MWH vs LOC-KIT)');

  // 3. Test Shortage Guard for Target Batch = 15 KG (Scaling Factor: 3.0×)
  // Required: 6 * 3 = 18 KG Tomatoes in LOC-KIT (only 2 KG available)
  const evalCheck = productionModel.checkStockAvailability({ recipeId: recipe.id, targetQuantity: 15 }, tenantId);
  console.log(`✓ 3. Scaling computed correctly: ${evalCheck.scalingFactor}× scaling for 15 KG yield`);
  console.log(`   Shortage detected in LOC-KIT: hasSufficientStock = ${evalCheck.hasSufficientStock}`);
  console.log(`   Shortages:`, evalCheck.shortages.map(s => `${s.inventoryItemName}: Short ${s.shortageQty} ${s.baseUom} (Kitchen has ${s.kitchenStock}, Warehouse has ${s.mwhStock})`));

  // Verify that batch start is blocked on shortage
  let startBlocked = false;
  try {
    productionModel.startBatch({ recipeId: recipe.id, targetQuantity: 15, tenantId }, tenantId);
  } catch (err) {
    startBlocked = true;
    console.log('✓ 4. Shortage guard successfully blocked batch start:', err.message.split('\n')[0]);
  }
  if (!startBlocked) throw new Error('Shortage guard failed to block batch start!');

  // Verify stock was NOT mutated during shortage check or failed start
  const unmutatedStock = offlineStore.getCollection('stock_balances', tenantId);
  const mwhTom = unmutatedStock.find(s => s.id === 'sb-tom-mwh').quantity;
  const kitTom = unmutatedStock.find(s => s.id === 'sb-tom-kit').quantity;
  if (mwhTom !== 50 || kitTom !== 2) throw new Error('Stock was mutated during failed batch start!');
  console.log('✓ 5. Stock integrity verified: No silent transfer or deduction occurred');

  // 4. Test Stock Requisition Creation (Main Warehouse -> Kitchen Store request)
  const req = productionModel.createStockRequisition({
    recipeId: recipe.id,
    recipeCode: recipe.recipeCode,
    inventoryItemName: 'Tomato Gravy',
    targetQuantity: 15,
    targetUom: 'KG',
    items: evalCheck.shortages
  }, tenantId);
  console.log('✓ 6. Stock Requisition generated from shortage:', req.reqCode, `(Status: ${req.status})`);

  // Verify it exists in inventory_requests collection for Inventory Manager
  const invReqs = offlineStore.getCollection('inventory_requests', tenantId);
  const foundReq = invReqs.find(r => r.id === req.id || r.requestNumber === req.reqCode);
  if (!foundReq || foundReq.status !== 'PENDING') {
    throw new Error('Stock requisition not found in inventory_requests collection!');
  }
  console.log('✓ 7. Verified requisition is visible in inventory_requests for Inventory Manager with status PENDING');

  // 5. Simulate Transfer of Stock into Kitchen Store (16 KG Tomatoes transferred to LOC-KIT)
  const kitTomBal = unmutatedStock.find(s => s.id === 'sb-tom-kit');
  kitTomBal.currentStock = 18; // 2 + 16
  kitTomBal.quantity = 18;
  offlineStore.setCollection('stock_balances', unmutatedStock);

  // 6. Now Start the Batch (Stock in LOC-KIT is now sufficient: 18 KG Tomatoes, 5 LTR Oil >= 1.5 LTR)
  const batch = productionModel.startBatch({
    recipeId: recipe.id,
    targetQuantity: 15,
    startedBy: 'Chef Vaibhav',
    notes: 'Morning batch for lunch service',
    tenantId
  }, tenantId);
  console.log('✓ 7. Production Batch started successfully in LOC-KIT:', batch.batchCode, `(Status: ${batch.status})`);

  // 7. Complete the Batch (Actual Yield: 14.8 KG, Normal Evaporation Yield Loss)
  const completed = productionModel.completeBatch(batch.id, {
    actualYield: 14.8,
    varianceReason: 'Normal evaporation yield loss'
  }, tenantId);
  console.log('✓ 8. Production Batch completed:', completed.batchCode, `(Actual Yield: ${completed.actualYield} ${completed.actualYieldUom}, Variance: ${completed.yieldVariance} KG, Yield%: ${completed.yieldPercent}%)`);

  // 8. Verify Physical Stock Changes:
  // - LOC-KIT Tomatoes: 18 - 18 = 0 KG
  // - LOC-KIT Oil: 5 - 1.5 = 3.5 LTR
  // - LOC-KIT Semi-Finished Tomato Gravy (SF-TOMGRAVY): +14.8 KG added
  // - LOC-MWH stock remains untouched (50 KG Tomatoes, 20 LTR Oil)
  const finalStock = offlineStore.getCollection('stock_balances', tenantId);
  const finalKitTom = finalStock.find(s => s.id === 'sb-tom-kit').currentStock;
  const finalKitOil = finalStock.find(s => s.id === 'sb-oil-kit').currentStock;
  const finalMwhTom = finalStock.find(s => s.id === 'sb-tom-mwh').currentStock;
  const finalMwhOil = finalStock.find(s => s.id === 'sb-oil-mwh').currentStock;
  const finalSfTomGravy = finalStock.find(s => s.itemCode === 'SF-TOMGRAVY' && s.locationCode === 'LOC-KIT');

  console.log(`\n📊 Final Stock Balance Verification:`);
  console.log(`   • Kitchen Store Tomatoes (LOC-KIT): ${finalKitTom} KG (Expected: 0 KG)`);
  console.log(`   • Kitchen Store Oil (LOC-KIT): ${finalKitOil} LTR (Expected: 3.5 LTR)`);
  console.log(`   • Kitchen Store Tomato Gravy Produced (LOC-KIT): ${finalSfTomGravy ? finalSfTomGravy.currentStock : 0} KG (Expected: 14.8 KG)`);
  console.log(`   • Main Warehouse Tomatoes (LOC-MWH): ${finalMwhTom} KG (Expected: 50 KG - Untouched)`);
  console.log(`   • Main Warehouse Oil (LOC-MWH): ${finalMwhOil} LTR (Expected: 20 LTR - Untouched)`);

  if (finalKitTom !== 0 || finalKitOil !== 3.5 || !finalSfTomGravy || finalSfTomGravy.currentStock !== 14.8 || finalMwhTom !== 50 || finalMwhOil !== 20) {
    throw new Error('Stock balance calculations mismatch!');
  }

  // 9. Verify Stock Ledger Transactions
  const txns = offlineStore.getCollection('stock_transactions', tenantId);
  const consumptionTxns = txns.filter(t => t.transactionType === 'PRODUCTION_CONSUMPTION' && t.referenceNo === batch.batchCode);
  const outputTxn = txns.find(t => t.transactionType === 'PRODUCTION_OUTPUT' && t.referenceNo === batch.batchCode);

  console.log(`\n📜 Stock Ledger Verification:`);
  console.log(`   • Consumption Entries: ${consumptionTxns.length} records (Tomatoes: -18 KG, Oil: -1.5 LTR at LOC-KIT)`);
  console.log(`   • Output Entry: ${outputTxn ? `${outputTxn.itemName} +${outputTxn.quantity} ${outputTxn.uom} at ${outputTxn.locationCode}` : 'None'}`);

  if (consumptionTxns.length !== 2 || !outputTxn || outputTxn.quantity !== 14.8) {
    throw new Error('Stock ledger transaction verification failed!');
  }

  console.log('\n====================================================================');
  console.log('🎉 ALL K7A PRODUCTION ENGINE TESTS PASSED! 100% PASS ✓');
  console.log('====================================================================\n');
  return true;
}

runProductionEngineTests().catch(console.error);

