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
recipes = api_get("recipes?select=*&limit=100")

print(f"Loaded: {len(bar_menu)} Bar Menu Items, {len(bar_inv)} Bar Inventory SKUs, {len(recipes)} Recipes.")

# Index inventory by code and by normalized name
inv_by_code = {i['item_code']: i for i in bar_inv}
inv_by_name = {i['item_name'].lower().strip(): i for i in bar_inv}

print("\n=======================================================")
print("ALL 50 BAR INVENTORY SKUS:")
print("=======================================================")
for i in bar_inv:
    print(f"  {i['item_code']}: {i['item_name']} | UOM: {i['base_uom']} | Cat: {i.get('category_code')}")

print("\n=======================================================")
print("ANALYSIS OF 64 BAR MENU ITEMS:")
print("=======================================================")

categories = {}
matched_skus = set()
unmatched_menu = []
cocktails = []
beers = []
spirits = []
wines = []
soft_drinks = []

for m in bar_menu:
    code = m['item_code']
    name = m['item_name']
    cat = m['category']
    rec_id = m.get('recipe_id')
    variants = m.get('data', {}).get('variants') or []
    categories[cat] = categories.get(cat, 0) + 1

    # Try matching to inventory
    matched_inv = None
    # 1. Direct name match
    if name.lower().strip() in inv_by_name:
        matched_inv = inv_by_name[name.lower().strip()]
    else:
        # Fuzzy / partial match
        n_clean = name.lower().replace('old', '').replace('yrs', '').replace('yr', '').strip()
        for inv_name, inv_obj in inv_by_name.items():
            i_clean = inv_name.lower().replace('old', '').replace('yrs', '').replace('yr', '').strip()
            if n_clean == i_clean or n_clean in i_clean or i_clean in n_clean:
                matched_inv = inv_obj
                break

    if matched_inv:
        matched_skus.add(matched_inv['item_code'])
    else:
        unmatched_menu.append((code, name, cat, rec_id, len(variants)))

    # Classification by Category
    cat_upper = cat.upper()
    if 'COCKTAIL' in cat_upper or 'MOCKTAIL' in cat_upper or 'SHOOTER' in cat_upper or 'SHOT' in cat_upper:
        cocktails.append((code, name, cat, rec_id, variants, matched_inv))
    elif 'BEER' in cat_upper:
        beers.append((code, name, cat, rec_id, variants, matched_inv))
    elif 'WINE' in cat_upper:
        wines.append((code, name, cat, rec_id, variants, matched_inv))
    elif 'SOFT' in cat_upper or 'BEVERAGE' in cat_upper or 'MIXER' in cat_upper or 'WATER' in cat_upper or 'JUICE' in cat_upper or 'SODA' in cat_upper:
        soft_drinks.append((code, name, cat, rec_id, variants, matched_inv))
    else:
        spirits.append((code, name, cat, rec_id, variants, matched_inv))

print(f"\nMenu Categories Breakdown ({len(categories)} categories):")
for c, cnt in sorted(categories.items()):
    print(f"  {c}: {cnt} items")

print(f"\nClassification Summary:")
print(f"  Spirits (Whisky, Rum, Vodka, Gin, Tequila, Brandy, Liqueur): {len(spirits)}")
print(f"  Beers & Breezers: {len(beers)}")
print(f"  Wines: {len(wines)}")
print(f"  Soft Drinks & Mixers: {len(soft_drinks)}")
print(f"  Cocktails, Mocktails & Shooters: {len(cocktails)}")
print(f"  Total: {len(spirits) + len(beers) + len(wines) + len(soft_drinks) + len(cocktails)}")

print(f"\nMatched Inventory SKUs: {len(matched_skus)} of 50")
unmatched_inv_skus = set(inv_by_code.keys()) - matched_skus
print(f"Unmatched Inventory SKUs ({len(unmatched_inv_skus)}):")
for sku in sorted(unmatched_inv_skus):
    print(f"  {sku}: {inv_by_code[sku]['item_name']}")

print(f"\nUnmatched Menu Items ({len(unmatched_menu)}):")
for u in unmatched_menu:
    print(f"  {u[0]}: {u[1]} (Cat: {u[2]}, recipeId: {u[3]}, variants: {u[4]})")
