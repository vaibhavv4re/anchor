import json
import urllib.request

def cleanup_stale_supabase_sessions():
    base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
    headers = {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

    print("--- FETCHING STALE SESSIONS FROM SUPABASE ---")
    req = urllib.request.Request(f"{base_url}/table_sessions?select=*", headers=headers)
    with urllib.request.urlopen(req) as resp:
        sessions = json.loads(resp.read().decode('utf-8'))

    print(f"Found {len(sessions)} total sessions in Supabase table_sessions.")

    stale_count = 0
    for s in sessions:
        if s.get('status') != 'CLOSED':
            s_id = s.get('id')
            print(f"Closing stale session: {s_id} (Table {s.get('table_number')})")
            patch_url = f"{base_url}/table_sessions?id=eq.{s_id}"
            patch_data = json.dumps({'status': 'CLOSED', 'bill_status': 'PAID'}).encode('utf-8')
            patch_req = urllib.request.Request(patch_url, data=patch_data, headers=headers, method='PATCH')
            try:
                with urllib.request.urlopen(patch_req) as patch_resp:
                    stale_count += 1
            except Exception as e:
                print(f"Failed to close session {s_id}: {e}")

    print(f"\n[SUCCESS] Closed {stale_count} stale test sessions in Supabase!")

if __name__ == "__main__":
    cleanup_stale_supabase_sessions()
