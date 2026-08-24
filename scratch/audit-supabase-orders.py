import urllib.request
import json

base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'

headers = {
    'apikey': anon_key,
    'Authorization': f'Bearer {anon_key}',
    'Content-Type': 'application/json'
}

print("=== AUDITING SUPABASE ORDERS FOR SESSION HYDRATION ===")
req = urllib.request.Request(f'{base_url}/orders?select=*', headers=headers)
with urllib.request.urlopen(req) as resp:
    orders = json.loads(resp.read().decode('utf-8'))
    print(f"Total orders in Supabase: {len(orders)}")
    for idx, o in enumerate(orders):
        data = o.get('data') or {}
        session_id = data.get('sessionId') or o.get('session_id') or 'UNKNOWN'
        table_code = data.get('tableCode') or o.get('table_id') or 'UNKNOWN'
        table_num = data.get('tableNumber') or 'UNKNOWN'
        waiter = data.get('waiterId') or o.get('waiter_id') or 'UNKNOWN'
        tickets = data.get('tickets') or []
        print(f"Order #{idx+1}: {o.get('order_number')} | Status: {o.get('status')} | Table: {table_code} (Table #{table_num}) | Session: {session_id} | Waiter: {waiter} | Tickets: {len(tickets)}")
