import json
import urllib.request

def cleanup_stale_supabase_orders():
    base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
    headers = {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

    print("--- FETCHING ORDERS FROM SUPABASE ---")
    req = urllib.request.Request(f"{base_url}/orders?select=*", headers=headers)
    with urllib.request.urlopen(req) as resp:
        orders = json.loads(resp.read().decode('utf-8'))

    print(f"Found {len(orders)} total orders in Supabase orders table.")

    closed_count = 0
    for o in orders:
        o_id = o.get('id')
        if o.get('status') != 'CLOSED':
            print(f"Closing stale test order: {o_id} for Table {o.get('table_number') or o.get('table_code')}")
            patch_url = f"{base_url}/orders?id=eq.{o_id}"
            patch_data = json.dumps({'status': 'CLOSED'}).encode('utf-8')
            patch_req = urllib.request.Request(patch_url, data=patch_data, headers=headers, method='PATCH')
            try:
                with urllib.request.urlopen(patch_req) as patch_resp:
                    closed_count += 1
            except Exception as e:
                print(f"Failed to close order {o_id}: {e}")

    print(f"\n[SUCCESS] Closed {closed_count} stale test orders in Supabase!")

if __name__ == "__main__":
    cleanup_stale_supabase_sessions() if False else cleanup_stale_supabase_orders()
