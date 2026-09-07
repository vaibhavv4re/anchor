import sys
import re
import json
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

print("=================================================================")
print("MENU FORENSIC RECONCILIATION: actualMenuData.js vs 69-ROW DATASET")
print("=================================================================")

# 1. Parse actualMenuData.js
with open('restaurantos/frontend/capabilities/kitchen/data/actualMenuData.js', 'r', encoding='utf-8') as f:
    actual_code = f.read()

# Parse objects properly
blocks = actual_code.split('itemCode:')
actual_items = []
for b in blocks[1:]:
    code_m = re.match(r"\s*['\"]([^'\"]+)['\"]", b)
    name_m = re.search(r"itemName:\s*['\"]([^'\"]+)['\"]", b)
    cat_m = re.search(r"category:\s*['\"]([^'\"]+)['\"]", b)
    price_m = re.search(r"sellingPrice:\s*(\d+)", b)
    diet_m = re.search(r"dietaryType:\s*['\"]([^'\"]+)['\"]", b)
    desc_m = re.search(r"description:\s*['\"]([^'\"]+)['\"]", b)
    notes_m = re.search(r"recipeNotes:\s*['\"]([^'\"]+)['\"]", b)

    if code_m and name_m:
        actual_items.append({
            'code': code_m.group(1),
            'name': name_m.group(1),
            'category': cat_m.group(1) if cat_m else 'GENERAL',
            'price': int(price_m.group(1)) if price_m else 0,
            'dietary': diet_m.group(1) if diet_m else '',
            'description': desc_m.group(1) if desc_m else '',
            'recipeNotes': notes_m.group(1) if notes_m else ''
        })

print(f"Total parsed dishes in actualMenuData.js: {len(actual_items)}")

cat_counts = Counter(i['category'] for i in actual_items)
print("\n--- Categories in actualMenuData.js ---")
for cat, cnt in sorted(cat_counts.items()):
    print(f"  {cat:<35}: {cnt} items")

name_counts = Counter(i['name'] for i in actual_items)
actual_dupes = {k: v for k, v in name_counts.items() if v > 1}
print(f"\nUnique dish names in actualMenuData.js: {len(name_counts)}")
print(f"Duplicate dish names in actualMenuData.js: {actual_dupes}")

# Check if Mutton Ghee Roast appears in actualMenuData.js
mgr_matches = [i for i in actual_items if 'ghee roast' in i['name'].lower()]
print(f"\nGhee Roast dishes in actualMenuData.js ({len(mgr_matches)}):")
for m in mgr_matches:
    print(f"  {m['code']} | {m['name']} | Cat: {m['category']} | Price: ₹{m['price']}")

# 2. Check extracted_menu_text.txt
print("\n--- Examining extracted_menu_text.txt ---")
with open('extracted_menu_text.txt', 'r', encoding='utf-8', errors='ignore') as f:
    menu_txt = f.read()

print(f"extracted_menu_text.txt size: {len(menu_txt)} chars")
# Find mentions of Mutton Ghee Roast in extracted_menu_text.txt
lines = [line.strip() for line in menu_txt.split('\n') if 'ghee roast' in line.lower()]
print(f"Ghee Roast lines in extracted_menu_text.txt ({len(lines)}):")
for l in lines:
    print(f"  {l}")

# 3. Check for any CSV files or scripts in the repo that define the 69 items
print("\n--- Checking for CSVs or scripts with 69 items ---")
import os
for root, dirs, files in os.walk('.'):
    for file in files:
        if file.endswith('.csv') or file.endswith('.json') or 'menu' in file.lower():
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    c = f.read()
                    if 'GARDEN & GRAIN' in c and 'FROM THE SEA - PRAWNS' in c:
                        print(f"  Found matching menu source in: {path}")
            except:
                pass
