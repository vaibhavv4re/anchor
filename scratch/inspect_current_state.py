import urllib.request
import json

SUPABASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
HEADERS = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEyNjQ3NDYsImV4cCI6MjA1Njg0MDc0Nn0.89u2a114fI1s5_yv_w9UgtG7feq8tV0e7vXkU-4kYvU',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEyNjQ3NDYsImV4cCI6MjA1Njg0MDc0Nn0.89u2a114fI1s5_yv_w9UgtG7feq8tV0e7vXkU-4kYvU',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def get(path):
    req = urllib.request.Request(f"{SUPABASE_URL}/{path}", headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def main():
    print("=== STOCK BALANCES FOR RM0310 ===")
    balances = get("stock_balances?item_code=eq.RM0310")
    for b in balances:
        d = b.get('data') or {}
        inner_d = d.get('data') if isinstance(d, dict) else {}
        print(f"ID: {b.get('id')} | Loc: {b.get('location_code')} | SQL Qty: {b.get('quantity')} | data.qty: {d.get('quantity') if isinstance(d, dict) else None} | inner_data.qty: {inner_d.get('quantity') if isinstance(inner_d, dict) else None}")

    print("\n=== STOCK OPERATIONS ===")
    ops = get("stock_operations?order=occurred_at.desc&limit=5")
    print(f"Count: {len(ops)}")
    for op in ops:
        print(f"Op: {op.get('operation_id')} | Type: {op.get('operation_type')} | Ref: {op.get('reference_number')} | At: {op.get('occurred_at')}")

    print("\n=== STOCK TRANSACTIONS ===")
    txns = get("stock_transactions?order=occurred_at.desc&limit=5")
    print(f"Count: {len(txns)}")
    for tx in txns:
        print(f"Tx: {tx.get('transaction_id')} | Item: {tx.get('item_code')} | Loc: {tx.get('location_code')} | Qty: {tx.get('quantity')} | At: {tx.get('occurred_at')}")

    print("\n=== RECENT ORDERS ===")
    orders = get("orders?order=created_at.desc&limit=3")
    for o in orders:
        print(f"Order: {o.get('order_number')} | ID: {o.get('id')} | Status: {o.get('status')} | Table: {o.get('table_code')} | Sess: {o.get('session_id')}")

if __name__ == '__main__':
    main()
