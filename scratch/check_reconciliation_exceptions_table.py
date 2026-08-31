import json
import urllib.request

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

def check_table(table_name):
    url = f"{BASE_URL}/{table_name}?select=*&limit=1"
    req = urllib.request.Request(url, headers={
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}"
    })
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"[OK] Table '{table_name}' EXISTS in Supabase Cloud.")
            return True
    except urllib.error.HTTPError as e:
        print(f"[NO] Table '{table_name}' HTTP {e.code}: {e.read().decode('utf-8')}")
        return False
    except Exception as e:
        print(f"Error checking {table_name}: {e}")
        return False

if __name__ == "__main__":
    check_table("reconciliation_exceptions")
    check_table("financial_periods")
