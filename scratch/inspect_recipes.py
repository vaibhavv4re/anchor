import urllib.request
import json

BASE_URL = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'
HEADERS = {
    'apikey': ANON_KEY,
    'Authorization': f'Bearer {ANON_KEY}',
    'Content-Type': 'application/json'
}

def api_get(endpoint):
    url = f"{BASE_URL}/{endpoint}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

recipes = api_get('recipes?select=*')
print(f"Total recipes: {len(recipes)}")
for r in recipes:
    print(f"ID: {r.get('id')} | Name: {r.get('recipe_name')} | ItemId: {r.get('menu_item_id')} | Status: {r.get('status')}")

# Also check recipe_ingredients
try:
    ri = api_get('recipe_ingredients?select=*')
    print(f"\nTotal recipe_ingredients lines: {len(ri)}")
    for line in ri[:5]:
        print(f"  Line: {line.get('id')} | Recipe: {line.get('recipe_id')} | ItemCode: {line.get('inventory_item_code')} | Qty: {line.get('quantity')}")
except Exception as e:
    print(f"recipe_ingredients check error: {e}")
