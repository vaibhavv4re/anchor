import urllib.request
import json

SUPABASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

HEADERS = {
    'apikey': ANON_KEY,
    'Authorization': f'Bearer {ANON_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def get(path):
    req = urllib.request.Request(f"{SUPABASE_URL}/{path}", headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def main():
    print("=== LIVE STOCK BALANCES ===")
    balances = get("stock_balances?select=*")
    print(f"Total rows: {len(balances)}")
    for b in balances:
        print(f"  {b.get('item_code')} @ {b.get('location_code')}: qty={b.get('quantity')}, val={b.get('valuation')}, id={b.get('id')}")

    print("\n=== STORAGE LOCATIONS ===")
    locs = get("storage_locations?select=*")
    for l in locs:
        print(f"  {l.get('code') or l.get('location_code')}: {l.get('name')} (id: {l.get('id')})")

    print("\n=== RECENT STOCK TRANSFERS ===")
    trfs = get("stock_transfers?order=created_at.desc&limit=5")
    print(f"Total rows: {len(trfs)}")
    for t in trfs:
        print(f"  Transfer: {t.get('transfer_number')} | {t.get('from_location_code')} -> {t.get('to_location_code')} | status: {t.get('status')} | lines: {len(t.get('data', {}).get('lines', []))}")

    print("\n=== RECENT STOCK TRANSACTIONS (TRANSFERS) ===")
    txns = get("stock_transactions?transaction_type=in.(TRANSFER_IN,TRANSFER_OUT)&order=occurred_at.desc&limit=6")
    print(f"Total rows: {len(txns)}")
    for tx in txns:
        print(f"  Txn: {tx.get('id')} | type: {tx.get('transaction_type')} | item: {tx.get('item_code')} | loc: {tx.get('location_code')} | qty: {tx.get('quantity')} | ref: {tx.get('reference_id')}")

if __name__ == '__main__':
    main()
