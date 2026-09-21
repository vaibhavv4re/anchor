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

items = api_get("inventory?item_code=like.BAR%25&order=item_code.asc&limit=10")
print("Top 10 Bar SKUs in inventory:")
for item in items:
    print(f"  {item.get('item_code')} | {item.get('item_name')} | {item.get('base_uom')} | cost_price={item.get('cost_price')} | unit_valuation={item.get('unit_valuation')}")

bals = api_get("stock_balances?location_code=eq.LOC-314")
print("\nCurrent stock_balances at LOC-314:")
for b in bals:
    print(f"  {b.get('item_code')} | Qty: {b.get('quantity')} | Val: {b.get('valuation')}")
