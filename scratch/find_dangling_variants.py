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

dangling_items = []
for m in bar_menu:
    variants = m.get('data', {}).get('variants') or []
    has_pegs = any(v.get('servingUnit') == 'ML' for v in variants)
    has_regular_zero = any(v.get('name') == 'Regular' and (v.get('sellingPrice') == 0 or v.get('selling_price') == 0) for v in variants)
    
    if has_pegs and has_regular_zero:
        dangling_items.append((m['item_code'], m['item_name'], m['category'], len(variants)))

print(f"Found {len(dangling_items)} items with dangling Regular 1 PORTION @ ₹0 alongside pegs:")
for it in dangling_items:
    print(f"  {it[0]}: {it[1]} ({it[2]}) — Total variants: {it[3]}")
