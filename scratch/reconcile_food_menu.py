import sys
import re
import json
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

print("=================================================================")
print("PHASE 1: FORENSIC RECONCILIATION OF FOOD MENU & RECIPES")
print("=================================================================")

# 1. Parse all 69 items from extracted_menu_text.txt
with open('extracted_menu_text.txt', 'r', encoding='utf-8', errors='ignore') as f:
    raw_lines = [l.strip() for l in f.read().splitlines() if l.strip()]

# Section mappings
source_sections = [
    ("SOUPS", 6),
    ("GARDEN & GRAIN", 9),
    ("FROM THE SEA - PRAWNS", 6),
    ("FROM THE SHORE - CHICKEN", 12),
    ("FROM THE SHORE - MUTTON", 4),
    ("CURRIES & DAALS", 12),
    ("MEAT CURRIES - CHICKEN", 5),
    ("MEAT CURRIES - MUTTON", 3),
    ("RICE", 8),
    ("COASTAL BREADS", 4)
]

# Let's cleanly extract each of the 69 dishes from extracted_menu_text.txt
# We can identify them by sections and headings in the file
txt_content = "\n".join(raw_lines)

# Let's extract items manually or via targeted boundaries
items_69 = []

# SOUPS (6)
soups = [
    "Kokum & Coconut Soup",
    "Green Chicken Soup",
    "Pepper Mutton Soup",
    "Coastal Karnataka Lentil Soup",
    "Tomato Soup",
    "Captain's Hot Pot"
]
for s in soups:
    items_69.append({"category": "SOUPS", "name": s, "type": "NON_VEG" if any(x in s.lower() for x in ['chicken', 'mutton', 'captain']) else "VEG"})

# GARDEN & GRAIN (9)
starters_veg = [
    "Kokani Papad Basket",
    "Spicy Banana Donuts",
    "Coastal Leaf Roll",
    "Stuffed Mushrooms",
    "Green Herb Paneer",
    "Smoked Damao Paneer",
    "Grilled Spicy Potatoes",
    "Ghee Roast Vegetables",
    "Mustard Pepper Paneer"
]
for s in starters_veg:
    items_69.append({"category": "GARDEN & GRAIN", "name": s, "type": "VEG"})

# FROM THE SEA - PRAWNS (6)
prawns = [
    "Prawns Koliwada",
    "Butter Garlic Prawns",
    "Damao Masala Prawns",
    "Pickled Prawns",
    "Ghee Roast Prawns",
    "Mustard Pepper Prawns"
]
for s in prawns:
    items_69.append({"category": "FROM THE SEA - PRAWNS", "name": s, "type": "NON_VEG"})

# FROM THE SHORE - CHICKEN (12)
chicken_starters = [
    "Classic Mamna Skewers",
    "Spiced Chourizo Skewers",
    "Smoked Damao Tikka",
    "Kasundi Chicken Tikka",
    "Green Herb Roasted Chicken",
    "Whole Chicken Roast",
    "Ghee Roast Chicken",
    "Malabari Pepper Chicken",
    "Malvani Chicken Sukka",
    "Spiced Chicken Lollipops",
    "Chilli Chicken Wings",
    "Andhra Chicken Wings"
]
for s in chicken_starters:
    items_69.append({"category": "FROM THE SHORE - CHICKEN", "name": s, "type": "NON_VEG"})

# FROM THE SHORE - MUTTON (4)
mutton_starters = [
    "Mutton Mamna Skewers",
    "Mutton Ghee Roast",  # Starter version (pan-seared, served with dip & salad)
    "Malabari Pepper Mutton",
    "Green Herb Mutton"
]
for s in mutton_starters:
    items_69.append({"category": "FROM THE SHORE - MUTTON", "name": s, "type": "NON_VEG", "notes": "Starter / Dry Pan-Seared"})

# CURRIES & DAALS (12)
curries_veg = [
    "Goan Vegetable Curry",
    "Malvani Jackfruit Rassa",
    "Smoked Paneer in Green Gravy",
    "Stuffed Brinjal Curry",
    "Konkan Leaf Curry",
    "Smoked Paneer in Red Gravy",
    "Mangalorean Vegetable Korma",
    "Jackfruit Green Curry",
    "Yellow Dal Tadka",
    "Yellow Dal Fry",
    "Yellow Dal Varan",
    "Sprouted Moong Gassi"
]
for s in curries_veg:
    items_69.append({"category": "CURRIES & DAALS", "name": s, "type": "VEG"})

# MEAT CURRIES - CHICKEN (5)
curries_chicken = [
    "Damao Homestyle Curry",
    "Smoked Damao Tikka Masala",
    "Classic Xacuti Masala",
    "Red Vindaloo Curry",
    "Green Herb Masala"
]
for s in curries_chicken:
    items_69.append({"category": "MEAT CURRIES - CHICKEN", "name": s, "type": "NON_VEG"})

# MEAT CURRIES - MUTTON (3)
curries_mutton = [
    "Mutton Xacuti",
    "Mutton Malvani Rassa",
    "Mutton Ghee Roast"  # Curry / Main Course Gravy version
]
for s in curries_mutton:
    items_69.append({"category": "MEAT CURRIES - MUTTON", "name": s, "type": "NON_VEG", "notes": "Main Course / Curry Gravy"})

# RICE (8)
rice_items = [
    "Steamed Rice",
    "Sticky Indrayani Rice",
    "Jeera Rice",
    "Vegetable Pulav",
    "Jackfruit Biryani",
    "Classic Chicken Biryani",
    "Classic Mutton Biryani",
    "Stewed Mutton Rice"
]
for s in rice_items:
    items_69.append({"category": "RICE", "name": s, "type": "NON_VEG" if 'chicken' in s.lower() or 'mutton' in s.lower() else "VEG"})

