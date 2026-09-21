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
inv_by_code = {i['item_code']: i for i in bar_inv}

# Explicit mapping rules between menu item codes and inventory SKUs:
# RC-BAR-101 .. 142 map directly to BAR0001 .. BAR0042
# RC-BAR-143 (Carlsberg Elephant) maps to BAR0044
# RC-BAR-144 (Budweiser Magnum) maps to BAR0043
# RC-BAR-145 (Tuborg Strong) maps to BAR0045
# RC-BAR-146 (Kingfisher Strong) maps to BAR0046
# RC-BAR-147 .. 160 are Cocktails & Mocktails (Multi-ingredient RECIPE)
# RC-BAR-161 (Breezer) maps to BAR0047
# RC-BAR-162 (Bottled Water) maps to BAR0048
# RC-BAR-163 (Cold Drink) maps to BAR0049
# RC-BAR-164 (Soda) maps to BAR0050

sku_mapping = {}
for idx in range(101, 143):
    menu_code = f"RC-BAR-{idx}"
    inv_code = f"BAR{str(idx - 100).padStart if hasattr(str(idx-100), 'padStart') else str(idx-100).zfill(4)}"
    sku_mapping[menu_code] = inv_code

sku_mapping["RC-BAR-143"] = "BAR0044" # Carlsberg Elephant
sku_mapping["RC-BAR-144"] = "BAR0043" # Budweiser Magnum
sku_mapping["RC-BAR-145"] = "BAR0045" # Tuborg Strong
sku_mapping["RC-BAR-146"] = "BAR0046" # Kingfisher Strong
sku_mapping["RC-BAR-161"] = "BAR0047" # Breezer
sku_mapping["RC-BAR-162"] = "BAR0048" # Bottled Water
sku_mapping["RC-BAR-163"] = "BAR0049" # Cold Drink
sku_mapping["RC-BAR-164"] = "BAR0050" # Soda

print(f"{'MENU CODE':12} | {'MENU ITEM NAME':32} | {'CAT':22} | {'INV SKU':8} | {'INV NAME':32} | {'MODE':8} | {'VARIANTS'}")
print("-" * 150)

for m in bar_menu:
    m_code = m['item_code']
    m_name = m['item_name']
    m_cat = m['category']
    inv_sku = sku_mapping.get(m_code, "—")
    inv_obj = inv_by_code.get(inv_sku)
    inv_name = inv_obj['item_name'] if inv_obj else "— (Recipe Required)"
    
    variants = m.get('data', {}).get('variants') or []
    var_strs = []
    for v in variants:
        v_name = v.get('name')
        v_size = v.get('servingSize')
        v_unit = v.get('servingUnit')
        v_price = v.get('sellingPrice')
        var_strs.append(f"{v_name} ({v_size}{v_unit} @ ₹{v_price})")
    
    if m_cat in ['COCKTAILS', 'MOCKTAILS']:
        mode = "RECIPE"
    elif m_cat in ['MILD BEER', 'STRONG BEER', 'BREEZER']:
        mode = "UNIT"
    elif m_cat in ['BEVERAGE']:
        mode = "UNIT/POUR"
    else:
        mode = "POUR/UNIT"

    print(f"{m_code:12} | {m_name:32} | {m_cat:22} | {inv_sku:8} | {inv_name:32} | {mode:8} | {', '.join(var_strs)}")
