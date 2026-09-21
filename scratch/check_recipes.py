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

recipes = api_get("recipes?select=*&limit=100")
print(f"Total recipes: {len(recipes)}")
for r in recipes:
    print(f"ID: {r.get('id')} | Name: {r.get('recipe_name') or r.get('name')} | Type: {r.get('recipe_type')} | Code: {r.get('recipe_code')} | Target: {r.get('target_menu_item_code')}")
    items = r.get('items') or r.get('ingredients') or r.get('data', {}).get('ingredients') or []
    print(f"  Ingredients ({len(items)}):")
    for ing in items:
        print(f"    - {ing.get('itemCode') or ing.get('item_code')}: {ing.get('quantity')} {ing.get('uom')}")
