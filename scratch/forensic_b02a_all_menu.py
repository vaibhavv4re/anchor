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

bar_menu = api_get("kitchen_menu_items?routing=eq.BAR&order=item_code.asc&limit=100")
bar_inv = api_get("inventory?item_code=like.BAR%25&order=item_code.asc&limit=100")

print(f"Total Menu items: {len(bar_menu)}")
print(f"Total Inventory items: {len(bar_inv)}")

print("\n--- ALL 64 BAR MENU ITEMS ---")
for m in bar_menu:
    variants = m.get('data', {}).get('variants') or []
    var_strs = [f"{v.get('name')}:{v.get('servingSize')}{v.get('servingUnit')}(₹{v.get('sellingPrice')})" for v in variants]
    print(f"{m['item_code']:12} | {m['category']:25} | {m['item_name']:35} | {m.get('recipe_id') or 'NO-RECIPE':15} | Vars: {', '.join(var_strs)}")
