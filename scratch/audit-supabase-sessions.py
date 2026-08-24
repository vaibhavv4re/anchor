import urllib.request
import json

base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'

headers = {
    'apikey': anon_key,
    'Authorization': f'Bearer {anon_key}',
    'Content-Type': 'application/json'
}

tables = [
    'tenants', 'identities', 'employees', 'dining_areas', 'tables_master',
    'kitchen_menu_items', 'recipes', 'orders', 'offline_journal', 'table_sessions', 'sessions'
]

print("=== SUPABASE LIVE SCHEMA & PERSISTENCE AUDIT ===")
for t in tables:
    try:
        req = urllib.request.Request(f'{base_url}/{t}?select=*&limit=3', headers=headers)
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"[FOUND] Table '{t}': HTTP {resp.status} - {len(data)} sample records")
            if len(data) > 0 and t == 'orders':
                print(f"   Sample order keys: {list(data[0].keys())}")
                if 'data' in data[0] and isinstance(data[0]['data'], dict):
                    print(f"   Sample order.data keys: {list(data[0]['data'].keys())}")
    except urllib.error.HTTPError as e:
        print(f"[HTTP {e.code}] Table '{t}': {e.reason}")
    except Exception as e:
        print(f"[ERROR] Table '{t}': {e}")
