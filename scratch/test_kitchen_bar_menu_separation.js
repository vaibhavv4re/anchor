import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { kitchenMenuModel, isBarMenuItem, BAR_CATEGORIES } from '../businessos/platform/kitchen/kitchenMenuModel.js';
import https from 'https';

console.log('=== TEST: Kitchen & Bar Menu Separation Certification ===');

// 1. Fetch live data from Supabase
const url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1/kitchen_menu_items?select=*';
const options = {
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'
  }
};

function fetchSupabase() {
  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function runTest() {
  const sbItems = await fetchSupabase();
  console.log(`[Supabase Live Audit] Retrieved ${sbItems.length} total items from kitchen_menu_items table.`);

  // Verify Supabase schema & partitioning
  const sbBarItems = sbItems.filter(i => i.routing === 'BAR');
  const sbKitchenItems = sbItems.filter(i => i.routing !== 'BAR');
  const sbTenantMismatch = sbItems.filter(i => i.tenant_id !== 'tenant_h0qc7wf');

  console.log(`[Supabase Check] Bar items (routing=BAR): ${sbBarItems.length}`);
  console.log(`[Supabase Check] Kitchen items (routing!=BAR): ${sbKitchenItems.length}`);
  console.log(`[Supabase Check] Non-canonical tenant items: ${sbTenantMismatch.length}`);

  if (sbBarItems.length !== 64) throw new Error(`Expected 64 bar items in Supabase, got ${sbBarItems.length}`);
  if (sbKitchenItems.length !== 69) throw new Error(`Expected 69 kitchen food items in Supabase, got ${sbKitchenItems.length}`);
  if (sbTenantMismatch.length !== 0) throw new Error(`Expected 0 non-canonical tenant items in Supabase, got ${sbTenantMismatch.length}`);

  // Populate offlineStore with normalized items
  const normalizedItems = sbItems.map(item => ({
    id: item.id,
    tenantId: item.tenant_id,
    tenant_id: item.tenant_id,
    itemCode: item.item_code,
    itemName: item.item_name,
    category: item.category,
    description: item.description,
    sellingPrice: parseFloat(item.selling_price) || 0,
    taxProfile: item.tax_profile,
    dietaryType: item.dietary_type,
    portionSize: item.portion_size,
    availabilityStatus: item.availability_status || 'AVAILABLE',
    lifecycleStatus: item.lifecycle_status || 'ACTIVE',
    recipeId: item.recipe_id,
    routing: item.routing,
    productionArea: item.routing === 'BAR' ? 'BAR' : 'KITCHEN'
  }));

  offlineStore.setCollection('kitchen_menu_items', normalizedItems);

  // 2. Test kitchenMenuModel.getAll with domain: 'KITCHEN'
  const kitchenItems = kitchenMenuModel.getAll('tenant_h0qc7wf', { domain: 'KITCHEN' });
  console.log(`[kitchenMenuModel] Kitchen domain items retrieved: ${kitchenItems.length}`);
  if (kitchenItems.length !== 69) {
    throw new Error(`Expected exactly 69 kitchen items, got ${kitchenItems.length}`);
  }

  // Verify none of the items are Bar items
  const leakingBarItems = kitchenItems.filter(i => isBarMenuItem(i));
  if (leakingBarItems.length > 0) {
    throw new Error(`Found ${leakingBarItems.length} bar items leaking into kitchen: ${leakingBarItems.map(i => i.itemName).join(', ')}`);
  }

  // 3. Test kitchenMenuModel.getAll with domain: 'BAR'
  const barItems = kitchenMenuModel.getAll('tenant_h0qc7wf', { domain: 'BAR' });
  console.log(`[kitchenMenuModel] Bar domain items retrieved: ${barItems.length}`);
  if (barItems.length !== 64) {
    throw new Error(`Expected exactly 64 bar items, got ${barItems.length}`);
  }

  // Verify none of the items are Kitchen food items
  const leakingFoodItems = barItems.filter(i => !isBarMenuItem(i));
  if (leakingFoodItems.length > 0) {
    throw new Error(`Found ${leakingFoodItems.length} food items leaking into bar: ${leakingFoodItems.map(i => i.itemName).join(', ')}`);
  }

  // 4. Test kitchenMenuModel.getStats for KITCHEN
  const kitchenStats = kitchenMenuModel.getStats('tenant_h0qc7wf', { domain: 'KITCHEN' });
  console.log(`[kitchenMenuModel.getStats] Kitchen Total Items: ${kitchenStats.totalItems}`);
  console.log(`[kitchenMenuModel.getStats] Kitchen Categories (${kitchenStats.categories.length}):`, kitchenStats.categories);

  if (kitchenStats.totalItems !== 69) {
    throw new Error(`Expected 69 total items in kitchen stats, got ${kitchenStats.totalItems}`);
  }
  if (kitchenStats.categories.length !== 10) {
    throw new Error(`Expected 10 categories in kitchen stats, got ${kitchenStats.categories.length}`);
  }

  // Ensure no bar category exists in kitchen categories
  for (const cat of kitchenStats.categories) {
    if (BAR_CATEGORIES.has(cat)) {
      throw new Error(`Bar category "${cat}" found in Kitchen stats!`);
    }
  }

  // 5. Test kitchenMenuModel.getStats for BAR
  const barStats = kitchenMenuModel.getStats('tenant_h0qc7wf', { domain: 'BAR' });
  console.log(`[kitchenMenuModel.getStats] Bar Total Items: ${barStats.totalItems}`);
  console.log(`[kitchenMenuModel.getStats] Bar Categories (${barStats.categories.length}):`, barStats.categories);

  if (barStats.totalItems !== 64) {
    throw new Error(`Expected 64 total items in bar stats, got ${barStats.totalItems}`);
  }
  if (barStats.categories.length !== 16) {
    throw new Error(`Expected 16 categories in bar stats, got ${barStats.categories.length}`);
  }

  console.log('\n======================================================');
  console.log('🎉 ALL KITCHEN & BAR MENU SEPARATION TESTS PASSED 100%!');
  console.log('======================================================');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
