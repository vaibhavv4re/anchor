import urllib.request, json

base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Content-Type': 'application/json'
}

# 1. Fetch OpenAPI swagger / definition to see all exposed RPC functions
try:
    req = urllib.request.Request(f'{base_url}/', headers=headers)
    with urllib.request.urlopen(req) as resp:
        schema = json.loads(resp.read().decode('utf-8'))
        paths = list(schema.get('paths', {}).keys())
        rpc_paths = [p for p in paths if '/rpc/' in p]
        print(f"Total endpoints: {len(paths)}")
        print(f"RPC endpoints ({len(rpc_paths)}): {rpc_paths}")
except Exception as e:
    print(f"OpenAPI schema fetch error: {e}")
