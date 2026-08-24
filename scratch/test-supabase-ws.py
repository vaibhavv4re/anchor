import urllib.request
import json
import ssl

base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'

print("Testing Supabase REST and checking orders table...")
headers = {
    'apikey': anon_key,
    'Authorization': f'Bearer {anon_key}',
    'Content-Type': 'application/json'
}

req = urllib.request.Request(f'{base_url}/orders?select=*', headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print(f"Total orders in Supabase: {len(data)}")
    if data:
        last_order = data[-1]
        print(f"Last order ID: {last_order.get('id')} | Number: {last_order.get('order_number')}")
        tickets = last_order.get('data', {}).get('tickets', [])
        print(f"Tickets in last order: {len(tickets)}")
        for t in tickets:
            print(f"  Ticket {t.get('ticketId')}: status={t.get('status')} | items={len(t.get('items', []))}")
