/**
 * scratch/sync-categories-to-supabase.js
 * Pushes the 15 canonical Categories & Product Families directly into Supabase PostgreSQL inventory_categories table.
 */

import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function syncCategoriesToSupabase() {
  console.log('📡 Initializing SupabaseClient...');
  const client = new SupabaseClient();
  const tenantId = 'tenant_h0qc7wf';

  // Clean probe records first
  await client.deleteRecords('inventory_categories', 'id=eq.probe-2');

  const defaultCategories = [
    { id: 'cat-1-chicken', categoryCode: 'CAT-CHICKEN', categoryName: 'Chicken', productFamilyCode: 'FAM-MEAT', productFamilyName: 'Meat & Poultry', description: 'Fresh & frozen chicken cuts', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-2-mutton', categoryCode: 'CAT-MUTTON', categoryName: 'Mutton & Lamb', productFamilyCode: 'FAM-MEAT', productFamilyName: 'Meat & Poultry', description: 'Fresh mutton, lamb chops & minced meat', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-3-fish', categoryCode: 'CAT-FISH', categoryName: 'Fish & Finfish', productFamilyCode: 'FAM-SEAFOOD', productFamilyName: 'Seafood', description: 'Freshwater & marine fish fillets', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-4-prawns', categoryCode: 'CAT-PRAWNS', categoryName: 'Prawns & Shellfish', productFamilyCode: 'FAM-SEAFOOD', productFamilyName: 'Seafood', description: 'Tiger prawns, white prawns, crabs & shellfish', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-5-veg', categoryCode: 'CAT-VEG', categoryName: 'Fresh Vegetables', productFamilyCode: 'FAM-PRODUCE', productFamilyName: 'Fruits & Vegetables', description: 'Onions, tomatoes, potatoes, greens & exotic veggies', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-6-butter', categoryCode: 'CAT-BUTTER', categoryName: 'Butter & Ghee', productFamilyCode: 'FAM-DAIRY', productFamilyName: 'Dairy & Fats', description: 'Salted butter, unsalted butter, clarified butter', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-7-cheese', categoryCode: 'CAT-CHEESE', categoryName: 'Cheese & Cream', productFamilyCode: 'FAM-DAIRY', productFamilyName: 'Dairy & Fats', description: 'Mozzarella, cheddar, processed cheese & fresh cream', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-8-spice-w', categoryCode: 'CAT-SPICE-WHOLE', categoryName: 'Whole Spices', productFamilyCode: 'FAM-SPICES', productFamilyName: 'Spices & Seasonings', description: 'Cardamom, cinnamon, cloves, cumin seeds, black pepper', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-9-spice-p', categoryCode: 'CAT-SPICE-POWDER', categoryName: 'Powdered Spices', productFamilyCode: 'FAM-SPICES', productFamilyName: 'Spices & Seasonings', description: 'Turmeric powder, red chili powder, coriander powder, garama masala', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-10-oils', categoryCode: 'CAT-OILS', categoryName: 'Cooking Oils & Fats', productFamilyCode: 'FAM-CONDIMENTS', productFamilyName: 'Oils, Sauces & Condiments', description: 'Sunflower oil, mustard oil, olive oil, sesame oil', defaultUom: 'LTR', status: 'ACTIVE' },
    { id: 'cat-11-rice', categoryCode: 'CAT-RICE', categoryName: 'Rice & Staples', productFamilyCode: 'FAM-GRAINS', productFamilyName: 'Grains, Pulses & Dry Goods', description: 'Basmati rice, jeera rice, wheat flour, maida', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-12-bev-alc', categoryCode: 'CAT-BEV-ALC', categoryName: 'Spirits & Beer', productFamilyCode: 'FAM-BEVERAGES', productFamilyName: 'Beverages', description: 'Whiskey, rum, vodka, gin, beer, wine', defaultUom: 'BOTTLE', status: 'ACTIVE' },
    { id: 'cat-13-bev-soft', categoryCode: 'CAT-BEV-SOFT', categoryName: 'Soft Drinks & Juices', productFamilyCode: 'FAM-BEVERAGES', productFamilyName: 'Beverages', description: 'Sodas, tonic water, canned fruit juices, syrups', defaultUom: 'CAN', status: 'ACTIVE' },
    { id: 'cat-14-masala', categoryCode: 'CAT-MASALA-BASE', categoryName: 'Signature Gravies & Masalas', productFamilyCode: 'FAM-PREPS', productFamilyName: 'Semi-Finished Preparations', description: 'White gravy, makhani gravy, onion tomato masala base', defaultUom: 'KG', status: 'ACTIVE' },
    { id: 'cat-15-takeaway', categoryCode: 'CAT-TAKEAWAY', categoryName: 'Takeaway Packaging', productFamilyCode: 'FAM-PACKAGING', productFamilyName: 'Packaging', description: 'Meal boxes, paper bags, plastic containers, cutlery', defaultUom: 'PCS', status: 'ACTIVE' }
  ];

  console.log(`🚀 Writing ${defaultCategories.length} categories directly to Supabase PostgreSQL inventory_categories table...`);
  
  let synced = 0;
  for (const cat of defaultCategories) {
    try {
      const record = {
        id: cat.id,
        tenant_id: tenantId,
        category_code: cat.categoryCode,
        category_name: cat.categoryName,
        category_type: 'OPERATIONAL',
        data: {
          ...cat,
          tenantId,
          tenant_id: tenantId
        }
      };

      const res = await client.createRecord('inventory_categories', record);
      if (res.success) {
        synced++;
        console.log(`   ✓ Synced category [${cat.categoryCode}] "${cat.categoryName}" -> Product Family: ${cat.productFamilyName}`);
      } else {
        console.error(`   ❌ Error syncing category ${cat.categoryCode}:`, res.error);
      }
    } catch (e) {
      console.error(`   ❌ Exception syncing category ${cat.categoryCode}:`, e.message || e);
    }
  }

  console.log(`\n🎉 Successfully synced ${synced}/${defaultCategories.length} categories to Supabase Cloud DB!`);

  const checkRes = await client.fetchTableData('inventory_categories');
  console.log(`📊 Live Supabase Row Count in inventory_categories: ${checkRes.data ? checkRes.data.length : 0} rows.`);
}

syncCategoriesToSupabase().catch(err => {
  console.error('Fatal Sync Error:', err);
  process.exit(1);
});
