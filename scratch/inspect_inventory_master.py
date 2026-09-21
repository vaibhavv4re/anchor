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

inv = api_get('inventory?select=*&order=item_code')
print(f"Total master inventory rows: {len(inv)}")

# Group by category / prefix
bar_items = []
rm_items = []
other_items = []

for item in inv:
    code = item.get('item_code') or ''
    name = item.get('item_name') or ''
    uom = item.get('base_uom') or ''
    cat = item.get('category') or ''
    val = item.get('unit_valuation') or 0
    
    if code.startswith('BAR'):
        bar_items.append((code, name, uom, cat, val))
    elif code.startswith('RM'):
        rm_items.append((code, name, uom, cat, val))
    else:
        other_items.append((code, name, uom, cat, val))

print(f"\n--- BAR ITEMS ({len(bar_items)}) ---")
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

for b in bar_items:
    print(f"  {b[0]:<10} | {b[1]:<32} | {b[2]:<6} | {b[3]:<20} | INR {b[4]}")

print(f"\n--- RELEVANT RAW MATERIALS (Fruits, Herbs, Sugars, Beverages, Syrups, Spices) ---")
keywords = ['lemon', 'lime', 'mint', 'ginger', 'sugar', 'soda', 'syrup', 'juice', 'water', 'salt', 'pepper', 'chilli', 'feni', 'mango', 'guava', 'watermelon', 'basil', 'vinegar', 'honey', 'spice']
for r in rm_items:
    name_lower = r[1].lower()
    if any(k in name_lower for k in keywords):
        print(f"  {r[0]:<10} | {r[1]:<32} | {r[2]:<6} | {r[3]:<20} | ₹{r[4]}")
