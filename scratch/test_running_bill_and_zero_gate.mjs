/**
 * Test Suite: Running Bill Authoritative Resolution, Specimen Audit, and Zero-Bill Safety Gate
 * Validates:
 * 1. Read-only audit of live specimen ORD-2026-2936 & sess_f0mrudf resolves 2x Tomato Soup (₹420 subtotal, ₹462 grand total).
 * 2. Hard Zero-Bill Safety Gate blocks createRevision() with items: [] throwing CANNOT_GENERATE_EMPTY_BILL_FOR_ACTIVE_ORDERS.
 * 3. Synthetic lifecycle with isolated cleanup.
 */

import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
const client = new SupabaseClient();
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { sessionModel } from '../businessos/platform/session/sessionModel.js';
import { sessionProjectionService } from '../businessos/platform/session/sessionProjectionService.js';
import { billRevisionModel } from '../businessos/platform/billing/billRevisionModel.js';

const TENANT_ID = 'tenant_h0qc7wf';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING BILL RECONCILIATION & ZERO-BILL SAFETY GATE TEST');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: Read-Only Audit of Live Specimen (ORD-2026-2936 & sess_f0mrudf)
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 1] Live Specimen Audit: sess_f0mrudf & ORD-2026-2936 (Read-Only)');
    
    // Fetch live orders & sessions from Supabase
    const ordersUrl = `${client.baseUrl}/orders?order_number=eq.ORD-2026-2936`;
    const liveOrderRes = await fetch(ordersUrl, { headers: client.getHeaders() });
    const liveOrders = await liveOrderRes.json();
    assert(liveOrders.length > 0, 'ORD-2026-2936 exists in Supabase');

    const sessionUrl = `${client.baseUrl}/table_sessions?id=eq.sess_f0mrudf`;
    const liveSessRes = await fetch(sessionUrl, { headers: client.getHeaders() });
    const liveSessions = await liveSessRes.json();
    assert(liveSessions.length > 0, 'sess_f0mrudf exists in Supabase');

    // Hydrate into offlineStore simulating real runtime state
    // Check backward-compatible session resolution
    const rawOrder = liveOrders[0];
    const resolvedSessionId = rawOrder.sessionId || rawOrder.session_id || rawOrder.data?.sessionId || rawOrder.data?.session_id || rawOrder.data?.tickets?.[0]?.sessionId;
    assert(resolvedSessionId === 'sess_f0mrudf', `Backward-compatible session resolution extracted '${resolvedSessionId}'`);

    offlineStore.setCollection('orders', liveOrders, TENANT_ID);
    offlineStore.setCollection('table_sessions', liveSessions, TENANT_ID);

    // Verify orderModel.getOrdersForSession
    const sessionOrders = orderModel.getOrdersForSession('sess_f0mrudf', TENANT_ID);
    assert(sessionOrders.length === 1, `orderModel.getOrdersForSession('sess_f0mrudf') resolved exactly 1 order (got: ${sessionOrders.length})`);
    assert(sessionOrders[0].orderNumber === 'ORD-2026-2936' || sessionOrders[0].order_number === 'ORD-2026-2936', 'Resolved order is ORD-2026-2936');

    // Verify sessionProjectionService.getSessionProjection
    const projection = sessionProjectionService.getSessionProjection('sess_f0mrudf', TENANT_ID);
    assert(projection !== null, 'Session projection generated');
    assert(projection.itemizedList.length === 1, `Projection itemizedList has 1 line item (got: ${projection.itemizedList.length})`);
    assert(projection.itemizedList[0].name === 'Tomato Soup', 'Line item is Tomato Soup');
    assert(projection.itemizedList[0].quantity === 2, 'Line item quantity is 2');
    assert(projection.itemizedList[0].price === 210, 'Line item unit price is ₹210');
    assert(projection.itemizedList[0].lineTotal === 420, 'Line item total is ₹420');
    assert(projection.subtotal === 420, `Projection subtotal is ₹420 (got: ₹${projection.subtotal})`);
    assert(projection.cgstAmount === 10.5, `CGST is ₹10.50 (got: ₹${projection.cgstAmount})`);
    assert(projection.sgstAmount === 10.5, `SGST is ₹10.50 (got: ₹${projection.sgstAmount})`);
    assert(projection.serviceChargeAmount === 21.0, `Service charge is ₹21.00 (got: ₹${projection.serviceChargeAmount})`);
    assert(projection.grandTotal === 462.0, `Grand Total is ₹462.00 (got: ₹${projection.grandTotal})`);
    console.log('✅ Test 1 Passed: Live specimen resolves authoritatively in Running Bill projection!\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Hard Zero-Bill Safety Gate Enforcement
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 2] Hard Zero-Bill Safety Gate: Block createRevision with items: []');

    // Scenario 2A: Empty table with zero orders
    let emptyTableBlocked = false;
    try {
      billRevisionModel.createRevision({
        sessionId: 'sess_empty_table_test',
        tableNumber: 1,
        tableCode: 'T-01',
        items: [],
        subtotal: 0,
        tenantId: TENANT_ID
      });
    } catch (err) {
      if (err.message === 'CANNOT_GENERATE_BILL_FOR_EMPTY_SESSION') {
        emptyTableBlocked = true;
      }
    }
    assert(emptyTableBlocked, 'createRevision() threw CANNOT_GENERATE_BILL_FOR_EMPTY_SESSION for empty session');

    // Scenario 2B: Active orders exist, but caller passes items: []
    // The safety gate must attempt re-resolution from projection, or throw CANNOT_GENERATE_EMPTY_BILL_FOR_ACTIVE_ORDERS
    const corruptedSessionId = 'sess_corrupted_orders_test';
    const corruptedOrder = {
      id: 'ord_corrupted_test',
      sessionId: corruptedSessionId,
      status: 'CONFIRMED',
      items: [], // empty items on order
      data: { sessionId: corruptedSessionId, items: [] },
      tenantId: TENANT_ID
    };
    offlineStore.appendItem('orders', corruptedOrder, TENANT_ID);

    let activeOrderEmptyBlocked = false;
    try {
      billRevisionModel.createRevision({
        sessionId: corruptedSessionId,
        tableNumber: 2,
        tableCode: 'T-02',
        items: [],
        subtotal: 0,
        tenantId: TENANT_ID
      });
    } catch (err) {
      if (err.message === 'CANNOT_GENERATE_EMPTY_BILL_FOR_ACTIVE_ORDERS') {
        activeOrderEmptyBlocked = true;
      }
    }
    assert(activeOrderEmptyBlocked, 'createRevision() threw CANNOT_GENERATE_EMPTY_BILL_FOR_ACTIVE_ORDERS when active order had no resolvable items');

    // Scenario 2C: Caller passes items: [] for sess_f0mrudf -> Gate must AUTO-RECOVER items from authoritative projection!
    const recoveredRevision = billRevisionModel.createRevision({
      sessionId: 'sess_f0mrudf',
      tableNumber: 10,
      tableCode: 'AC-T-09',
      items: [], // Passes empty items!
      subtotal: 0,
      tenantId: TENANT_ID
    });
    assert(recoveredRevision !== null, 'createRevision auto-recovered from authoritative session projection');
    assert(recoveredRevision.items.length === 1, `Recovered revision has 1 item (got: ${recoveredRevision.items.length})`);
    assert(recoveredRevision.grandTotal === 462, `Recovered revision grand total is ₹462 (got: ₹${recoveredRevision.grandTotal})`);
    console.log('✅ Test 2 Passed: Zero-bill safety gate strictly blocks empty bills and auto-recovers authoritative items!\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Waiter Ownership Inheritance
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 3] Waiter Ownership Inheritance: Session Waiter -> Order Waiter');
    const testSessionId = 'sess_waiter_test_' + Date.now();
    const testTableSession = {
      id: testSessionId,
      sessionId: testSessionId,
      tableNumber: 10,
      tableCode: 'AC-T-09',
      assignedWaiterId: 'emp-suresh',
      status: 'GUESTS_SEATED',
      tenantId: TENANT_ID
    };
    offlineStore.appendItem('table_sessions', testTableSession, TENANT_ID);

    // Call orderModel.createOrder with an authenticated actor 'emp-rahul'
    const newOrder = orderModel.createOrder({
      sessionId: testSessionId,
      tableNumber: 10,
      waiterId: 'emp-rahul', // actor
      items: [{ itemId: 'item-1', name: 'Item 1', price: 100, quantity: 1 }],
      subtotal: 100,
      tenantId: TENANT_ID
    });

    assert(newOrder.waiterId === 'emp-suresh', `Order inherited session assigned waiter 'emp-suresh' (got: ${newOrder.waiterId})`);
    assert(newOrder.actorId === 'emp-rahul', `Order preserved authenticated employee 'emp-rahul' as actorId (got: ${newOrder.actorId})`);
    assert(newOrder.data.sessionId === testSessionId, `order.data.sessionId correctly embedded (${newOrder.data.sessionId})`);
    assert(newOrder.data.waiterId === 'emp-suresh', `order.data.waiterId correctly set to 'emp-suresh'`);
    console.log('✅ Test 3 Passed: Waiter ownership inherited authoritatively and actor audit preserved!\n');

    console.log('════════════════════════════════════════════════════════════════');
    console.log('🎉 ALL TESTS PASSED 100%');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    // Purge any synthetic records from local store
    const offOrders = (offlineStore.getCollection('orders', TENANT_ID) || []).filter(o => !o.id?.startsWith('ord_corrupted_') && !o.sessionId?.startsWith('sess_waiter_'));
    offlineStore.setCollection('orders', offOrders, TENANT_ID);
    const offSessions = (offlineStore.getCollection('table_sessions', TENANT_ID) || []).filter(s => !s.id?.startsWith('sess_waiter_'));
    offlineStore.setCollection('table_sessions', offSessions, TENANT_ID);
    const offRevs = (offlineStore.getCollection('bill_revisions', TENANT_ID) || []).filter(r => r.sessionId !== 'sess_f0mrudf' || r.grandTotal === 0);
    offlineStore.setCollection('bill_revisions', offRevs, TENANT_ID);
  }
}

main();
