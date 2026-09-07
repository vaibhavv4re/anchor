import sys
import urllib.request
import json

sys.stdout.reconfigure(encoding='utf-8')

supabase_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
api_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'
tenant_id = 'tenant_h0qc7wf'

headers = {
    'apikey': api_key,
    'Authorization': f'Bearer {api_key}',
    'Accept': 'application/json'
}

def get(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

# 1. Inspect kitchen_menu_items
menu_items = get(f"{supabase_url}/kitchen_menu_items?select=id,tenant_id,item_code,item_name,category,selling_price,availability_status,lifecycle_status,recipe_id,data")
print("=== KITCHEN_MENU_ITEMS IN SUPABASE ===")
print(f"Total records across DB: {len(menu_items)}")
tenant_counts = {}
for m in menu_items:
    tid = m.get('tenant_id')
    tenant_counts[tid] = tenant_counts.get(tid, 0) + 1
for tid, count in tenant_counts.items():
    print(f"  Tenant '{tid}': {count} items")

print("\nSample menu items:")
for m in menu_items[:6]:
    print(f"  [{m.get('tenant_id')}] {m.get('item_code')}: {m.get('item_name')} | Cat: {m.get('category')} | Price: {m.get('selling_price')} | RecipeID: {m.get('recipe_id')}")

# 2. Inspect recipes
recipes = get(f"{supabase_url}/recipes?select=*")
print(f"\n=== RECIPES IN SUPABASE ({len(recipes)} total) ===")
for r in recipes:
    print(f"  [{r.get('tenant_id')}] Code: {r.get('recipe_code')} | ID: {r.get('id')} | Name: {r.get('recipe_name')} | Status: {r.get('status')} | PortionCost: {r.get('cost_per_portion')} | MenuID: {r.get('menu_item_id')}")
    # Inspect data blob or instructions
    d = r.get('data') or {}
    if 'ingredients' in d:
        print(f"    -> Embedded ingredients in data: {len(d['ingredients'])} items")

# 3. Inspect recipe_ingredients
ingredients = get(f"{supabase_url}/recipe_ingredients?select=*")
print(f"\n=== RECIPE_INGREDIENTS IN SUPABASE ({len(ingredients)} total) ===")
for ing in ingredients:
    print(f"  [{ing.get('tenant_id')}] RecipeID: {ing.get('recipe_id')} | ItemCode: {ing.get('inventory_item_code')} | Name: {ing.get('inventory_item_name')} | Qty: {ing.get('quantity')} {ing.get('uom')} | Cost: {ing.get('line_cost')}")

# 4. Check schema of kitchen_menu_items, recipes, recipe_ingredients
print("\n=== EXACT COLUMN DEFINITIONS IN SUPABASE ===")
if menu_items:
    print(f"kitchen_menu_items ({len(menu_items[0])} cols): {list(menu_items[0].keys())}")
if recipes:
    print(f"recipes ({len(recipes[0])} cols): {list(recipes[0].keys())}")
if ingredients:
    print(f"recipe_ingredients ({len(ingredients[0])} cols): {list(ingredients[0].keys())}")
