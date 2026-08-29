import json
import urllib.request

def cleanup_stale_runtime_states():
    base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
    headers = {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

    print("--- FETCHING RUNTIME STATES FROM SUPABASE ---")
    try:
        req = urllib.request.Request(f"{base_url}/table_runtime_states?select=*", headers=headers)
        with urllib.request.urlopen(req) as resp:
            states = json.loads(resp.read().decode('utf-8'))
            print(f"Found {len(states)} table_runtime_states records.")
            for st in states:
                s_id = st.get('id')
                del_req = urllib.request.Request(f"{base_url}/table_runtime_states?id=eq.{s_id}", headers=headers, method='DELETE')
                urllib.request.urlopen(del_req)
            print("Cleared all old table_runtime_states from Supabase.")
    except Exception as e:
        print(f"Table runtime states info: {e}")

if __name__ == "__main__":
    cleanup_stale_runtime_states()
