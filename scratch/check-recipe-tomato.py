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
for r in recipes:
    if 'Tomato' in (r.get('recipe_name') or '') or r.get('id') in ['rcp-ajgdpxm', 'rcp-abhtz2p']:
        print("=== RECIPE FOUND ===")
        print(f"ID: {r.get('id')} | Name: {r.get('recipe_name')} | Status: {r.get('status')}")
        print("Full Recipe Data:", json.dumps(r, indent=2))

print("\n=== RECIPE_INGREDIENTS TABLE ===")
ings = fetch_table('recipe_ingredients')
for i in ings:
    if i.get('recipe_id') in ['rcp-ajgdpxm', 'rcp-abhtz2p'] or 'Tomato' in str(i):
        print(f"Ing: {json.dumps(i, indent=2)}")
