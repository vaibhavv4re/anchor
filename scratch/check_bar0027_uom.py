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
    for code in ['BAR0027', 'BAR0050']:
        print(f"=== SKU {code} ===")
        items = get(f"inventory_items?item_code=eq.{code}")
        for it in items:
            print("Item master:", {
                "item_code": it.get("item_code"),
                "item_name": it.get("item_name") or it.get("name"),
                "uom": it.get("uom") or it.get("base_uom") or it.get("inventory_uom"),
                "base_uom": it.get("base_uom"),
                "data": it.get("data")
            })
        balances = get(f"stock_balances?item_code=eq.{code}&location_code=eq.LOC-314")
        for b in balances:
            print("Balance LOC-314:", {
                "item_code": b.get("item_code"),
                "location_code": b.get("location_code"),
                "quantity": b.get("quantity"),
                "uom": b.get("uom") or b.get("base_uom")
            })

if __name__ == '__main__':
    main()
