import json
import urllib.request

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

def fetch_table(table_name):
    url = f"{BASE_URL}/{table_name}?select=*"
    req = urllib.request.Request(url, headers={
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}"
    })
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"\n--- Supabase Table '{table_name}' (Total Rows: {len(data)}) ---")
            for row in data:
                created = row.get('created_at') or row.get('inserted_at') or row.get('issuedAt') or row.get('createdAt') or 'N/A'
                print(f"  ID: {row.get('id')}, Tenant: {row.get('tenant_id') or row.get('tenantId')}, Created: {created}")
                if 'data' in row and row['data']:
                    print(f"    Payload keys: {list(row['data'].keys())}")
    except Exception as e:
        print(f"Error fetching {table_name}: {e}")

if __name__ == "__main__":
    fetch_table("invoices")
    fetch_table("payments")
    fetch_table("bill_revisions")
    fetch_table("table_sessions")
    fetch_table("orders")
