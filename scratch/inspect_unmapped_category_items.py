import urllib.request
import json

url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1/inventory?tenant_id=eq.tenant_h0qc7wf&select=item_code,item_name,category_code,data'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'
}
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as resp:
    items = json.loads(resp.read().decode('utf-8'))

legacy_cats = [
    'CAT-MEAT', 'CAT-SEAFOOD', 'CAT-PRODUCE', 'CAT-GRAIN', 'CAT-OIL',
    'CAT-SPICE', 'CAT-PREP', 'CAT-PKG', 'CAT-CONS', 'CAT-DAIRY',
    'CAT-BROTH', 'CAT-DIPS', 'CAT-SALADS', 'CAT-PULSES'
]

print("=== DETAILED BREAKDOWN OF ALL ITEMS IN UNMAPPED CATEGORIES ===")
for cat in legacy_cats:
    matched = [it for it in items if it.get('category_code') == cat]
    print(f"\n--- {cat} ({len(matched)} items) ---")
    for it in matched:
        code = it.get('item_code')
        name = it.get('item_name')
        d = it.get('data') or {}
        print(f"  {code:<8} | {name:<45} | data: cat={d.get('categoryCode')}, pf={d.get('productFamilyCode')}")
