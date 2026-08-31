import json
import urllib.request

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

def inspect_table(table_name):
    url = f"{BASE_URL}/{table_name}?select=*&limit=5"
    req = urllib.request.Request(url, headers={
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}"
    })
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"\n--- Supabase Table '{table_name}' ---")
            print(f"Row count returned: {len(data)}")
            if data:
                print(f"Columns: {list(data[0].keys())}")
                print(f"Sample row: {json.dumps(data[0], indent=2)}")
    except Exception as e:
        print(f"Error inspecting {table_name}: {e}")

if __name__ == "__main__":
    inspect_table("offline_journal")
    inspect_table("session_audit_logs")
    inspect_table("invoices")
    inspect_table("payments")
