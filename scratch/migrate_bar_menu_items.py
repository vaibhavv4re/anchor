import urllib.request, json

url_base = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

# 1. Fetch all items
req = urllib.request.Request(f"{url_base}/kitchen_menu_items?select=id,item_name,category,routing,tenant_id", headers=headers)
with urllib.request.urlopen(req) as resp:
    all_items = json.loads(resp.read().decode('utf-8'))

print(f"Total items in Supabase: {len(all_items)}")

bar_categories = {
    'BLENDED SCOTCH WHISKY', 'MILD BEER', 'COCKTAILS', 'MOCKTAILS', 
    'DOMESTIC WHISKY', 'VODKA', 'HOUSE WINES', 'PREMIUM WHISKY', 
    'STRONG BEER', 'BEVERAGE', 'BRANDY', 'GIN', 'RUM', 
    'SINGLE MALT SCOTCH WHISKY', 'TEQUILA', 'BREEZER', 'BEVERAGES', 'BAR', 'BEERS'
}

bar_items = [item for item in all_items if item.get('category') in bar_categories or not item.get('tenant_id')]
food_items = [item for item in all_items if item not in bar_items]

print(f"Found {len(bar_items)} bar items and {len(food_items)} food items.")

# 2. Update bar items: tenant_id = 'tenant_h0qc7wf', routing = 'BAR'
updated_count = 0
for b in bar_items:
    item_id = b['id']
    patch_data = json.dumps({
        'tenant_id': 'tenant_h0qc7wf',
        'routing': 'BAR'
    }).encode('utf-8')
    
    req_patch = urllib.request.Request(
        f"{url_base}/kitchen_menu_items?id=eq.{item_id}",
        data=patch_data,
        headers=headers,
        method='PATCH'
    )
    with urllib.request.urlopen(req_patch) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        updated_count += len(res)

print(f"Successfully updated {updated_count} bar items with tenant_id='tenant_h0qc7wf' and routing='BAR'.")

# 3. Verify final state
req_verify = urllib.request.Request(f"{url_base}/kitchen_menu_items?select=id,item_name,category,routing,tenant_id", headers=headers)
with urllib.request.urlopen(req_verify) as resp:
    verified_items = json.loads(resp.read().decode('utf-8'))

bar_final = [i for i in verified_items if i.get('routing') == 'BAR']
kitchen_final = [i for i in verified_items if i.get('routing') != 'BAR']
missing_tenant = [i for i in verified_items if i.get('tenant_id') != 'tenant_h0qc7wf']

print(f"\nVerification Results:")
print(f"Total items: {len(verified_items)}")
print(f"Bar items (routing=BAR): {len(bar_final)}")
print(f"Kitchen items (routing!=BAR): {len(kitchen_final)}")
print(f"Items with non-canonical tenant: {len(missing_tenant)}")
assert len(bar_final) == 64, f"Expected 64 bar items, got {len(bar_final)}"
assert len(kitchen_final) == 69, f"Expected 69 kitchen items, got {len(kitchen_final)}"
assert len(missing_tenant) == 0, f"Expected 0 missing tenant items, got {len(missing_tenant)}"
print("✅ Supabase Menu Data Layer updated and verified successfully!")
