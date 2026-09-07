import urllib.request, json

url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1/kitchen_menu_items?select=id,item_name,category,routing,tenant_id'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'
}
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))

print(f"Total items in kitchen_menu_items: {len(data)}")
tenant_h0 = [d for d in data if d.get('tenant_id') == 'tenant_h0qc7wf']
blank_tenant = [d for d in data if not d.get('tenant_id')]

print(f"Tenant tenant_h0qc7wf items count: {len(tenant_h0)}")
print(f"Blank tenant items count: {len(blank_tenant)}")

print("\nBlank tenant categories:")
from collections import Counter
print(Counter(d.get('category') for d in blank_tenant))

print("\nTenant tenant_h0qc7wf categories:")
print(Counter(d.get('category') for d in tenant_h0))

print("\nSample 3 blank tenant items:")
for d in blank_tenant[:3]:
    print(d)

print("\nSample 3 tenant_h0qc7wf items:")
for d in tenant_h0[:3]:
    print(d)
