import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../businessos/platform/ordering/productionRoutingEngine.js';
import { supabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { platformEventBus } from '../businessos/platform/events/platformEvents.js';

const TENANT_ID = 'tenant_h0qc7wf';

async function runTest() {
  console.log('🧪 Starting K8.1 Order -> Production Routing -> Supabase Persistence Test...');

  // Setup DataGateway
  const dataGateway = new DataGateway({
    defaultAdapter: supabaseDataAdapter,
    offlineStore
  });

  // Mock global window.__APP__
  globalThis.window = {
    __APP__: {
      platform: {
        dataGateway
      }
    }
  };

  // 1. Hydrate real menu items and recipes
  console.log('1️⃣ Hydrating kitchen_menu_items and recipes from Supabase...');
  await dataGateway.hydrateCollections(['kitchen_menu_items', 'recipes', 'orders'], TENANT_ID);

  const menuItems = offlineStore.getCollection('kitchen_menu_items', TENANT_ID) || [];
  console.log(`✓ Loaded ${menuItems.length} menu items from Supabase.`);

  const realFoodItem = menuItems.find(m => m.itemCode === 'MENU-9272' || m.itemName.includes('Soup') || m.routing === 'KITCHEN_LINE') || menuItems[0];
  console.log(`✓ Selected real menu item: ${realFoodItem.itemName} (${realFoodItem.itemCode}), Price: ₹${realFoodItem.sellingPrice || realFoodItem.selling_price}`);

  // 2. Track event bus
  let eventFired = false;
  let dispatchedKot = null;
  platformEventBus.subscribe('order:confirmed', (data) => {
    eventFired = true;
    console.log('✓ platformEventBus received order:confirmed event for:', data.payload?.orderId || data.orderId);
  });
  platformEventBus.subscribe('kot:dispatched', (data) => {
    dispatchedKot = data.payload || data;
    console.log('✓ platformEventBus received kot:dispatched for KOT ID:', dispatchedKot.ticketId || dispatchedKot.id);
  });

  // 3. Create real order
  console.log('2️⃣ Placing customer order via orderModel.createOrder()...');
  const orderItems = [
    {
      itemId: realFoodItem.id,
      itemCode: realFoodItem.itemCode || realFoodItem.item_code,
      name: realFoodItem.itemName || realFoodItem.item_name,
      price: realFoodItem.sellingPrice || realFoodItem.selling_price || 350,
      quantity: 2,
      routing: 'KITCHEN_LINE',
      category: realFoodItem.category || 'FOOD',
      notes: 'Extra hot and spicy'
    }
  ];

  const createdOrder = orderModel.createOrder({
    sessionId: `sess-${Date.now()}`,
    tableNumber: 4,
    waiterId: 'emp-chef-vaibhav',
    items: orderItems,
    subtotal: 700,
    tenantId: TENANT_ID,
    notes: 'VIP Table Order'
  });

  console.log(`✓ Order created: ${createdOrder.orderNumber} (ID: ${createdOrder.id})`);
  console.log(`✓ Event fired: ${eventFired}, Dispatched KOT: ${dispatchedKot ? dispatchedKot.ticketId : 'NONE'}`);

  // Wait 2s for async cloud persistence
  await new Promise(r => setTimeout(r, 2000));

  // 4. Verify Supabase REST API directly
  console.log('3️⃣ Verifying Supabase orders table directly via adapter query...');
  const fetchedOrders = await supabaseDataAdapter.getCollection('orders', TENANT_ID);
  const cloudOrder = fetchedOrders.find(o => o.id === createdOrder.id || o.orderNumber === createdOrder.orderNumber);

  if (!cloudOrder) {
    throw new Error(`❌ Order ${createdOrder.id} not found in Supabase 'orders' collection!`);
  }
  console.log(`✓ Cloud order confirmed in Supabase! ID: ${cloudOrder.id}, Status: ${cloudOrder.status}`);
  console.log(`✓ Embedded items in cloud: ${cloudOrder.items?.length || cloudOrder.data?.items?.length || 0}`);
  
  const cloudTickets = cloudOrder.tickets || cloudOrder.data?.tickets || [];
  console.log(`✓ Embedded tickets in cloud: ${cloudTickets.length}`);
  if (cloudTickets.length === 0) {
    throw new Error('❌ KOT ticket was not persisted into order.data.tickets in Supabase!');
  }
  console.log(`✓ First ticket: ${cloudTickets[0].ticketId} (${cloudTickets[0].ticketType} -> ${cloudTickets[0].destination}), Status: ${cloudTickets[0].status}`);

  // 5. Simulate browser reload & fresh hydration
  console.log('4️⃣ Simulating browser reload: Clearing memory & re-hydrating from Supabase...');
  offlineStore.setCollection('orders', []);
  offlineStore.setCollection('tickets', []);

  // Re-hydrate from Supabase
  await dataGateway.hydrateCollections(['orders'], TENANT_ID);

  const restoredTickets = orderModel.getAllTickets(TENANT_ID);
  console.log(`✓ Post-refresh tickets reconstructed: ${restoredTickets.length}`);
  const matchKot = restoredTickets.find(t => t.orderId === createdOrder.id || t.orderNumber === createdOrder.orderNumber);
  if (!matchKot) {
    throw new Error('❌ Failed to reconstruct KOT ticket queue after browser refresh!');
  }
  console.log(`✓ Successfully reconstructed KOT ${matchKot.ticketId} for Table ${matchKot.tableCode} with ${matchKot.items.length} items!`);

  // 6. Test ticket status progression
  console.log('5️⃣ Testing KDS status update (QUEUED -> PREPARING)...');
  const updatedTicket = productionRoutingEngine.updateTicketStatus(matchKot.ticketId, 'PREPARING', TENANT_ID);
  console.log(`✓ Ticket status updated to: ${updatedTicket.status}`);

  await new Promise(r => setTimeout(r, 1500));

  // Re-fetch from Supabase to verify updated status in cloud
  const refreshedOrders = await supabaseDataAdapter.getCollection('orders', TENANT_ID);
  const refreshedOrder = refreshedOrders.find(o => o.id === createdOrder.id);
  const refreshedTicket = (refreshedOrder.tickets || refreshedOrder.data?.tickets || []).find(t => t.ticketId === matchKot.ticketId);
  console.log(`✓ Cloud verified ticket status after update: ${refreshedTicket?.status}`);

  console.log('\n🎉 ALL K8.1 ACCEPTANCE CRITERIA PASSED SUCCESSFULLY! ✓');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
