import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { ANCHOR_HARBOUR_64_MENU_ITEMS } from '../businessos/platform/kitchen/barMenuImporter.js';
import fs from 'fs';

async function runAudit() {
  const sb = new SupabaseClient();
  const get = async (ep) => {
    const res = await fetch(sb.baseUrl + '/' + ep, { headers: sb.getHeaders() });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`GET ${ep} failed: ${res.status} ${txt}`);
    }
    return await res.json();
  };

  console.log('Fetching live database collections...');
  const inv = await get('inventory?select=uuid,item_code,item_name,category_code,base_uom,item_type,unit_valuation,opening_stock,default_location_code,data&limit=500');
  const barMenu = await get('kitchen_menu_items?routing=eq.BAR&order=item_code.asc&limit=200');
  const recipes = await get('recipes?select=id,recipe_code,recipe_name,status,version,menu_item_id,data&limit=200').catch(() => []);
  const recipeIngredients = await get('recipe_ingredients?select=*&limit=500').catch(() => []);
  const suppliers = await get('suppliers?select=*&limit=50').catch(() => []);
  const supCat = await get('supplier_catalog?select=*&limit=200').catch(() => []);

  console.log(`\n=== LIVE RECONCILIATION AUDIT ===`);
  console.log(`Total Inventory Master Items: ${inv.length}`);
  const barInv = inv.filter(i => (i.item_code || '').startsWith('BAR'));
  console.log(`Bar SKUs (BAR%): ${barInv.length}`);
  console.log(`Live Bar Menu Items (routing=BAR): ${barMenu.length}`);
  console.log(`Hardcoded Canonical Menu Items (ANCHOR_HARBOUR_64): ${ANCHOR_HARBOUR_64_MENU_ITEMS.length}`);
  console.log(`Recipes in DB: ${recipes.length}`);
  console.log(`Recipe Ingredients in DB: ${recipeIngredients.length}`);
  console.log(`Suppliers: ${suppliers.length}`);
  console.log(`Supplier Catalog Entries: ${supCat.length}`);

  // Build lookups
  const invByCode = new Map();
  inv.forEach(i => invByCode.set(i.item_code, i));

  const invByName = new Map();
  inv.forEach(i => {
    if (i.item_name) invByName.set(i.item_name.toLowerCase().trim(), i);
  });

  const recipesByMenuId = new Map();
  recipes.forEach(r => {
    if (r.menu_item_id) recipesByMenuId.set(r.menu_item_id, r);
  });

  // Reconcile each of the 64 Bar menu items
  const reconciliation = [];

  for (const m of barMenu) {
    const code = m.item_code;
    const name = m.item_name;
    const cat = (m.category || '').toUpperCase();
    const data = m.data || {};
    const variants = data.variants || [];
    const recipeId = m.recipe_id || m.recipeId;

    let status = '🔴 MISSING';
    let mappedSku = null;
    let invItem = null;
    let recipe = null;
    let details = '';

    // Check if it's Cocktail or Mocktail
    if (cat.includes('COCKTAIL') || cat.includes('MOCKTAIL')) {
      // It's a composite drink
      recipe = recipes.find(r => r.menu_item_id === m.id || r.recipe_code === `RCP-${code}` || (r.recipe_name && r.recipe_name.toLowerCase() === name.toLowerCase()));
      if (recipe) {
        status = '🟢 MATCH';
        details = `Recipe approved: [${recipe.recipe_code}] ${recipe.recipe_name}`;
      } else {
        status = '🔵 RECIPE INGREDIENT';
        details = 'Recipe missing; requires recipe BOM definition before inventory can be resolved';
      }
    } else {
      // Direct-sale pour or unit beverage
      // Check data.inventoryItemCode or sku lookup
      const directCode = data.inventoryItemCode || data.itemCode;
      if (directCode && invByCode.has(directCode)) {
        invItem = invByCode.get(directCode);
        mappedSku = directCode;
        status = '🟢 MATCH';
      } else {
        // Try to match by SKU pattern or name
        // 101 -> BAR0001, etc.
        const numMatch = code.match(/RC-BAR-(\d+)/);
        if (numMatch) {
          const idx = parseInt(numMatch[1], 10);
          let candidateSku = null;
          if (idx >= 101 && idx <= 142) {
            candidateSku = `BAR${String(idx - 100).padStart(4, '0')}`;
          } else if (idx === 143) candidateSku = 'BAR0044'; // Carlsberg Elephant
          else if (idx === 144) candidateSku = 'BAR0043'; // Budweiser Magnum
          else if (idx === 145) candidateSku = 'BAR0045'; // Tuborg Strong
          else if (idx === 146) candidateSku = 'BAR0046'; // Kingfisher Strong
          else if (idx === 161) candidateSku = 'BAR0047'; // Breezer
          else if (idx === 162) candidateSku = 'BAR0048'; // Bottled Water
          else if (idx === 163) candidateSku = 'BAR0049'; // Cold Drink
          else if (idx === 164) candidateSku = 'BAR0050'; // Soda

          if (candidateSku && invByCode.has(candidateSku)) {
            invItem = invByCode.get(candidateSku);
            mappedSku = candidateSku;
            status = '🟢 MATCH';
            details = `Mapped to SKU ${candidateSku} (${invItem.item_name}) [UOM: ${invItem.base_uom}]`;
          } else if (candidateSku) {
            status = '🔴 MISSING';
            details = `Expected SKU ${candidateSku} not found in Inventory Master`;
          }
        }

        if (status === '🔴 MISSING') {
          // Check if name matches any inventory item
          const fuzzy = inv.find(i => i.item_name && (
            i.item_name.toLowerCase().includes(name.toLowerCase()) || 
            name.toLowerCase().includes(i.item_name.toLowerCase())
          ));
          if (fuzzy) {
            status = '🟡 NEEDS MAPPING';
            invItem = fuzzy;
            mappedSku = fuzzy.item_code;
            details = `Inventory item exists: [${fuzzy.item_code}] ${fuzzy.item_name}, but needs explicit linkage`;
          }
        }
      }
    }

    reconciliation.push({
      item_code: code,
      item_name: name,
      category: cat,
      status,
      mapped_sku: mappedSku,
      inv_name: invItem?.item_name || (recipe ? recipe.recipe_name : null),
      base_uom: invItem?.base_uom || (recipe ? 'RECIPE' : null),
      variants_count: variants.length,
      details
    });
  }

  // Count by status
  const counts = {
    '🟢 MATCH': 0,
    '🟡 NEEDS MAPPING': 0,
    '🔴 MISSING': 0,
    '🔵 RECIPE INGREDIENT': 0,
    '⚪ NOT STOCK ITEM': 0
  };

  reconciliation.forEach(r => {
    counts[r.status] = (counts[r.status] || 0) + 1;
  });

  console.log('\n--- RECONCILIATION RESULTS BY STATUS ---');
  for (const [st, cnt] of Object.entries(counts)) {
    console.log(`  ${st}: ${cnt}`);
  }

  // Write detailed audit file
  fs.writeFileSync('scratch/bar_gate1_reconciliation_report.json', JSON.stringify({
    summary: counts,
    total: reconciliation.length,
    items: reconciliation,
    all_bar_skus: barInv.map(b => ({
      item_code: b.item_code,
      item_name: b.item_name,
      category_code: b.category_code,
      base_uom: b.base_uom,
      opening_stock: b.opening_stock,
      unit_valuation: b.unit_valuation
    }))
  }, null, 2));

  console.log('\nDetailed reconciliation report written to scratch/bar_gate1_reconciliation_report.json');

  // Print first 15 items as sample
  console.log('\nSample Reconciled Items (First 15):');
  reconciliation.slice(0, 15).forEach(r => {
    console.log(`  ${r.status} | [${r.item_code}] ${r.item_name.padEnd(30)} -> SKU: ${r.mapped_sku || 'NONE'} | UOM: ${r.base_uom || 'N/A'}`);
  });

  // Print items that are not MATCH
  const nonMatch = reconciliation.filter(r => r.status !== '🟢 MATCH');
  console.log(`\nNon-MATCH Items (${nonMatch.length}):`);
  nonMatch.forEach(r => {
    console.log(`  ${r.status} | [${r.item_code}] ${r.item_name.padEnd(32)} | Cat: ${r.category.padEnd(16)} | ${r.details}`);
  });
}

runAudit().catch(err => console.error('Audit failed:', err));
