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

recipes = fetch_table('recipes')
print(f"Total recipes: {len(recipes)}")
for r in recipes:
    data = r.get('data') or {}
    print(f"\n--- Recipe: {r.get('recipe_name')} (ID: {r.get('id')}, Code: {r.get('recipe_code')}, Status: {r.get('status')}) ---")
    print(f"    Linked MenuItemId: {r.get('menu_item_id') or data.get('menuItemId')} | MenuItemCode: {data.get('menuItemCode')}")
    ingredients = data.get('ingredients') or []
    print(f"    Ingredients ({len(ingredients)}):")
    for ing in ingredients:
        print(f"      - Item: {ing.get('inventoryItemName') or ing.get('itemName') or ing.get('name')} | Code: {ing.get('inventoryItemCode') or ing.get('itemCode')} | Qty: {ing.get('quantity') or ing.get('recipeQty')} {ing.get('uom') or ing.get('baseUom')}")

print("\n--- Current Stock Balances ---")
balances = fetch_table('stock_balances')
for b in balances:
    data = b.get('data') or {}
    print(f"  Item: {b.get('item_code') or data.get('itemCode')} | Location: {b.get('location_code') or data.get('locationCode')} | Qty: {b.get('quantity') or data.get('quantity')} | Name: {data.get('itemName') or data.get('inventoryItemName')}")

print("\n--- Inventory Master Items ---")
inv = fetch_table('inventory')
for item in inv[:10]:
    print(f"  Item: {item.get('item_name')} | Code: {item.get('item_code')} | Base UOM: {item.get('base_uom')} | Opening Stock: {item.get('opening_stock')}")
