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
    print("=== INSPECTING ORDER ORD-2026-8595 ===")
    try:
        orders = get("orders?order_number=eq.ORD-2026-8595")
        if not orders:
            orders = get("orders?id=eq.ORD-2026-8595")
        print(f"Found {len(orders)} order(s)")
        for o in orders:
            print("Order header:", {
                "id": o.get("id"),
                "order_number": o.get("order_number"),
                "status": o.get("status"),
                "table_number": o.get("table_number"),
                "created_at": o.get("created_at")
            })
            data = o.get("data") or {}
            items = o.get("items") or data.get("items") or []
            print(f"Items count: {len(items)}")
            for it in items:
                print("Item:", json.dumps(it, indent=2))
            tickets = o.get("tickets") or data.get("tickets") or []
            print(f"Tickets count: {len(tickets)}")
            for t in tickets:
                print("Ticket summary:", {
                    "ticketId": t.get("ticketId") or t.get("id"),
                    "ticketType": t.get("ticketType"),
                    "destination": t.get("destination"),
                    "stationName": t.get("stationName"),
                    "status": t.get("status")
                })
                for ti in t.get("items") or []:
                    print("  Ticket item:", json.dumps(ti, indent=2))
    except Exception as e:
        print("Error fetching order:", e)

    print("\n=== INSPECTING RECIPE rcp-kcwoqo3 ===")
    try:
        recipes = get("recipes?id=eq.rcp-kcwoqo3")
        if not recipes:
            recipes = get("recipes?recipe_code=eq.RCP-1427")
        print(f"Found {len(recipes)} recipe(s)")
        for r in recipes:
            print("Recipe:", {
                "id": r.get("id"),
                "recipe_code": r.get("recipe_code"),
                "recipe_name": r.get("recipe_name") or r.get("name"),
                "status": r.get("status"),
                "menu_item_id": r.get("menu_item_id"),
                "menu_item_code": r.get("menu_item_code"),
                "category": r.get("category"),
                "production_area": r.get("production_area")
            })
            data = r.get("data") or {}
            print("Data payload keys:", list(data.keys()))
            print("Ingredients in root:", r.get("ingredients"))
            print("Ingredients in data:", data.get("ingredients"))
    except Exception as e:
        print("Error fetching recipe:", e)

    print("\n=== INSPECTING MENU ITEM RC-BAR-154 ===")
    try:
        items = get("kitchen_menu_items?item_code=eq.RC-BAR-154")
        if not items:
            items = get("kitchen_menu_items?id=eq.RC-BAR-154")
        print(f"Found {len(items)} menu item(s)")
        for mi in items:
            print("Menu item:", {
                "id": mi.get("id"),
                "item_code": mi.get("item_code"),
                "name": mi.get("name") or mi.get("item_name"),
                "category": mi.get("category"),
                "recipe_id": mi.get("recipe_id"),
                "production_area": mi.get("production_area"),
                "routing": mi.get("routing")
            })
            print("Variants:", (mi.get("data") or {}).get("variants") or mi.get("variants"))
    except Exception as e:
        print("Error fetching menu item:", e)

if __name__ == '__main__':
    main()
