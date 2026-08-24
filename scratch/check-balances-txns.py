import urllib.request
import json

base_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'

headers = {
    'apikey': anon_key,
    'Authorization': f'Bearer {anon_key}',
    'Content-Type': 'application/json'
}

def fetch_table(table):
    req = urllib.request.Request(f'{base_url}/{table}?select=*', headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return []

print("=== STOCK BALANCES ===")
balances = fetch_table('stock_balances')
for b in balances:
    data = b.get('data') or {}
    print(f"ID: {b.get('id')} | Item: {b.get('item_code') or data.get('itemCode')} | Loc: {b.get('location_code') or data.get('locationCode')} | Qty: {b.get('quantity') or data.get('quantity')} | Name: {data.get('itemName') or data.get('inventoryItemName')}")

print("\n=== STOCK TRANSACTIONS ===")
txns = fetch_table('stock_transactions')
for t in txns[-10:]:
    data = t.get('data') or {}
    print(f"Txn: {t.get('id')} | Type: {t.get('transaction_type') or data.get('transactionType')} | Item: {t.get('item_code') or data.get('itemCode')} | Qty: {t.get('quantity') or data.get('quantity')} | Ref: {t.get('reference_no') or data.get('referenceNo')}")
