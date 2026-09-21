/**
 * Fix RCP-1427 (Tropical Grove) ingredient UOM/quantity data.
 * Bug: bar SKUs stored as 'KG' with ML-scale numbers (Gin 0.6 KG = 600 ML entry mistake).
 * Correct semantics for a cocktail serving: Gin 2x30ml pegs = 60 ML, Soda 200 ML.
 * unitCost values (1800, 35) are already per-LTR authoritative -> kept unchanged.
 */
const BASE = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const correctedIngredients = [
  {
    uom: 'ML',
    itemType: 'Raw Material',
    lineCost: 7,
    quantity: 200,
    unitCost: 35,
    grossQuantity: 200,
    inventoryItemCode: 'BAR0050',
    inventoryItemName: 'Soda',
    standardYieldPercent: 100
  },
  {
    uom: 'ML',
    itemType: 'Raw Material',
    lineCost: 108,
    quantity: 60,
    unitCost: 1800,
    grossQuantity: 60,
    inventoryItemCode: 'BAR0027',
    inventoryItemName: 'Greater Than Londan Dry Gin',
    standardYieldPercent: 100
  }
];

(async () => {
  const res = await fetch(`${BASE}/recipes?id=eq.rcp-kcwoqo3&select=id,data`, { headers: H });
  const [rec] = await res.json();
  if (!rec) throw new Error('Recipe rcp-kcwoqo3 not found');

  const updatedData = {
    ...rec.data,
    ingredients: correctedIngredients,
    totalCost: 115,
    costPerPortion: 115,
    updatedAt: new Date().toISOString()
  };

  const patch = await fetch(`${BASE}/recipes?id=eq.rcp-kcwoqo3`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ data: updatedData })
  });
  if (!patch.ok) throw new Error('PATCH failed: ' + await patch.text());
  const [after] = await patch.json();
  console.log('✅ RCP-1427 patched. Ingredients now:');
  after.data.ingredients.forEach(i => console.log(`   ${i.inventoryItemCode}: ${i.quantity} ${i.uom} @ unitCost ${i.unitCost} -> lineCost ${i.lineCost}`));
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
