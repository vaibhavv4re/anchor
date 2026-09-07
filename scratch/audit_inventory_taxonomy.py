import urllib.request
import json
from collections import defaultdict

url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1/inventory?tenant_id=eq.tenant_h0qc7wf&select=item_code,item_name,category_code,data'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'
}
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as resp:
    items = json.loads(resp.read().decode('utf-8'))

cat_groups = defaultdict(list)
for it in items:
    cat_groups[it.get('category_code')].append(it)

print(f"Total inventory records: {len(items)}")
print(f"Total distinct categories in inventory: {len(cat_groups)}")
print("-" * 110)
print(f"{'Category Code':<20} | {'Count':<5} | {'Data Payload (catCode, catName, pfCode)':<40} | Samples")
print("-" * 110)

for cat, it_list in sorted(cat_groups.items(), key=lambda x: -len(x[1])):
    sample_names = [x['item_code'] + ' ' + x['item_name'] for x in it_list[:3]]
    first_data = it_list[0].get('data') or {}
    df_cat = str(first_data.get('categoryCode') or first_data.get('category_code'))
    df_name = str(first_data.get('categoryName') or first_data.get('category_name'))
    df_pf = str(first_data.get('productFamilyCode') or first_data.get('product_family_code'))
    data_summary = f"{df_cat}, '{df_name}', {df_pf}"
    print(f"{str(cat):<20} | {len(it_list):<5} | {data_summary:<40} | {', '.join(sample_names)}")
