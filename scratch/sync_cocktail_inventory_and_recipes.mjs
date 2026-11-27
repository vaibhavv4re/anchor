import fs from 'node:fs';
import crypto from 'node:crypto';
import { runtimeConfig } from '../businessos/platform/cloud/runtimeConfig.js';

const TENANT_ID = 'tenant_h0qc7wf';
const DRY_RUN = !process.argv.includes('--apply');

function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function loadMasterCsv() {
  const lines = fs.readFileSync('inventory_import_pack/05_Inventory_Master_v1.csv', 'utf8')
    .split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(l => {
    const cells = splitCsvLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (cells[i] || '').trim(); });
    return obj;
  });
}

const COCKTAIL_RECIPES = [
  {
    menuCode: 'RC-BAR-101',
    recipeCode: 'RCP-BAR-101',
    recipeName: 'Seaside Balcony',
    category: 'COCKTAILS',
    ingredients: [
      { code: 'BAR0163', qty: 0.05, recipeQty: 50, recipeUom: 'ML' },
      { code: 'RM2033', qty: 0.03, recipeQty: 30, recipeUom: 'G', note: '20ml fresh lime juice' },
      { code: 'BAR0203', qty: 0.02, recipeQty: 20, recipeUom: 'ML' },
      { code: 'BAR0127', qty: 0.001, recipeQty: 1, recipeUom: 'ML', note: 'Peated whisky spray' },
      { code: 'RM2032', qty: 0.002, recipeQty: 2, recipeUom: 'G', note: 'Garnish: Mint sprig' },
      { code: 'RM1104', qty: 0.002, recipeQty: 2, recipeUom: 'G', note: 'Garnish: Dried kokum' },
      { code: 'RM1403', qty: 0.002, recipeQty: 2, recipeUom: 'G', note: 'Garnish: Powdered sugar' }
    ]
  },
  {
    menuCode: 'RC-BAR-102',
    recipeCode: 'RCP-BAR-102',
    recipeName: 'Afternoon Garden',
    category: 'COCKTAILS',
    ingredients: [
      { code: 'BAR0165', qty: 0.05, recipeQty: 50, recipeUom: 'ML' },
      { code: 'BAR0202', qty: 0.025, recipeQty: 25, recipeUom: 'ML' },
      { code: 'RM2033', qty: 0.025, recipeQty: 25, recipeUom: 'G', note: '15ml lime juice (A/B with Starfruit)' },
      { code: 'RM1414', qty: 1, recipeQty: 1, recipeUom: 'PCS', note: '60ml brewed Earl Grey (A/B with Club Soda)' },
      { code: 'RM2036', qty: 0.015, recipeQty: 15, recipeUom: 'G', note: 'Garnish: Orange slice & zest' },
      { code: 'RM2033', qty: 0.01, recipeQty: 10, recipeUom: 'G', note: 'Garnish: Lime slice' }
    ]
  },
  {
    menuCode: 'RC-BAR-103',
    recipeCode: 'RCP-BAR-103',
    recipeName: 'Kitchen Pantry',
    category: 'COCKTAILS',
    ingredients: [
      { code: 'BAR0145', qty: 0.05, recipeQty: 50, recipeUom: 'ML' },
      { code: 'RM2032', qty: 0.005, recipeQty: 5, recipeUom: 'G', note: '6 mint leaves + garnish sprig' },
      { code: 'RM2033', qty: 0.03, recipeQty: 30, recipeUom: 'G', note: '20ml lime juice' },
      { code: 'RM2037', qty: 0.02, recipeQty: 20, recipeUom: 'G', note: 'Cucumber slice + roll garnish' },
      { code: 'BAR0193', qty: 0.08, recipeQty: 0.08, recipeUom: 'PCS', note: '20ml sparkling water' },
      { code: 'RM1409', qty: 0.01, recipeQty: 10, recipeUom: 'G', note: '20ml sugar syrup (1:1)' },
      { code: 'BAR0164', qty: 0.001, recipeQty: 1, recipeUom: 'ML', note: 'Absinthe spray' }
    ]
  },
  {
    menuCode: 'RC-BAR-104',
    recipeCode: 'RCP-BAR-104',
    recipeName: 'Feni Cellar',
    category: 'COCKTAILS',
    ingredients: [
      { code: 'BAR0167', qty: 0.05, recipeQty: 50, recipeUom: 'ML' },
      { code: 'RM2033', qty: 0.04, recipeQty: 40, recipeUom: 'G', note: '20ml lime juice + wedge garnish' },
      { code: 'BAR0194', qty: 0.1, recipeQty: 100, recipeUom: 'ML' },
      { code: 'RM2024', qty: 0.005, recipeQty: 5, recipeUom: 'G', note: '1 slice ginger' },
      { code: 'RM1501', qty: 0.0005, recipeQty: 0.5, recipeUom: 'G', note: '1 pinch salt' },
      { code: 'RM2026', qty: 0.003, recipeQty: 3, recipeUom: 'G', note: 'Garnish: Chilli slit' }
    ]
  },
  {
    menuCode: 'RC-BAR-105',
    recipeCode: 'RCP-BAR-105',
    recipeName: 'Orchard',
    category: 'COCKTAILS',
    ingredients: [
      { code: 'BAR0145', qty: 0.05, recipeQty: 50, recipeUom: 'ML' },
      { code: 'RM1413', qty: 0.018, recipeQty: 18, recipeUom: 'G', note: '20ml honey syrup (2:1)' },
      { code: 'RM2036', qty: 0.065, recipeQty: 65, recipeUom: 'G', note: '30ml fresh orange juice + zest garnish' },
      { code: 'RM2033', qty: 0.03, recipeQty: 30, recipeUom: 'G', note: '20ml lime juice' },
      { code: 'RM2024', qty: 0.005, recipeQty: 5, recipeUom: 'G', note: '1 slice ginger' }
    ]
  },
  {
    menuCode: 'RC-BAR-106',
    recipeCode: 'RCP-BAR-106',
    recipeName: 'Courtyard',
    category: 'COCKTAILS',
    ingredients: [
      { code: 'BAR0156', qty: 0.05, recipeQty: 50, recipeUom: 'ML' },
      { code: 'BAR0204', qty: 0.03, recipeQty: 30, recipeUom: 'ML' },
      { code: 'RM2033', qty: 0.025, recipeQty: 25, recipeUom: 'G', note: '15ml lime juice' },
      { code: 'RM0904', qty: 0.0005, recipeQty: 0.5, recipeUom: 'G', note: '1 pinch roasted cumin' },
      { code: 'BAR0195', qty: 0.06, recipeQty: 60, recipeUom: 'ML', note: 'Top up Sprite (A/B with Ginger Ale)' },
      { code: 'RM1501', qty: 0.0005, recipeQty: 0.5, recipeUom: 'G', note: '1 pinch salt' },
      { code: 'RM0920', qty: 0.001, recipeQty: 1, recipeUom: 'G', note: 'Garnish: Chaat masala' }
    ]
  },
  {
    menuCode: 'RC-BAR-107',
    recipeCode: 'RCP-BAR-107',
    recipeName: 'Sunset Terrace',
    category: 'COCKTAILS',
    ingredients: [
      { code: 'BAR0157', qty: 0.05, recipeQty: 50, recipeUom: 'ML' },
      { code: 'BAR0198', qty: 0.02, recipeQty: 20, recipeUom: 'ML' },
      { code: 'BAR0205', qty: 0.02, recipeQty: 20, recipeUom: 'ML' },
      { code: 'RM2033', qty: 0.015, recipeQty: 15, recipeUom: 'G', note: 'Lime wedge' },
      { code: 'RM1411', qty: 0.005, recipeQty: 5, recipeUom: 'G', note: '10ml demerara sugar syrup' }
    ]
  },
  {
    menuCode: 'RC-BAR-108',
    recipeCode: 'RCP-BAR-108',
    recipeName: 'Tropical Grove',
    category: 'MOCKTAILS',
    ingredients: [
      { code: 'BAR0199', qty: 0.12, recipeQty: 120, recipeUom: 'ML' },
      { code: 'BAR0197', qty: 0.025, recipeQty: 25, recipeUom: 'ML' },
      { code: 'RM1108', qty: 0.015, recipeQty: 15, recipeUom: 'ML' },
      { code: 'RM0816', qty: 0.0005, recipeQty: 0.5, recipeUom: 'G', note: 'Grated nutmeg + garnish' },
      { code: 'RM2040', qty: 0.025, recipeQty: 25, recipeUom: 'G', note: 'Garnish: Pineapple wedge' }
    ]
  },
  {
    menuCode: 'RC-BAR-109',
    recipeCode: 'RCP-BAR-109',
    recipeName: 'Virgin Watermelon & Basil Mojito',
    category: 'MOCKTAILS',
    ingredients: [
      { code: 'RM2038', qty: 0.003, recipeQty: 3, recipeUom: 'G', note: '6 basil leaves' },
      { code: 'RM2034', qty: 0.09, recipeQty: 90, recipeUom: 'G', note: '3-4 chunks + wedge garnish' },
      { code: 'RM2033', qty: 0.03, recipeQty: 30, recipeUom: 'G', note: '20ml lime juice' },
      { code: 'RM1410', qty: 0.01, recipeQty: 10, recipeUom: 'G', note: '20ml brown sugar syrup' },
      { code: 'BAR0195', qty: 0.09, recipeQty: 90, recipeUom: 'ML' }
    ]
  },
  {
    menuCode: 'RC-BAR-110',
    recipeCode: 'RCP-BAR-110',
    recipeName: 'Shikanji',
    category: 'MOCKTAILS',
    ingredients: [
      { code: 'RM2033', qty: 0.055, recipeQty: 55, recipeUom: 'G', note: '30ml lime juice + slice garnish' },
      { code: 'RM1409', qty: 0.015, recipeQty: 15, recipeUom: 'G', note: '30ml sugar syrup' },
      { code: 'RM0920', qty: 0.002, recipeQty: 2, recipeUom: 'G', note: '1/2 tsp chaat masala' },
      { code: 'RM1501', qty: 0.0005, recipeQty: 0.5, recipeUom: 'G', note: '1 pinch salt' },
      { code: 'RM0822', qty: 0.01, recipeQty: 10, recipeUom: 'G', note: '1 tbsp sabja' }
    ]
  },
  {
    menuCode: 'RC-BAR-111',
    recipeCode: 'RCP-BAR-111',
    recipeName: 'Ginger Me (Frozen)',
    category: 'MOCKTAILS',
    ingredients: [
      { code: 'RM1413', qty: 0.027, recipeQty: 27, recipeUom: 'G', note: '30ml honey syrup (2:1)' },
      { code: 'RM2033', qty: 0.075, recipeQty: 75, recipeUom: 'G', note: '30ml lime juice + 3 lime slices' },
      { code: 'RM2024', qty: 0.045, recipeQty: 45, recipeUom: 'G', note: '30ml fresh ginger juice' }
    ]
  },
  {
    menuCode: 'RC-BAR-112',
    recipeCode: 'RCP-BAR-112',
    recipeName: 'Mango Mastani',
    category: 'MOCKTAILS',
    ingredients: [
      { code: 'BAR0200', qty: 0.06, recipeQty: 60, recipeUom: 'ML', note: 'Mango juice (A/B with Alphonso Mango)' },
      { code: 'RM2066', qty: 0.1, recipeQty: 100, recipeUom: 'ML', note: '2 scoops vanilla ice cream' },
      { code: 'BAR0206', qty: 0.03, recipeQty: 30, recipeUom: 'ML' },
      { code: 'RM1111', qty: 0.005, recipeQty: 5, recipeUom: 'G', note: 'Broken cashews + garnish' },
      { code: 'RM1112', qty: 0.005, recipeQty: 5, recipeUom: 'G', note: 'Broken almonds + garnish' },
      { code: 'RM1412', qty: 0.005, recipeQty: 5, recipeUom: 'G', note: 'Garnish: Tutti frutti' }
    ]
  },
  {
    menuCode: 'RC-BAR-113',
    recipeCode: 'RCP-BAR-113',
    recipeName: 'Guava Mary',
    category: 'MOCKTAILS',
    ingredients: [
      { code: 'BAR0201', qty: 0.12, recipeQty: 120, recipeUom: 'ML' },
      { code: 'RM1214', qty: 0.002, recipeQty: 2, recipeUom: 'ML', note: '2 dash Tabasco' },
      { code: 'RM2033', qty: 0.03, recipeQty: 30, recipeUom: 'G', note: '20ml lime juice' },
      { code: 'RM1501', qty: 0.002, recipeQty: 2, recipeUom: 'G', note: '1 pinch + salt rim' },
      { code: 'RM0905', qty: 0.0005, recipeQty: 0.5, recipeUom: 'G', note: '1 pinch white pepper' },
      { code: 'RM0853', qty: 0.0015, recipeQty: 1.5, recipeUom: 'G', note: 'Garnish: Chilli rim' },
      { code: 'RM2071', qty: 0.02, recipeQty: 20, recipeUom: 'G', note: 'Garnish: Guava slice' }
    ]
  }
];

