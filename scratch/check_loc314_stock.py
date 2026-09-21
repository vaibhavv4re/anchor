import urllib.request
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'
HEADERS = {'apikey': ANON_KEY, 'Authorization': f'Bearer {ANON_KEY}'}

req = urllib.request.Request(f'{BASE_URL}/stock_balances?location_code=eq.LOC-314&select=*', headers=HEADERS)
with urllib.request.urlopen(req) as resp:
    balances = json.loads(resp.read().decode('utf-8'))

print(f"Total balances at LOC-314: {len(balances)}")
for b in balances:
    print(f"Item: {b.get('item_code')} | Current: {b.get('current_balance')} | Available: {b.get('available_quantity')} | Total Val: INR {b.get('total_valuation')}")
