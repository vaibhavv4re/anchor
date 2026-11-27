import { runtimeConfig } from '../businessos/platform/cloud/runtimeConfig.js';

const TENANT_ID = 'tenant_h0qc7wf';
const APPLY = process.argv.includes('--apply');

const BAR_POUR_UNIT_MAP = {
  'RC-BAR-115': { sku: 'BAR0185', mode: 'UNIT' }, // Breezer Blackberry
  'RC-BAR-116': { sku: 'BAR0186', mode: 'UNIT' }, // Breezer Cranberry
  'RC-BAR-117': { sku: 'BAR0187', mode: 'UNIT' }, // Breezer Jamaican Passion
  'RC-BAR-118': { sku: 'BAR0191', mode: 'UNIT' }, // Bottled Water
  'RC-BAR-119': { sku: 'BAR0192', mode: 'UNIT' }, // Cold Drink
  'RC-BAR-120': { sku: 'BAR0193', mode: 'UNIT' }, // Soda
  'RC-BAR-121': { sku: 'BAR0101', mode: 'POUR' }, // Glenfiddich 12 Yr
  'RC-BAR-122': { sku: 'BAR0102', mode: 'POUR' }, // Glenmorangie 12 Yr
  'RC-BAR-123': { sku: 'BAR0104', mode: 'POUR' }, // Singleton Glendullan 12 Yr
  'RC-BAR-124': { sku: 'BAR0105', mode: 'POUR' }, // Amrut Amalgam
  'RC-BAR-125': { sku: 'BAR0112', mode: 'POUR' }, // J.W. Blue Label
  'RC-BAR-126': { sku: 'BAR0115', mode: 'POUR' }, // J.W. Gold Label
  'RC-BAR-127': { sku: 'BAR0114', mode: 'POUR' }, // J.W. Double Black
  'RC-BAR-128': { sku: 'BAR0113', mode: 'POUR' }, // J.W. Black Label
  'RC-BAR-129': { sku: 'BAR0116', mode: 'POUR' }, // J.W. Red Label
  'RC-BAR-130': { sku: 'BAR0106', mode: 'POUR' }, // 100 Pipers
  'RC-BAR-131': { sku: 'BAR0111', mode: 'POUR' }, // Chivas Regal 12 Yr
  'RC-BAR-132': { sku: 'BAR0127', mode: 'POUR' }, // Amrut Fusion
  'RC-BAR-133': { sku: 'BAR0140', mode: 'POUR' }, // Macintosh
  'RC-BAR-134': { sku: 'BAR0122', mode: 'POUR' }, // Monkey Shoulder
  'RC-BAR-135': { sku: 'BAR0118', mode: 'POUR' }, // Jameson Black Barrel
  'RC-BAR-136': { sku: 'BAR0119', mode: 'POUR' }, // Jameson Stout Edition
  'RC-BAR-137': { sku: 'BAR0120', mode: 'POUR' }, // Jameson Irish
  'RC-BAR-138': { sku: 'BAR0103', mode: 'POUR' }, // Seven Islands Malt
  'RC-BAR-139': { sku: 'BAR0142', mode: 'POUR' }, // Royal Ranthambore
  'RC-BAR-140': { sku: 'BAR0124', mode: 'POUR' }, // Teachers 50
  'RC-BAR-141': { sku: 'BAR0123', mode: 'POUR' }, // Teachers Highland
  'RC-BAR-142': { sku: 'BAR0110', mode: 'POUR' }, // Black Dog Centenary
  'RC-BAR-143': { sku: 'BAR0109', mode: 'POUR' }, // Black Dog Deluxe
  'RC-BAR-144': { sku: 'BAR0107', mode: 'POUR' }, // Ballantines
  'RC-BAR-145': { sku: 'BAR0108', mode: 'POUR' }, // Black & White
  'RC-BAR-146': { sku: 'BAR0117', mode: 'POUR' }, // Jack Daniels
  'RC-BAR-147': { sku: 'BAR0121', mode: 'POUR' }, // Jim Beam
  'RC-BAR-148': { sku: 'BAR0166', mode: 'POUR' }, // Woodburns
  'RC-BAR-149': { sku: 'BAR0125', mode: 'POUR' }, // Vat 69
  'RC-BAR-150': { sku: 'BAR0132', mode: 'POUR' }, // Oaksmith Nagomi
  'RC-BAR-151': { sku: 'BAR0131', mode: 'POUR' }, // Oaksmith Gold
  'RC-BAR-152': { sku: 'BAR0133', mode: 'POUR' }, // Oaksmith Silver
  'RC-BAR-153': { sku: 'BAR0135', mode: 'POUR' }, // Rockford Reserve
  'RC-BAR-154': { sku: 'BAR0134', mode: 'POUR' }, // Rockford Classic
  'RC-BAR-155': { sku: 'BAR0126', mode: 'POUR' }, // William Lawson's
  'RC-BAR-156': { sku: 'BAR0130', mode: 'POUR' }, // Blenders Pride Reserve
  'RC-BAR-157': { sku: 'BAR0129', mode: 'POUR' }, // Blenders Pride
  'RC-BAR-158': { sku: 'BAR0128', mode: 'POUR' }, // Antiquity Blue
  'RC-BAR-159': { sku: 'BAR0136', mode: 'POUR' }, // Signature Premier
  'RC-BAR-160': { sku: 'BAR0137', mode: 'POUR' }, // Signature Rare
  'RC-BAR-161': { sku: 'BAR0141', mode: 'POUR' }, // Royal Challenge
  'RC-BAR-162': { sku: 'BAR0143', mode: 'POUR' }, // Royal Stag
  'RC-BAR-163': { sku: 'BAR0138', mode: 'POUR' }, // Imperial Blue
  'RC-BAR-164': { sku: 'BAR0158', mode: 'POUR' }  // Bacardi Lemon
};

