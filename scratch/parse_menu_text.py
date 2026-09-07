import sys
import re
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

with open('extracted_menu_text.txt', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

lines = [l.strip() for l in text.splitlines() if l.strip()]

# Let's inspect headings, sections, numbered items, etc.
sections = []
current_section = None
items = []

for line in lines:
    # Check if section heading
    if line.isupper() and len(line) < 50:
        current_section = line
        sections.append(line)
    elif re.match(r'^\d+\.\s+', line):
        # Numbered item e.g. "1. Kokum & Coconut Soup"
        name = re.sub(r'^\d+\.\s+', '', line).strip()
        items.append({
            'section': current_section,
            'name': name,
            'raw_line': line
        })

print(f"Total numbered items found: {len(items)}")
print(f"Total sections: {len(set(sections))}")

# Group items by section
by_section = {}
for it in items:
    s = it['section']
    by_section[s] = by_section.get(s, []) + [it['name']]

print("\n--- Items per section in extracted_menu_text.txt ---")
for s, dish_names in by_section.items():
    print(f"\n[{s}] ({len(dish_names)} items):")
    for d in dish_names:
        print(f"    - {d}")

name_counts = Counter(it['name'] for it in items)
dups = {k: v for k, v in name_counts.items() if v > 1}
print(f"\nTotal dishes: {len(items)}, Unique names: {len(name_counts)}")
print(f"Duplicates in extracted_menu_text.txt: {dups}")
