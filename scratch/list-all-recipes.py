import urllib.request
import json

base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'

headers = {
    'apikey': anon_key,
    'Authorization': f'Bearer {anon_key}',
    'Content-Type': 'application/json'
}

req = urllib.request.Request(f'{base_url}/recipes?select=*', headers=headers)
with urllib.request.urlopen(req) as resp:
    recipes = json.loads(resp.read().decode('utf-8'))

for r in recipes:
    data = r.get('data') or {}
    print(f"Recipe ID: {r.get('id')} | Name: {r.get('recipe_name')} | Status: {r.get('status')} | MenuItem: {r.get('menu_item_id') or data.get('menuItemId')} | Code: {data.get('menuItemCode')}")
    ings = data.get('ingredients') or []
    print(f"  Ingredients count: {len(ings)}")
    for i in ings:
        print(f"    - {i.get('inventoryItemCode')} ({i.get('inventoryItemName')}): {i.get('quantity')} {i.get('uom')} (recipeQty: {i.get('recipeQty')} {i.get('recipeUom')})")
