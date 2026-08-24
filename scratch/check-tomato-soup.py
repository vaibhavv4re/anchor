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
        print(f"Error fetching {table}: {e}")
        return []

print("=== ALL RECIPES IN SUPABASE ===")
recipes = fetch_table('recipes')
for r in recipes:
    data = r.get('data') or {}
    print(f"\nRecipe: {r.get('recipe_name')} (ID: {r.get('id')}, Code: {r.get('recipe_code')}, Status: {r.get('status')})")
    print(f"  menu_item_id: {r.get('menu_item_id')} | menuItemCode: {data.get('menuItemCode')}")
    print(f"  Ingredients: {json.dumps(data.get('ingredients') or r.get('ingredients') or [], indent=2)}")

print("\n=== TOMATO SOUP MENU ITEM ===")
menu_items = fetch_table('kitchen_menu_items')
for m in menu_items:
    if 'Tomato' in (m.get('item_name') or ''):
        data = m.get('data') or {}
        print(f"Item: {m.get('item_name')} | ID: {m.get('id')} | Code: {m.get('item_code')} | RecipeId: {m.get('recipe_id') or data.get('recipeId')}")
        print("  Full data:", json.dumps(m, indent=2))

print("\n=== TOMATO STOCK BALANCES ===")
balances = fetch_table('stock_balances')
for b in balances:
    data = b.get('data') or {}
    code = b.get('item_code') or data.get('itemCode')
    name = data.get('itemName') or data.get('inventoryItemName') or ''
    if 'RM0310' in str(code) or 'Tomato' in str(name):
        print(f"Balance: {b.get('id')} | Code: {code} | Loc: {b.get('location_code') or data.get('locationCode')} | Qty: {b.get('quantity') or data.get('quantity')} | UOM: {data.get('uom') or data.get('baseUom')}")

print("\n=== RECENT ORDERS ===")
orders = fetch_table('orders')
for o in orders[-3:]:
    data = o.get('data') or {}
    print(f"Order: {o.get('order_number') or data.get('orderNumber')} | ID: {o.get('id')} | Items: {json.dumps(data.get('items') or o.get('items') or [], indent=2)}")
