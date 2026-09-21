import urllib.request
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'

HEADERS = {
    'apikey': ANON_KEY,
    'Authorization': f'Bearer {ANON_KEY}',
    'Content-Type': 'application/json'
}

def api_get(endpoint):
    url = f"{BASE_URL}/{endpoint}"
    req = urllib.request.Request(url, headers=HEADERS, method='GET')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

bar_menu = api_get("kitchen_menu_items?routing=eq.BAR&order=item_code.asc&limit=100")
bar_inv = api_get("inventory?item_code=like.BAR%25&order=item_code.asc&limit=100")
inv_map = {i['item_code']: i for i in bar_inv}

# Explicit mapping
# 101 - 142 -> BAR0001 - BAR0042
# 143 (Carlsberg Elephant) -> BAR0044
# 144 (Budweiser Magnum) -> BAR0043
# 145 (Tuborg Strong) -> BAR0045
# 146 (Kingfisher Strong) -> BAR0046
# 147 - 153 -> Cocktails (No direct SKU, Recipe Required)
# 154 - 160 -> Mocktails (No direct SKU, Recipe Required)
# 161 (Breezer) -> BAR0047
# 162 (Bottled Water) -> BAR0048
# 163 (Cold Drink) -> BAR0049
# 164 (Soda) -> BAR0050

sku_lookup = {}
for idx in range(101, 143):
    sku_lookup[f"RC-BAR-{idx}"] = f"BAR{str(idx-100).zfill(4)}"

sku_lookup["RC-BAR-143"] = "BAR0044" # Carlsberg Elephant
sku_lookup["RC-BAR-144"] = "BAR0043" # Budweiser Magnum
sku_lookup["RC-BAR-145"] = "BAR0045" # Tuborg Strong
sku_lookup["RC-BAR-146"] = "BAR0046" # Kingfisher Strong
sku_lookup["RC-BAR-161"] = "BAR0047" # Breezer
sku_lookup["RC-BAR-162"] = "BAR0048" # Bottled Water
sku_lookup["RC-BAR-163"] = "BAR0049" # Cold Drink
sku_lookup["RC-BAR-164"] = "BAR0050" # Soda

matrix = []

for m in bar_menu:
    code = m['item_code']
    name = m['item_name']
    cat = m['category']
    rec_id = m.get('recipe_id')
    variants = m.get('data', {}).get('variants') or []
    mapped_sku = sku_lookup.get(code)
    inv_item = inv_map.get(mapped_sku) if mapped_sku else None

    # Determine consumption mode
    if cat in ['COCKTAILS', 'MOCKTAILS']:
        mode = 'RECIPE'
    elif cat in ['MILD BEER', 'STRONG BEER', 'BREEZER']:
        mode = 'UNIT'
    elif cat == 'BEVERAGE':
        mode = 'UNIT / POUR'
    else:
        mode = 'POUR'

    # Analyze variants
    for v in variants:
        v_name = v.get('name')
        v_size = v.get('servingSize')
        v_unit = v.get('servingUnit')
        v_price = v.get('sellingPrice')

        serving_qty = None
        base_uom = inv_item['base_uom'] if inv_item else '—'

        if mode == 'POUR':
            if v_unit == 'ML':
                serving_qty = f"{v_size / 1000.0:.3f}"
            elif v_name == '750 ml' or v_size == 750:
                serving_qty = "0.750"
            elif v_name == 'Regular' and v_price == 0:
                serving_qty = "UNDEFINED (₹0 artifact)"
            else:
                serving_qty = f"{v_size} {v_unit}"
        elif mode == 'UNIT':
            serving_qty = "1.000 (Bottle)"
        elif mode == 'UNIT / POUR':
            if v_size == 750:
                serving_qty = "0.750 (Bottle)"
            else:
                serving_qty = "1.000 (Unit/Can)"
        elif mode == 'RECIPE':
            serving_qty = "BOM Recipe Required"

        # Forensic findings
        notes = []
        if code == 'RC-BAR-111' and rec_id:
            notes.append(f"Phantom recipe_id: '{rec_id}' (straight drink, recipe non-existent)")
        if mapped_sku in ['BAR0016', 'BAR0027', 'BAR0029', 'BAR0040']:
            notes.append(f"Spelling difference ({name} vs {inv_item['item_name']})")
        if code in ['RC-BAR-143', 'RC-BAR-144']:
            notes.append(f"Index swap (Mild/Strong beer alignment with inventory)")
        if v_name == 'Regular' and v_price == 0 and mode == 'POUR':
            notes.append("Dangling ₹0 zero-volume variant")
        if code in ['RC-BAR-109', 'RC-BAR-116'] and ('Small' in v_name or 'Large' in v_name):
            notes.append("Duplicate variant pricing tier")
        if mode == 'UNIT' and v_price == 0:
            notes.append("Zero selling price on menu item")

        matrix.append({
            'menu_code': code,
            'menu_name': name,
            'category': cat,
            'variant': v_name,
            'serving_size': f"{v_size} {v_unit}",
            'price': v_price,
            'mode': mode,
            'sku': mapped_sku or '—',
            'inv_name': inv_item['item_name'] if inv_item else '—',
            'base_uom': base_uom,
            'serving_qty': serving_qty,
            'status': 'Mapped' if mapped_sku else 'Recipe Required',
            'notes': '; '.join(notes) if notes else 'Clean'
        })

with open('scratch/forensic_matrix_output.json', 'w', encoding='utf-8') as f:
    json.dump(matrix, f, indent=2)

print(f"Generated complete matrix with {len(matrix)} variant rows across 64 menu items.")
