import urllib.request
import json

BASE_URL = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'
HEADERS = {
    'apikey': ANON_KEY,
    'Authorization': f'Bearer {ANON_KEY}',
    'Content-Type': 'application/json'
}

def api_get(endpoint):
    url = f"{BASE_URL}/{endpoint}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

# The 14 target item codes: RC-BAR-147 to RC-BAR-160
cocktail_codes = [f"RC-BAR-{i}" for i in range(147, 161)]
items = api_get('kitchen_menu_items?select=*&order=item_code')
bar_items = [it for it in items if it.get('item_code') in cocktail_codes]

print(f"Found {len(bar_items)} items:")
for it in bar_items:
    print(f"Code: {it.get('item_code')} | Name: {it.get('item_name')} | Cat: {it.get('category')} | Price: {it.get('price')} | RecipeId: {it.get('recipe_id')} | Variants: {len(it.get('variants') or [])}")
    if it.get('variants'):
        for v in it.get('variants'):
            print(f"    Variant: {v.get('name')} | portion: {v.get('portion')} | price: {v.get('price')}")
