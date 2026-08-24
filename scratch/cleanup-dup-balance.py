import urllib.request
import json

base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'

headers = {
    'apikey': anon_key,
    'Authorization': f'Bearer {anon_key}',
    'Content-Type': 'application/json'
}

# Delete sb-SF0008-kit
req = urllib.request.Request(f'{base_url}/stock_balances?id=eq.sb-SF0008-kit', headers=headers, method='DELETE')
try:
    with urllib.request.urlopen(req) as resp:
        print("Deleted sb-SF0008-kit successfully")
except Exception as e:
    print(f"Error deleting sb-SF0008-kit: {e}")

# Check remaining balances
req = urllib.request.Request(f'{base_url}/stock_balances?select=*', headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print(f"Remaining stock balances ({len(data)}):")
    for b in data:
        print(f"  - {b.get('id')}: {b.get('item_code')} @ {b.get('location_code')} = {b.get('quantity')}")