function slugPrefix(name) {
  return 'var_' + String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function main() {
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
    'Content-Type': 'application/json'
  };

  const [menus, inv] = await Promise.all([
    fetch(`${url}/rest/v1/kitchen_menu_items?tenant_id=eq.${TENANT_ID}&item_code=like.RC-BAR-*&select=id,item_code,item_name,category,data&order=item_code.asc`, { headers }).then(r => r.json()),
    fetch(`${url}/rest/v1/inventory?tenant_id=eq.${TENANT_ID}&status=eq.ACTIVE&item_code=like.BAR*&select=item_code,item_name,base_uom`, { headers }).then(r => r.json())
  ]);

  const invByCode = new Map(inv.map(i => [i.item_code, i]));
  const targets = menus.filter(m => BAR_POUR_UNIT_MAP[m.item_code]);
  console.log(`Matched ${targets.length} non-cocktail/mocktail Bar Menu items.`);

  const now = new Date().toISOString();
  let totalCleanVariants = 0;

  for (const m of targets) {
    const mapping = BAR_POUR_UNIT_MAP[m.item_code];
    const invItem = invByCode.get(mapping.sku);
    if (!invItem) throw new Error(`Missing inventory SKU ${mapping.sku} for ${m.item_code}`);

    const expectedPrefix = slugPrefix(m.item_name);
    const rawVars = Array.isArray(m.data?.variants) ? m.data.variants : [];

    // Keep only variants belonging to this item and deduplicate by name
    const seenNames = new Set();
    const cleanVars = [];
    for (const v of rawVars) {
      const idMatch = !v.id || v.id.startsWith(expectedPrefix) || v.id.startsWith(m.id);
      if (!idMatch) continue;
      const vName = String(v.name || 'Regular').trim();
      if (seenNames.has(vName)) continue;
      seenNames.add(vName);

      // Parse servingSize from name if missing
      let servingSize = parseFloat(v.servingSize || 0);
      let servingUnit = v.servingUnit || null;
      if (!servingSize) {
        const mm = vName.match(/(\d+(?:\.\d+)?)\s*(ml|ltr|l)/i);
        if (mm) {
          servingSize = parseFloat(mm[1]);
          servingUnit = mm[2].toUpperCase() === 'ML' ? 'ML' : 'LTR';
        } else if (mapping.mode === 'UNIT') {
          servingSize = 1;
          servingUnit = 'PCS';
        }
      }

      cleanVars.push({
        ...v,
        servingSize: servingSize || v.servingSize,
        servingUnit: servingUnit || v.servingUnit,
        linkedInventorySku: mapping.sku,
        consumptionMode: mapping.mode
      });
    }

    if (cleanVars.length === 0) {
      cleanVars.push({
        id: `${m.id}_reg`,
        name: 'Regular',
        sellingPrice: m.data?.sellingPrice || 0,
        availabilityStatus: 'AVAILABLE',
        servingSize: 1,
        servingUnit: 'PCS',
        linkedInventorySku: mapping.sku,
        consumptionMode: mapping.mode
      });
    }

    totalCleanVariants += cleanVars.length;

    if (!APPLY) {
      console.log(`DRY: ${m.item_code} (${m.item_name}) -> ${mapping.mode} ${mapping.sku} (${invItem.item_name}) | vars: ${rawVars.length} -> ${cleanVars.length}`);
      continue;
    }

    const updatedData = {
      ...(m.data || {}),
      linkedInventorySku: mapping.sku,
      consumptionMode: mapping.mode,
      variants: cleanVars
    };

    const pRes = await fetch(`${url}/rest/v1/kitchen_menu_items?id=eq.${m.id}&tenant_id=eq.${TENANT_ID}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ data: updatedData, updated_at: now })
    });
    if (!pRes.ok) throw new Error(`Patch failed for ${m.item_code}: ${await pRes.text()}`);
    console.log(`✔ ${m.item_code} (${m.item_name}) -> ${mapping.mode} ${mapping.sku} (${invItem.item_name}) | ${cleanVars.length} clean variants`);
  }

  console.log(`Total clean variants configured: ${totalCleanVariants}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

