import { billRevisionModel } from '../businessos/platform/billing/billRevisionModel.js';
import { invoiceModel } from '../businessos/platform/billing/invoiceModel.js';
import { paymentModel } from '../businessos/platform/billing/paymentModel.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function runIdempotencyTest() {
  console.log('🧪 Starting F0 Idempotency & Re-entrancy Unit Test...');

  const sessionId = 'sess_test_idemp_' + Date.now();
  const cid = 'CID-TEST-IDEMP-' + Math.floor(10000 + Math.random() * 90000);
  const opId = 'OP-TEST-IDEMP-001';

  // 1. Fire parallel bill revision creations with identical operationId
  console.log('  Testing parallel bill revision creations...');
  const revPromises = [1, 2, 3].map(() => billRevisionModel.createRevision({
    sessionId,
    tableNumber: 4,
    tableCode: 'T-04',
    items: [{ id: 'menu-1', name: 'Butter Chicken', price: 350, quantity: 1 }],
    subtotal: 350,
    waiterId: 'emp-waiter',
    waiterName: 'Rahul',
    correlationId: cid,
    operationId: opId
  }));

  const revResults = await Promise.all(revPromises);
  console.log(`  ✓ 3 parallel createRevision calls returned. Revision ID 1: ${revResults[0].id}, Revision ID 2: ${revResults[1].id}`);

  if (revResults[0].id !== revResults[1].id || revResults[0].id !== revResults[2].id) {
    console.error('❌ FAIL: Parallel createRevision created duplicate revision records!');
    process.exit(1);
  }
  console.log('  ✓ Idempotency passed for billRevisionModel.createRevision!');

  // 2. Fire parallel invoice issuance calls with identical operationId
  console.log('  Testing parallel invoice issuance calls...');
  const invOpId = 'OP-TEST-IDEMP-INV-001';
  const invPromises = [1, 2, 3].map(() => invoiceModel.issueInvoice({
    sessionId,
    revisionId: revResults[0].id,
    cashierId: 'emp-cashier',
    cashierName: 'Priya',
    correlationId: cid,
    operationId: invOpId
  }));

  const invResults = await Promise.all(invPromises);
  if (invResults[0].invoiceNumber !== invResults[1].invoiceNumber) {
    console.error('❌ FAIL: Parallel issueInvoice created duplicate invoice records!');
    process.exit(1);
  }
  console.log(`  ✓ Idempotency passed for invoiceModel.issueInvoice! Invoice number: ${invResults[0].invoiceNumber}`);

  // 3. Fire parallel payment settlements with identical operationId
  console.log('  Testing parallel payment settlement calls...');
  const payOpId = 'OP-TEST-IDEMP-PAY-001';
  const payPromises = [1, 2, 3].map(() => paymentModel.recordPayment({
    sessionId,
    billNumber: revResults[0].billNumber,
    revisionNumber: 1,
    invoiceNumber: invResults[0].invoiceNumber,
    amount: revResults[0].grandTotal,
    paymentMethod: 'UPI',
    receivedBy: 'emp-cashier',
    receivedByName: 'Priya',
    correlationId: cid,
    operationId: payOpId
  }));

  const payResults = await Promise.all(payPromises);
  if (payResults[0].id !== payResults[1].id) {
    console.error('❌ FAIL: Parallel recordPayment created duplicate payment records!');
    process.exit(1);
  }
  console.log(`  ✓ Idempotency passed for paymentModel.recordPayment! Payment ID: ${payResults[0].id}`);

  console.log('✅ ALL F0 IDEMPOTENCY TESTS PASSED CLEANLY!\n');
}

runIdempotencyTest().catch(err => {
  console.error('❌ Exception in test:', err);
  process.exit(1);
});