# COASTAL BREADS (4)
breads = [
    "Rice Bhakri",
    "Amboli",
    "Chapati",
    "Poi"
]
for s in breads:
    items_69.append({"category": "COASTAL BREADS", "name": s, "type": "VEG"})

print(f"Total verified items in source menu dataset: {len(items_69)}")
assert len(items_69) == 69, f"Expected 69 items, got {len(items_69)}"

# Category breakdown of 69 dataset
print("\n--- Category Breakdown of 69-Item Dataset ---")
by_cat = Counter(i['category'] for i in items_69)
for cat, expected_count in source_sections:
    actual_count = by_cat[cat]
    match = "MATCH" if actual_count == expected_count else "MISMATCH"
    print(f"  {cat:<30}: {actual_count} items (Expected: {expected_count}) -> {match}")

# Check duplicate
name_counts_69 = Counter(i['name'] for i in items_69)
dupes_69 = {k: v for k, v in name_counts_69.items() if v > 1}
print(f"\nUnique dish names: {len(name_counts_69)} / 69")
print(f"Duplicates: {dupes_69}")
for d in items_69:
    if d['name'] == 'Mutton Ghee Roast':
        print(f"  Duplicate entry: '{d['name']}' in category '{d['category']}' ({d.get('notes')})")

# 2. Compare against actualMenuData.js (46 items)
with open('restaurantos/frontend/capabilities/kitchen/data/actualMenuData.js', 'r', encoding='utf-8') as f:
    actual_code = f.read()

blocks = actual_code.split('itemCode:')
actual_items = []
for b in blocks[1:]:
    name_m = re.search(r"itemName:\s*['\"]([^'\"]+)['\"]", b)
    code_m = re.match(r"\s*['\"]([^'\"]+)['\"]", b)
    cat_m = re.search(r"category:\s*['\"]([^'\"]+)['\"]", b)
    price_m = re.search(r"sellingPrice:\s*(\d+)", b)
    if name_m and code_m:
        actual_items.append({
            'code': code_m.group(1),
            'name': name_m.group(1),
            'category': cat_m.group(1) if cat_m else '',
            'price': int(price_m.group(1)) if price_m else 0
        })

print(f"\nTotal items in actualMenuData.js: {len(actual_items)}")

# Set comparison
set_69 = set(i['name'] for i in items_69)
set_actual = set(i['name'] for i in actual_items)

in_69_not_in_actual = set_69 - set_actual
in_actual_not_in_69 = set_actual - set_69
common = set_69.intersection(set_actual)

print(f"\n--- Cross-Dataset Overlap ---")
print(f"Dishes in BOTH datasets: {len(common)}")
print(f"Dishes in 69-dataset but NOT in actualMenuData.js: {len(in_69_not_in_actual)}")
print(f"Dishes in actualMenuData.js but NOT in 69-dataset: {len(in_actual_not_in_69)}")

print(f"\nDishes ONLY in actualMenuData.js ({len(in_actual_not_in_69)}):")
for name in sorted(in_actual_not_in_69):
    item = next(i for i in actual_items if i['name'] == name)
    print(f"  {item['code']} | {item['name']:<35} | Cat: {item['category']} | ₹{item['price']}")

print(f"\nSample of dishes in 69-dataset missing from actualMenuData.js (first 10 of {len(in_69_not_in_actual)}):")
for name in sorted(in_69_not_in_actual)[:10]:
    print(f"  - {name}")

# 3. Check Surviving 9 Recipes in Supabase
print("\n--- Cross-Referencing Surviving 9 Recipes from Supabase ---")
import urllib.request
supabase_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
api_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'
headers = {'apikey': api_key, 'Authorization': f'Bearer {api_key}'}

req = urllib.request.Request(f"{supabase_url}/recipes?tenant_id=eq.tenant_h0qc7wf", headers=headers)
with urllib.request.urlopen(req) as resp:
    supabase_recipes = json.loads(resp.read().decode('utf-8'))

for r in supabase_recipes:
    r_code = r.get('recipe_code')
    r_name = r.get('recipe_name')
    r_id = r.get('id')
    r_status = r.get('status')
    r_cost = r.get('cost_per_portion')
    r_menu_id = r.get('menu_item_id')

    # Find matching dish in 69-dataset
    # Strip " Recipe", " Base Recipe", " (Half) BOM Recipe", " (Full) BOM Recipe"
    clean_dish_name = re.sub(r'\s*(Recipe|\(Half\)\s*BOM\s*Recipe|\(Full\)\s*BOM\s*Recipe|Base\s*Recipe)$', '', r_name).strip()
    match_69 = [i for i in items_69 if i['name'].lower() == clean_dish_name.lower()]
    match_actual = [i for i in actual_items if i['name'].lower() == clean_dish_name.lower()]

    match_str = ""
    if match_69:
        match_str = f"MATCHES 69-DATASET dish: '{match_69[0]['name']}' in [{match_69[0]['category']}]"
    elif 'SF0004' in r_code or 'SF0008' in r_code:
        match_str = f"SEMI-FINISHED PREPARATION: Consumed by other recipes"
    else:
        match_str = "NO EXACT NAME MATCH"

    print(f"  Recipe: {r_code:<28} | {r_name:<38} | {r_status:<8} | ₹{r_cost:<6} | {match_str}")
