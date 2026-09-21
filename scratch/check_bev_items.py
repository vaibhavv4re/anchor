import urllib.request, json

url_base = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
}

req = urllib.request.Request(f'{url_base}/inventory?category_code=in.(CAT-BEV-ALC,CAT-BEV-SOFT)&select=item_code,item_name,category_code,base_uom,unit_valuation,opening_stock', headers=headers)
with urllib.request.urlopen(req) as resp:
    items = json.loads(resp.read().decode('utf-8'))

print(f"Beverage items in inventory ({len(items)}):")
for it in items:
    print(f"  [{it.get('item_code')}] {it.get('item_name')} ({it.get('category_code')}) - UOM: {it.get('base_uom')} - Val: {it.get('unit_valuation')}")
