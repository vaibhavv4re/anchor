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

print("=== INVENTORY MASTER ITEMS ===")
inv = fetch_table('inventory')
print(f"Total inventory items: {len(inv)}")
for item in inv[:15]:
    print(f"  Item: {item.get('item_name')} | Code: {item.get('item_code')} | UOM: {item.get('base_uom')} | Opening Stock: {item.get('opening_stock')}")

print("\n=== RECIPES DETAIL ===")
recipes = fetch_table('recipes')
for r in recipes:
    print(f"\nRecipe ID: {r.get('id')} | Name: {r.get('recipe_name')} | Status: {r.get('status')} | Yield: {r.get('yield_qty')} {r.get('yield_uom')}")
    data = r.get('data') or {}
    print("  Full data:", json.dumps(data, indent=2))
