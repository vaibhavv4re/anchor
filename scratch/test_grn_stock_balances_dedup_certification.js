import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { purchasingModel } from '../businessos/platform/inventory/purchasingModel.js';

async function runCertification() {
  console.log('=== GRN Stock Balances Deduplication Certification ===\n');

  // 1. Test offlineStore.appendItem idempotency
  console.log('[Test 1] Testing offlineStore.appendItem composite key deduplication...');
  offlineStore.setCollection('stock_balances', []);

  const bal1 = {
    id: 'sb-1',
    itemCode: 'RM0102',
    locationCode: 'LOC-805',
    quantity: 20,
    unitCost: 260,
    valuation: 5200,
    lastUpdatedAt: '2026-09-04T10:00:00.000Z'
  };

  const bal1Dup = {
    id: 'sb-2',
    itemCode: 'RM0102',
    locationCode: 'LOC-805',
    quantity: 20,
    unitCost: 260,
    valuation: 5200,
    lastUpdatedAt: '2026-09-04T10:05:00.000Z'
  };

  offlineStore.appendItem('stock_balances', bal1);
  offlineStore.appendItem('stock_balances', bal1Dup);

  const balancesAfterDup = offlineStore.getCollection('stock_balances');
  console.log(`Balances count after appendItem duplicate: ${balancesAfterDup.length} (Expected: 1)`);
  if (balancesAfterDup.length !== 1) {
    console.error('❌ FAIL: offlineStore did not deduplicate stock_balances!');
    process.exit(1);
  }
  console.log('✅ PASS: offlineStore appendItem deduplicated successfully.\n');

  // 2. Test purchasingModel.createGoodsReceiptNote behavior
  console.log('[Test 2] Testing purchasingModel GRN stock balances update...');
  offlineStore.setCollection('stock_balances', []);
  offlineStore.setCollection('goods_receipt_notes', []);
  offlineStore.setCollection('stock_ledger', []);

  const dummySession = { tenantId: 't-test', employeeName: 'Tester' };
  const grnPayload = {
    isDirectGRN: true,
    directReason: 'Emergency direct stock receipt',
    destinationLocationCode: 'LOC-805',
    receivedBy: 'Tester',
    deliveryChallanNo: 'DC-2026-94909',
    lines: [
      {
        itemCode: 'RM0103',
        itemName: 'Chicken Mince (Keema)',
        orderedQty: 20,
        receivedQty: 20,
        acceptedQty: 20,
        rejectedQty: 0,
        actualInvoicePrice: 360,
        uom: 'KG'
      },
      {
        itemCode: 'RM0102',
        itemName: 'Whole Chicken (Curry Cut)',
        orderedQty: 20,
        receivedQty: 20,
        acceptedQty: 20,
        rejectedQty: 0,
        actualInvoicePrice: 260,
        uom: 'KG'
      }
    ]
  };

  const result = await purchasingModel.createGoodsReceiptNote(grnPayload, dummySession);
  console.log(`GRN Created successfully: ${result.grnNumber}`);

  const balances = offlineStore.getCollection('stock_balances');
  console.log(`Stock balances count: ${balances.length} (Expected: 2)`);
  
  const totalValuation = balances.reduce((sum, b) => sum + (parseFloat(b.valuation) || 0), 0);
  console.log(`Total valuation: ₹${totalValuation} (Expected: ₹12,400)`);

  if (balances.length === 2 && totalValuation === 12400) {
    console.log('\n🎉 CERTIFICATION SUCCESSFUL: 0 duplicate rows, valuation matches physical GRN receipt!');
  } else {
    console.error('\n❌ CERTIFICATION FAILED: Unexpected balances or valuation');
    process.exit(1);
  }
}

runCertification().catch(err => {
  console.error('Unhandled error in certification:', err);
  process.exit(1);
});
