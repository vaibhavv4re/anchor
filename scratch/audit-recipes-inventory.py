import urllib.request
import json

base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'

headers = {
    'apikey': anon_key,
    'Authorization': f'Bearer {anon_key}',
    'Content-Type': 'application/json'
}

def fetch_table(table):
    req = urllib.request.Request(f'{base_url}/{table}?select=*', headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return []

print("=== RECIPES ===")
recipes = fetch_table('recipes')
print(f"Total recipes: {len(recipes)}")
for r in recipes[:10]:
    data = r.get('data') or {}
    print(f"Recipe: {r.get('recipe_name') or data.get('recipeName')} | Status: {r.get('status') or data.get('status')} | ID: {r.get('id')} | Code: {r.get('recipe_code') or data.get('recipeCode')}")
    ingredients = data.get('ingredients') or []
    for ing in ingredients:
        print(f"   -> {ing.get('itemName') or ing.get('name')} ({ing.get('itemCode')}): {ing.get('quantity') or ing.get('recipeQty')} {ing.get('uom') or ing.get('recipeUom')}")

print("\n=== STOCK BALANCES ===")
balances = fetch_table('stock_balances')
print(f"Total stock balances: {len(balances)}")
for b in balances[:10]:
    data = b.get('data') or {}
    print(f"Balance: {b.get('item_code') or data.get('itemCode')} | Location: {b.get('location_code') or data.get('locationCode')} | Qty: {b.get('quantity') or data.get('quantity') or data.get('balanceQuantity')}")

print("\n=== KITCHEN MENU ITEMS ===")
menu_items = fetch_table('kitchen_menu_items')
print(f"Total kitchen menu items: {len(menu_items)}")
for m in menu_items[:10]:
    data = m.get('data') or {}
    print(f"Menu Item: {m.get('item_name') or data.get('name')} | RecipeId: {m.get('recipe_id') or data.get('recipeId')} | Code: {m.get('item_code') or data.get('itemCode')}")
