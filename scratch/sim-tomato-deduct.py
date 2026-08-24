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
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

recipes = fetch_table('recipes')
menu_items = fetch_table('kitchen_menu_items')
stock_balances = fetch_table('stock_balances')

item = {
    "name": "Tomato Soup",
    "itemId": "menu-item-gm77ocy",
    "itemCode": "menu-item-gm77ocy",
    "quantity": 1
}

itemId = item['itemId']
orderQty = item['quantity']

menuItem = next((m for m in menu_items if m.get('id') == itemId or m.get('item_code') == itemId or (m.get('data') and m['data'].get('itemCode') == itemId)), None)
print(f"Found menuItem: {menuItem.get('item_name') if menuItem else 'None'} | recipe_id: {menuItem.get('recipe_id') if menuItem else 'None'}")

# Lookup recipe
recipeId = item.get('recipeId') or (menuItem.get('recipe_id') if menuItem else None) or (menuItem.get('data', {}).get('recipeId') if menuItem else None)
print(f"recipeId: {recipeId}")

recipe = next((r for r in recipes if r.get('id') == recipeId or r.get('recipe_code') == itemId or r.get('menu_item_id') == itemId or (menuItem and (r.get('data', {}).get('menuItemCode') == menuItem.get('item_code') or r.get('menu_item_id') == menuItem.get('id')))), None)
print(f"Found recipe: {recipe.get('recipe_name') if recipe else 'None'}")

if recipe:
    ings = recipe.get('data', {}).get('ingredients') or []
    print(f"Ingredients count: {len(ings)}")
    for ing in ings:
        ingCode = ing.get('inventoryItemCode')
        ingName = ing.get('inventoryItemName')
        ingQty = ing.get('quantity')
        print(f"  Ing: {ingCode} ({ingName}) - Qty: {ingQty}")
        
        # Match stock balance
        for bal in stock_balances:
            bCode = bal.get('item_code') or bal.get('data', {}).get('itemCode')
            bLoc = bal.get('location_code') or bal.get('data', {}).get('locationCode')
            bQty = bal.get('quantity') or bal.get('data', {}).get('quantity')
            if 'RM0310' in str(bCode):
                print(f"    Matching against: {bal.get('id')} ({bCode} @ {bLoc}) Qty: {bQty}")