async function main() {
  const masterRows = loadMasterCsv();
  const masterByCode = new Map(masterRows.map(r => [r.item_code, r]));

  // Verify every recipe ingredient exists in master CSV
  for (const r of COCKTAIL_RECIPES) {
    for (const ing of r.ingredients) {
      if (!masterByCode.has(ing.code)) {
        throw new Error(`Missing SKU ${ing.code} referenced in recipe ${r.recipeName}`);
      }
    }
  }
  console.log(`Validated all ${COCKTAIL_RECIPES.length} recipes against ${masterRows.length} Master Inventory SKUs.`);

  const url = runtimeConfig.getSupabaseUrl();
  const anonKey = runtimeConfig.getAnonKey();
  const auth = await (await fetch(`${url}/functions/v1/pin-login`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '333333', tenantId: TENANT_ID })
  })).json();
  if (!auth.token) throw new Error('Auth failed: ' + JSON.stringify(auth));

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  // 1. Fetch existing inventory, menu items, recipes
  const [invRes, menuRes, recRes] = await Promise.all([
    fetch(`${url}/rest/v1/inventory?tenant_id=eq.${TENANT_ID}&status=eq.ACTIVE&select=uuid,item_code,item_name,base_uom,unit_valuation`, { headers }),
    fetch(`${url}/rest/v1/kitchen_menu_items?tenant_id=eq.${TENANT_ID}&select=id,item_code,item_name,category,data`, { headers }),
    fetch(`${url}/rest/v1/recipes?tenant_id=eq.${TENANT_ID}&select=id,recipe_code,recipe_name,menu_item_id`, { headers })
  ]);

  const invList = await invRes.json();
  const menuList = await menuRes.json();
  const recList = await recRes.json();

  const invByCode = new Map(invList.map(i => [i.item_code, i]));
  const missingInv = masterRows.filter(r => !invByCode.has(r.item_code));

  console.log(`Live active inventory: ${invList.length} | Missing from live Supabase: ${missingInv.length}`);

  if (DRY_RUN) {
    console.log('DRY RUN — missing SKUs:', missingInv.map(m => `${m.item_code}:${m.item_name}`).join(', '));
    return;
  }

  // 2. Insert missing inventory items
  if (missingInv.length > 0) {
    const newInvPayload = missingInv.map(r => {
      const packSize = parseFloat(r.pack_size || '1') || 1;
      const purchasePrice = parseFloat(r.purchase_price || '0') || 0;
      const unitVal = Number((purchasePrice / packSize).toFixed(2));
      const itemId = `inv-${r.item_code.toLowerCase()}`;
      return {
        uuid: crypto.randomUUID(),
        tenant_id: TENANT_ID,
        item_code: r.item_code,
        item_name: r.item_name,
        item_type: r.item_type === 'Finished Good' ? 'FINISHED_GOOD' : 'RAW_MATERIAL',
        category_code: r.category_code,
        base_uom: r.base_uom,
        opening_stock: 0,
        reorder_level: parseFloat(r.reorder_level || '0') || 0,
        unit_valuation: unitVal,
        default_location_code: r.default_location_code,
        default_supplier_code: r.preferred_supplier_code,
        version: 1,
        status: 'ACTIVE',
        data: {
          id: itemId,
          itemCode: r.item_code,
          itemName: r.item_name,
          itemType: r.item_type === 'Finished Good' ? 'FINISHED_GOOD' : 'RAW_MATERIAL',
          categoryCode: r.category_code,
          baseUom: r.base_uom,
          purchaseUom: r.purchase_uom,
          packSize,
          defaultLocationCode: r.default_location_code,
          preferredSupplierCode: r.preferred_supplier_code,
          unitValuation: unitVal,
          yieldPct: parseFloat(r.yield_pct || '100') || 100,
          department: r.department || 'BAR',
          status: 'ACTIVE'
        }
      };
    });

    const insRes = await fetch(`${url}/rest/v1/inventory`, {
      method: 'POST',
      headers,
      body: JSON.stringify(newInvPayload)
    });
    const inserted = await insRes.json();
    if (!insRes.ok) throw new Error('Inventory insert failed: ' + JSON.stringify(inserted));
    console.log(`Inserted ${inserted.length} new Master Inventory SKUs into Supabase.`);
    inserted.forEach(i => invByCode.set(i.item_code, i));
  }

  // 3. Upsert 13 Cocktail & Mocktail recipes + recipe_ingredients + link kitchen_menu_items
  const now = new Date().toISOString();
  for (const r of COCKTAIL_RECIPES) {
    const menu = menuList.find(m => m.item_code === r.menuCode);
    if (!menu) throw new Error(`Menu item ${r.menuCode} (${r.recipeName}) not found in live kitchen_menu_items`);

    const existingRec = recList.find(x => x.recipe_code === r.recipeCode || x.menu_item_id === menu.id);
    const recipeId = existingRec?.id || `recipe-${r.recipeCode.toLowerCase()}`;

    let totalCost = 0;
    const ingLines = r.ingredients.map((ing, idx) => {
      const mRow = masterByCode.get(ing.code);
      const liveInv = invByCode.get(ing.code);
      const packSize = parseFloat(mRow.conversion_factor || '1') || 1;
      const purchasePrice = parseFloat(mRow.last_purchase_price || '0') || 0;
      const unitCost = (parseFloat(liveInv?.unit_valuation) > 0)
        ? parseFloat(liveInv.unit_valuation)
        : Number((purchasePrice / packSize).toFixed(2));
      const lineCost = Number((ing.qty * unitCost).toFixed(2));
      totalCost += lineCost;
      return {
        id: `ri-${recipeId}-${idx + 1}-${ing.code.toLowerCase()}`,
        inventoryItemCode: ing.code,
        inventoryItemName: mRow.item_name,
        itemType: 'RAW_MATERIAL',
        quantity: ing.qty,
        uom: mRow.base_uom,
        recipeQty: ing.recipeQty,
        recipeUom: ing.recipeUom,
        unitCost,
        lineCost,
        recipeWastagePercent: 0,
        notes: ing.note || ''
      };
    });
    totalCost = Number(totalCost.toFixed(2));

    const recipePayload = {
      id: recipeId,
      tenant_id: TENANT_ID,
      recipe_code: r.recipeCode,
      recipe_name: r.recipeName,
      menu_item_id: menu.id,
      version: 1,
      status: 'APPROVED',
      yield_quantity: 1,
      yield_uom: 'PORTION',
      portion_count: 1,
      prep_time_minutes: 3,
      cook_time_minutes: 0,
      total_cost: totalCost,
      cost_per_portion: totalCost,
      instructions: `Standard ${r.category} recipe per Anchor Bar Cocktails workbook.`,
      data: {
        id: recipeId,
        recipeCode: r.recipeCode,
        recipeName: r.recipeName,
        menuItemId: menu.id,
        menuItemCode: r.menuCode,
        category: r.category,
        version: 1,
        status: 'APPROVED',
        yieldQuantity: 1,
        yieldUom: 'PORTION',
        portionCount: 1,
        totalCost,
        costPerPortion: totalCost,
        approvedAt: now,
        approvedBy: 'System (Cocktail Recipe Import)',
        ingredients: ingLines
      },
      updated_at: now
    };

    if (existingRec) {
      const uRes = await fetch(`${url}/rest/v1/recipes?id=eq.${recipeId}&tenant_id=eq.${TENANT_ID}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(recipePayload)
      });
      if (!uRes.ok) throw new Error(`Recipe update failed for ${r.recipeName}: ${await uRes.text()}`);
      await fetch(`${url}/rest/v1/recipe_ingredients?recipe_id=eq.${recipeId}&tenant_id=eq.${TENANT_ID}`, {
        method: 'DELETE',
        headers
      });
    } else {
      const cRes = await fetch(`${url}/rest/v1/recipes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(recipePayload)
      });
      if (!cRes.ok) throw new Error(`Recipe create failed for ${r.recipeName}: ${await cRes.text()}`);
    }

    const riPayload = ingLines.map(ing => ({
      id: ing.id,
      recipe_id: recipeId,
      tenant_id: TENANT_ID,
      inventory_item_code: ing.inventoryItemCode,
      inventory_item_name: ing.inventoryItemName,
      item_type: ing.itemType,
      quantity: ing.quantity,
      uom: ing.uom,
      recipe_wastage_percent: 0,
      unit_cost_snapshot: ing.unitCost,
      line_cost: ing.lineCost,
      data: ing
    }));

    const riRes = await fetch(`${url}/rest/v1/recipe_ingredients`, {
      method: 'POST',
      headers,
      body: JSON.stringify(riPayload)
    });
    if (!riRes.ok) throw new Error(`recipe_ingredients insert failed for ${r.recipeName}: ${await riRes.text()}`);

    // Link recipeId onto kitchen_menu_items.data and normalize single-serve Regular variant
    const basePrice = menu.data?.sellingPrice || menu.data?.price || (r.category === 'COCKTAILS' ? 545 : 325);
    const updatedMenuData = {
      ...(menu.data || {}),
      recipeId,
      consumptionMode: 'RECIPE',
      variants: [
        {
          id: `${menu.id}_reg`,
          name: 'Regular',
          sellingPrice: basePrice,
          availabilityStatus: 'AVAILABLE',
          recipeId
        }
      ]
    };
    const mPatch = await fetch(`${url}/rest/v1/kitchen_menu_items?id=eq.${menu.id}&tenant_id=eq.${TENANT_ID}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ data: updatedMenuData, updated_at: now })
    });
    if (!mPatch.ok) throw new Error(`Menu link failed for ${r.recipeName}: ${await mPatch.text()}`);

    console.log(`✔ Bound ${r.menuCode} (${r.recipeName}) -> ${recipeId} | ${ingLines.length} ingredients | Cost ₹${totalCost}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
