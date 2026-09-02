import { purchasingModel } from '../businessos/platform/inventory/purchasingModel.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function testPoGrnStockLedgerLifecycle() {
  console.log('----------------------------------------------------');
  console.log('📄 COMPREHENSIVE PO → GRN → STOCK LEDGER LIFECYCLE AUDIT');
  console.log('----------------------------------------------------\n');

  const tenantId = 'tenant_h0qc7wf';

  // 1. Create APPROVED Multi-Line Purchase Order
  console.log('1. Creating APPROVED Purchase Order with 3 line items...');
  const po = purchasingModel.createPurchaseOrder({
    supplierCode: 'SUP-101',
    supplierName: 'Fresh Farm Produce Pvt Ltd',
    destinationLocationCode: 'LOC-886',
    orderDate: '2026-09-03',
    expectedDeliveryDate: '2026-09-06',
    notes: 'Weekly store replenishment order',
    paymentTerms: 'Net 15',
    status: 'APPROVED',
    lines: [
      { itemCode: 'RM0309', itemName: 'Fresh Onion', supplierSku: 'ON-50', quantity: 50, uom: 'BAG', catalogueUnitPrice: 2000.00, poUnitPrice: 2000.00 },
      { itemCode: 'RM0702', itemName: 'Carrots', supplierSku: 'SUP-101-RM0702', quantity: 20, uom: 'KG', catalogueUnitPrice: 57.00, poUnitPrice: 57.00 },
      { itemCode: 'RM0701', itemName: 'Potatoes', supplierSku: 'SUP-101-RM0701', quantity: 50, uom: 'KG', catalogueUnitPrice: 32.00, poUnitPrice: 32.00 }
    ],
    tenantId
  });

  console.log(`   ✓ PO Created: ${po.poNumber}`);
  console.log(`   Initial PO Status: ${po.status}`);
  console.log(`   Total Ordered Lines: ${po.lines.length}`);
  console.log(`   PO Grand Total: ₹${po.grandTotal}`);

  // Fetch initial stock balances
  const initialBalances = offlineStore.getCollection('stock_balances') || [];
  const getBal = (itemCode) => {
    const b = initialBalances.find(x => x.itemCode === itemCode || x.item_code === itemCode);
    return b ? parseFloat(b.quantity || 0) : 0;
  };

  const initialOnions = getBal('RM0309');
  const initialCarrots = getBal('RM0702');
  const initialPotatoes = getBal('RM0701');

  // 2. Post GRN 1: Partial receiving with rejection & price variance
  console.log('\n2. Posting GRN 1 (Partial Receiving with Rejection & Price Variance)...');
  console.log('   Onions: 50 received / 50 accepted @ ₹2000');
  console.log('   Carrots: 18 received / 18 accepted @ ₹57');
  console.log('   Potatoes: 50 received / 47 accepted / 3 rejected @ ₹35 (PO price ₹32)');

  const grn1Result = purchasingModel.createGoodsReceiptNote({
    poId: po.id,
    supplierInvoiceNo: 'INV-2026-88',
    receiptDate: '2026-09-03',
    supplierInvoiceTotal: 102140.00,
    lines: [
      { itemCode: 'RM0309', receivedQty: 50, acceptedQty: 50, rejectedQty: 0, actualInvoicePrice: 2000.00 },
      { itemCode: 'RM0702', receivedQty: 18, acceptedQty: 18, rejectedQty: 0, actualInvoicePrice: 57.00 },
      { itemCode: 'RM0701', receivedQty: 50, acceptedQty: 47, rejectedQty: 3, actualInvoicePrice: 35.00 } // Variance +₹3
    ],
    tenantId
  });

  console.log(`   ✓ GRN 1 Posted: ${grn1Result.grn.grnNumber}`);
  console.log(`   New PO Status: ${grn1Result.poStatus}`);

  // Fetch updated PO line accumulation
  const poAfterGrn1 = purchasingModel.getPurchaseOrderById(po.id, tenantId);
  console.log(`   Accumulated PO Line Statuses after GRN 1:`);
  poAfterGrn1.lines.forEach(l => {
    console.log(`     - ${l.itemName} (${l.itemCode}): Ordered=${l.orderedQty}, Rec=${l.previouslyReceivedQty}, Acc=${l.previouslyAcceptedQty}, Rej=${l.previouslyRejectedQty}, Remaining=${l.remainingQty}`);
  });

  // Verify stock balances increased ONLY by acceptedQty
  const updatedBalances = offlineStore.getCollection('stock_balances') || [];
  const getBalNew = (itemCode) => {
    const b = updatedBalances.find(x => x.itemCode === itemCode || x.item_code === itemCode);
    return b ? parseFloat(b.quantity || 0) : 0;
  };

  const deltaOnions = getBalNew('RM0309') - initialOnions;
  const deltaCarrots = getBalNew('RM0702') - initialCarrots;
  const deltaPotatoes = getBalNew('RM0701') - initialPotatoes;

  console.log(`\n   Stock Balance Increases:`);
  console.log(`     - Onions Delta: +${deltaOnions} (Expected +50)`);
  console.log(`     - Carrots Delta: +${deltaCarrots} (Expected +18)`);
  console.log(`     - Potatoes Delta: +${deltaPotatoes} (Expected +47, NOT 50)`);

  if (deltaPotatoes !== 47) {
    console.error(`❌ STOCK BALANCES ERROR: Expected +47 potatoes, got +${deltaPotatoes}`);
    process.exit(1);
  }
  if (poAfterGrn1.status !== 'PARTIALLY_RECEIVED') {
    console.error(`❌ PO STATUS ERROR: Expected PARTIALLY_RECEIVED, got ${poAfterGrn1.status}`);
    process.exit(1);
  }

  // 3. Test Over-Receipt Protection
  console.log('\n3. Testing Over-Receipt Protection Guard...');
  console.log('   Attempting to receive 5 KG Carrots when remaining quantity is 2 KG...');
  try {
    purchasingModel.createGoodsReceiptNote({
      poId: po.id,
      supplierInvoiceNo: 'INV-OVER-RECEIPT',
      receiptDate: '2026-09-03',
      lines: [
        { itemCode: 'RM0702', receivedQty: 5, acceptedQty: 5, rejectedQty: 0, actualInvoicePrice: 57.00 }
      ],
      tenantId
    });
    console.error('❌ OVER-RECEIPT FAIL: Allowed receiving > remaining quantity!');
    process.exit(1);
  } catch (err) {
    console.log(`   ✓ Over-Receipt Blocked Successfully: "${err.message}"`);
  }

  // 4. Post GRN 2: Receive remaining 2 KG Carrots
  console.log('\n4. Posting GRN 2 to receive remaining 2 KG Carrots...');
  const grn2Result = purchasingModel.createGoodsReceiptNote({
    poId: po.id,
    supplierInvoiceNo: 'INV-2026-89',
    receiptDate: '2026-09-04',
    supplierInvoiceTotal: 114.00,
    lines: [
      { itemCode: 'RM0702', receivedQty: 2, acceptedQty: 2, rejectedQty: 0, actualInvoicePrice: 57.00 }
    ],
    tenantId
  });

  console.log(`   ✓ GRN 2 Posted: ${grn2Result.grn.grnNumber}`);
  console.log(`   Final PO Status: ${grn2Result.poStatus}`);

  const poFinal = purchasingModel.getPurchaseOrderById(po.id, tenantId);
  if (poFinal.status !== 'FULLY_RECEIVED') {
    console.error(`❌ PO FINAL STATUS ERROR: Expected FULLY_RECEIVED, got ${poFinal.status}`);
    process.exit(1);
  }

  // 5. Verify third GRN attempt on FULLY_RECEIVED PO is blocked
  console.log('\n5. Verifying receipt on FULLY_RECEIVED PO is blocked...');
  try {
    purchasingModel.createGoodsReceiptNote({
      poId: po.id,
      supplierInvoiceNo: 'INV-EXTRA',
      receiptDate: '2026-09-04',
      lines: [
        { itemCode: 'RM0702', receivedQty: 1, acceptedQty: 1, rejectedQty: 0, actualInvoicePrice: 57.00 }
      ],
      tenantId
    });
    console.error('❌ FULLY_RECEIVED BLOCK FAIL: Allowed receiving on closed/fully received PO!');
    process.exit(1);
  } catch (err) {
    console.log(`   ✓ Fully Received PO Guard Blocked Attempt: "${err.message}"`);
  }

  console.log('\n----------------------------------------------------');
  console.log('✅ PO → GRN → STOCK LEDGER LIFECYCLE PASSED (100%)');
  console.log('----------------------------------------------------');
}

testPoGrnStockLedgerLifecycle();
