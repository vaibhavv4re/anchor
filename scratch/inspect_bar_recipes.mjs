import { runtimeConfig } from '../businessos/platform/cloud/runtimeConfig.js';

const TENANT_ID = 'tenant_h0qc7wf';
const url = runtimeConfig.getSupabaseUrl();
const anonKey = runtimeConfig.getAnonKey();

const resp = await fetch(`${url}/functions/v1/pin-login`, {
  method: 'POST',
  headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin: '333333', tenantId: TENANT_ID })
});
const auth = await resp.json();
const headers = { apikey: anonKey, Authorization: `Bearer ${auth.token}` };

const [mRes, rRes, iRes] = await Promise.all([
  fetch(`${url}/rest/v1/kitchen_menu_items?tenant_id=eq.${TENANT_ID}&select=id,item_code,item_name,category,data`, { headers }),
  fetch(`${url}/rest/v1/recipes?tenant_id=eq.${TENANT_ID}&select=id,recipe_name,menu_item_id,status,data`, { headers }),
  fetch(`${url}/rest/v1/inventory?tenant_id=eq.${TENANT_ID}&status=eq.ACTIVE&select=id,item_code,item_name,base_uom,category,location_code,unit_cost`, { headers })
]);

const menus = await mRes.json();
const recipes = await rRes.json();
const inv = await iRes.json();

console.log('menus:', Array.isArray(menus) ? menus.length : menus);
console.log('recipes:', Array.isArray(recipes) ? recipes.length : recipes);
console.log('inv:', Array.isArray(inv) ? inv.length : inv);

if (Array.isArray(menus)) {
  const targets = [
    'Seaside Balcony', 'Afternoon Garden', 'Kitchen Pantry', 'Feni Cellar',
    'Orchard', 'Courtyard', 'Sunset Terrace', 'Tropical Grove',
    'Virgin Watermelon & Basil Mojito', 'Shikanji', 'Ginger Me (Frozen)',
    'Mango Mastani', 'Guava Mary', 'Fresh Juice'
  ];
  for (const t of targets) {
    const m = menus.find(x => (x.item_name || x.data?.itemName || '').toLowerCase() === t.toLowerCase());
    console.log(t, '->', m ? `${m.id} | code=${m.item_code} | cat=${m.category} | recipeId=${m.data?.recipeId}` : 'NOT FOUND');
  }
}
