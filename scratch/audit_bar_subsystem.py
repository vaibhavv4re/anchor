import urllib.request, json

url_base = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
}

def get(table_and_query):
    req = urllib.request.Request(f'{url_base}/{table_and_query}', headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            data = resp.read().decode('utf-8')
            return json.loads(data)
    except Exception as e:
        print(f"Error fetching {table_and_query}: {e}")
        return []

print('=== 1. STORAGE LOCATIONS ===')
locs = get('storage_locations?select=*')
for l in locs:
    print(f"  Code: {l.get('location_code')} | Name: {l.get('location_name')} | Type: {l.get('storage_type')}")

print('\n=== 2. INVENTORY ITEMS (TOTAL & BAR CLASSIFIED) ===')
all_inv = get('inventory?select=uuid,item_code,item_name,item_type,category_code,base_uom,opening_stock,unit_valuation,data&limit=300')
print(f"Fetched {len(all_inv)} items from inventory.")

categories = set(i.get('category_code') for i in all_inv)
print(f"Category codes in inventory: {sorted(list(str(c) for c in categories))}")

# Check items related to liquor, bar, wine, beer, spirits
bar_inv = [i for i in all_inv if any(k in str(i.get('item_name','')).lower() or k in str(i.get('category_code','')).lower() for k in ['bar', 'beer', 'whisky', 'rum', 'vodka', 'gin', 'wine', 'liquor', 'beverage', 'syrup', 'tonic', 'cocktail', 'scotch', 'brandy', 'spirit'])]
print(f"Bar/Beverage items found in inventory: {len(bar_inv)}")
for b in bar_inv[:20]:
    print(f"  [{b.get('item_code')}] {b.get('item_name')} | Cat: {b.get('category_code')} | Type: {b.get('item_type')} | UOM: {b.get('base_uom')} | OpenStock: {b.get('opening_stock')}")

print('\n=== 3. STOCK BALANCES (PHYSICAL STOCK ON HAND) ===')
balances = get('stock_balances?select=*')
print(f"Stock balances total: {len(balances)}")
for b in balances:
    print(f"  Loc: {b.get('location_code')} | Item: {b.get('item_code')} | Qty: {b.get('quantity')} | UnitCost: {b.get('unit_cost')} | Val: {b.get('valuation')}")

print('\n=== 4. RECIPES ===')
recipes = get('recipes?select=recipe_code,recipe_name,status,version,menu_item_id')
print(f"Total recipes: {len(recipes)}")
for r in recipes:
    print(f"  [{r.get('recipe_code')}] {r.get('recipe_name')} ({r.get('status')}) v{r.get('version')}")

print('\n=== 5. KITCHEN_MENU_ITEMS (routing=BAR) ===')
bar_menu = get('kitchen_menu_items?routing=eq.BAR&select=id,item_code,item_name,category,selling_price,routing,data')
print(f"Total Bar Menu Items in DB: {len(bar_menu)}")
cats = {}
for bm in bar_menu:
    c = bm.get('category', 'UNCATEGORIZED')
    cats[c] = cats.get(c, 0) + 1
print("Categories in Bar Menu:")
for c, cnt in sorted(cats.items()):
    print(f"  {c}: {cnt}")

print("\nSample 5 Bar Menu Items:")
for bm in bar_menu[:5]:
    d = bm.get('data') or {}
    variants = d.get('variants') or []
    print(f"  [{bm.get('item_code')}] {bm.get('item_name')} | Price: {bm.get('selling_price')} | Variants: {len(variants)}")
    if variants:
        print(f"      Variants sample: {variants[:2]}")
