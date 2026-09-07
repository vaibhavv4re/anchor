import urllib.request
import json
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

print("=================================================================")
print("PHASE 2: CONTROLLED SUPABASE TAXONOMY MIGRATION & RECONCILIATION")
print("=================================================================")

supabase_url = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1'
tenant_id = 'tenant_h0qc7wf'
api_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw'

headers = {
    'apikey': api_key,
    'Authorization': f'Bearer {api_key}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def http_get(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def http_post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers, method='POST')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def http_patch(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers, method='PATCH')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

# The 20 Canonical Categories Specification
CANONICAL_CATEGORIES = [
    {
        "categoryCode": "CAT-CHICKEN",
        "categoryName": "Chicken",
        "productFamilyCode": "FAM-MEAT",
        "productFamilyName": "Meat & Poultry",
        "defaultUom": "KG",
        "description": "Fresh & frozen chicken cuts"
    },
    {
        "categoryCode": "CAT-MUTTON",
        "categoryName": "Mutton & Lamb",
        "productFamilyCode": "FAM-MEAT",
        "productFamilyName": "Meat & Poultry",
        "defaultUom": "KG",
        "description": "Fresh mutton, lamb chops & minced meat"
    },
    {
        "categoryCode": "CAT-FISH",
        "categoryName": "Fish & Finfish",
        "productFamilyCode": "FAM-SEAFOOD",
        "productFamilyName": "Seafood",
        "defaultUom": "KG",
        "description": "Freshwater & marine fish fillets"
    },
    {
        "categoryCode": "CAT-PRAWNS",
        "categoryName": "Prawns & Shellfish",
        "productFamilyCode": "FAM-SEAFOOD",
        "productFamilyName": "Seafood",
        "defaultUom": "KG",
        "description": "Tiger prawns, white prawns, crabs & shellfish"
    },
    {
        "categoryCode": "CAT-VEG",
        "categoryName": "Fresh Vegetables",
        "productFamilyCode": "FAM-PRODUCE",
        "productFamilyName": "Fruits & Vegetables",
        "defaultUom": "KG",
        "description": "Onions, tomatoes, potatoes, greens & exotic veggies"
    },
    {
        "categoryCode": "CAT-BUTTER",
        "categoryName": "Butter & Ghee",
        "productFamilyCode": "FAM-DAIRY",
        "productFamilyName": "Dairy & Fats",
        "defaultUom": "KG",
        "description": "Salted butter, unsalted butter, clarified butter"
    },
    {
        "categoryCode": "CAT-CHEESE",
        "categoryName": "Cheese & Cream",
        "productFamilyCode": "FAM-DAIRY",
        "productFamilyName": "Dairy & Fats",
        "defaultUom": "KG",
        "description": "Mozzarella, cheddar, processed cheese & fresh cream"
    },
    {
        "categoryCode": "CAT-SPICE-WHOLE",
        "categoryName": "Whole Spices",
        "productFamilyCode": "FAM-SPICES",
        "productFamilyName": "Spices & Seasonings",
        "defaultUom": "KG",
        "description": "Cardamom, cinnamon, cloves, cumin seeds, black pepper"
    },
    {
        "categoryCode": "CAT-SPICE-POWDER",
        "categoryName": "Powdered Spices",
        "productFamilyCode": "FAM-SPICES",
        "productFamilyName": "Spices & Seasonings",
        "defaultUom": "KG",
        "description": "Turmeric powder, red chili powder, coriander powder, garam masala"
    },
    {
        "categoryCode": "CAT-OILS",
        "categoryName": "Cooking Oils & Fats",
        "productFamilyCode": "FAM-CONDIMENTS",
        "productFamilyName": "Oils, Sauces & Condiments",
        "defaultUom": "LTR",
        "description": "Sunflower oil, mustard oil, olive oil, sesame oil"
    },
    {
        "categoryCode": "CAT-RICE",
        "categoryName": "Rice & Staples",
        "productFamilyCode": "FAM-GRAINS",
        "productFamilyName": "Grains, Pulses & Dry Goods",
        "defaultUom": "KG",
        "description": "Basmati rice, jeera rice, wheat flour, maida"
    },
    {
        "categoryCode": "CAT-PULSES",
        "categoryName": "Pulses & Dals",
        "productFamilyCode": "FAM-GRAINS",
        "productFamilyName": "Grains, Pulses & Dry Goods",
        "defaultUom": "KG",
        "description": "Tur dal, moong dal, urad dal, lentils, chickpeas"
    },
    {
        "categoryCode": "CAT-DIPS",
        "categoryName": "Sauces, Pastes & Dips",
        "productFamilyCode": "FAM-CONDIMENTS",
        "productFamilyName": "Oils, Sauces & Condiments",
        "defaultUom": "KG",
        "description": "Table sauces, vinegar, mustard paste, dips, marinades"
    },
    {
        "categoryCode": "CAT-BROTH",
        "categoryName": "Stocks & Broths",
        "productFamilyCode": "FAM-PREPS",
        "productFamilyName": "Semi-Finished Preparations",
        "defaultUom": "LTR",
        "description": "Chicken broth, mutton paya broth, seafood stock, veg stock"
    },
    {
        "categoryCode": "CAT-SALADS",
        "categoryName": "Fresh Salads & Slaws",
        "productFamilyCode": "FAM-PREPS",
        "productFamilyName": "Semi-Finished Preparations",
        "defaultUom": "PORTION",
        "description": "Prepared salads, slaws, kachumber, pickled accompaniments"
    },
    {
        "categoryCode": "CAT-MASALA-BASE",
        "categoryName": "Signature Gravies & Masalas",
        "productFamilyCode": "FAM-PREPS",
        "productFamilyName": "Semi-Finished Preparations",
        "defaultUom": "KG",
        "description": "White gravy, makhani gravy, onion tomato masala base"
    },
    {
        "categoryCode": "CAT-BEV-ALC",
        "categoryName": "Spirits & Beer",
        "productFamilyCode": "FAM-BEVERAGES",
        "productFamilyName": "Beverages",
        "defaultUom": "BOTTLE",
        "description": "Whiskey, rum, vodka, gin, beer, wine"
    },
    {
        "categoryCode": "CAT-BEV-SOFT",
        "categoryName": "Soft Drinks & Juices",
        "productFamilyCode": "FAM-BEVERAGES",
        "productFamilyName": "Beverages",
        "defaultUom": "CAN",
        "description": "Sodas, tonic water, canned fruit juices, syrups"
    },
    {
        "categoryCode": "CAT-TAKEAWAY",
        "categoryName": "Takeaway Packaging",
        "productFamilyCode": "FAM-SUPPLIES",
        "productFamilyName": "Packaging & Supplies",
        "defaultUom": "PCS",
        "description": "Meal boxes, paper bags, plastic containers, cutlery"
    },
    {
        "categoryCode": "CAT-CONSUMABLE",
        "categoryName": "Consumables & Operating Supplies",
        "productFamilyCode": "FAM-SUPPLIES",
        "productFamilyName": "Packaging & Supplies",
        "defaultUom": "KG",
        "description": "Charcoal briquettes, napkins, cleaning/operating consumables"
    }
]

# Map canonical categories for rapid lookup
CAT_LOOKUP = {c["categoryCode"]: c for c in CANONICAL_CATEGORIES}

# ==============================================================================
# STEP 1: IDEMPOTENT RECONCILIATION OF INVENTORY_CATEGORIES
# ==============================================================================
print("\n--- STEP 1: Idempotent Category Master Upsert & Reconciliation ---")
existing_categories = http_get(f"{supabase_url}/inventory_categories?tenant_id=eq.{tenant_id}")
existing_cat_map = {c.get("category_code"): c for c in existing_categories}
print(f"Current live categories: {len(existing_categories)}")

created_cats = 0
updated_cats = 0
unchanged_cats = 0

for cat_def in CANONICAL_CATEGORIES:
    code = cat_def["categoryCode"]
    name = cat_def["categoryName"]
    pf_code = cat_def["productFamilyCode"]
    pf_name = cat_def["productFamilyName"]
    uom = cat_def["defaultUom"]
    desc = cat_def["description"]

    if code in existing_cat_map:
        # Category exists: verify and update metadata if necessary
        existing_rec = existing_cat_map[code]
        existing_data = existing_rec.get("data") or {}
        
        # Check if update is needed (e.g. CAT-TAKEAWAY having old FAM-PACKAGING)
        needs_update = False
        if existing_data.get("productFamilyCode") != pf_code or existing_data.get("productFamilyName") != pf_name:
            needs_update = True
        if existing_rec.get("category_name") != name:
            needs_update = True
        
        if needs_update:
            updated_data = {
                **existing_data,
                "categoryCode": code,
                "categoryName": name,
                "productFamilyCode": pf_code,
                "productFamilyName": pf_name,
                "defaultUom": existing_data.get("defaultUom") or uom,
                "status": "ACTIVE",
                "description": desc
            }
            patch_body = {
                "category_name": name,
                "category_type": "OPERATIONAL",
                "data": updated_data
            }
            rec_id = existing_rec["id"]
            http_patch(f"{supabase_url}/inventory_categories?id=eq.{rec_id}&tenant_id=eq.{tenant_id}", patch_body)
            print(f"  [UPDATED] {code:<18} -> {name} ({pf_code})")
            updated_cats += 1
        else:
            unchanged_cats += 1
    else:
        # Category does not exist: create it using patched serializer format
        cat_id = f"cat-{code.lower().replace('cat-', '')}-{tenant_id}"
        payload_data = {
            "id": cat_id,
            "tenantId": tenant_id,
            "categoryCode": code,
            "categoryName": name,
            "productFamilyCode": pf_code,
            "productFamilyName": pf_name,
            "defaultUom": uom,
            "status": "ACTIVE",
            "description": desc
        }
        create_body = {
            "id": cat_id,
            "tenant_id": tenant_id,
            "category_code": code,
            "category_name": name,
            "category_type": "OPERATIONAL",
            "data": payload_data
        }
        http_post(f"{supabase_url}/inventory_categories", create_body)
        print(f"  [CREATED] {code:<18} -> {name} ({pf_code})")
        created_cats += 1

print(f"Category Master Reconciliation Summary: {created_cats} created, {updated_cats} updated, {unchanged_cats} unchanged.")

# ==============================================================================
# STEP 2: EXPLICIT ITEM-BY-ITEM RECLASSIFICATION
# ==============================================================================
print("\n--- STEP 2: Item-by-Item Inventory Reclassification ---")

# Explicit mapping per item code
ITEM_RECLASSIFICATION = {
    # Chicken items
    "RM0101": "CAT-CHICKEN",
    "RM0102": "CAT-CHICKEN",
    "RM0103": "CAT-CHICKEN",
    "RM0104": "CAT-CHICKEN",

    # Mutton items
    "RM0105": "CAT-MUTTON",
    "RM0106": "CAT-MUTTON",
    "RM0107": "CAT-MUTTON",

    # Finfish items
    "RM0201": "CAT-FISH",
    "RM0202": "CAT-FISH",
    "RM0203": "CAT-FISH",
    "RM0204": "CAT-FISH",
    "RM0205": "CAT-FISH",

    # Shellfish items
    "RM0206": "CAT-PRAWNS",
    "RM0207": "CAT-PRAWNS",
    "RM0208": "CAT-PRAWNS",

    # Fresh produce items
    "RM0302": "CAT-VEG",
    "RM0303": "CAT-VEG",
    "RM0304": "CAT-VEG",
    "RM0305": "CAT-VEG",
    "RM0306": "CAT-VEG",
    "RM0307": "CAT-VEG",
    "RM0308": "CAT-VEG",
    "RM0309": "CAT-VEG",
    "RM0310": "CAT-VEG",
    "RM0311": "CAT-VEG",
    "RM0312": "CAT-VEG",
    "RM0313": "CAT-VEG",
    "RM0314": "CAT-VEG",

    # Dairy items
    "RM0301": "CAT-CHEESE",
    "RM0408": "CAT-BUTTER",
    "RM0409": "CAT-BUTTER",
    "RM0411": "CAT-CHEESE",

    # Grain & Staples items
    "RM0401": "CAT-RICE",
    "RM0402": "CAT-RICE",
    "RM0403": "CAT-RICE",
    "RM0404": "CAT-RICE",
    "RM0405": "CAT-RICE",
    "RM0406": "CAT-RICE",
    "RM0601": "CAT-RICE",
    "PKG0001": "CAT-RICE",

    # Pulses & Dals (including RM0407 & RM5247 DAL)
    "RM0407": "CAT-PULSES",
    "RM5247": "CAT-PULSES",
    "RM0743": "CAT-PULSES",
    "RM0744": "CAT-PULSES",

    # Cooking Oils
    "RM0410": "CAT-OILS",

    # Spices (Whole)
    "RM0503": "CAT-SPICE-WHOLE",
    "RM0504": "CAT-SPICE-WHOLE",

    # Dips, Pastes & Sauces
    "RM0501": "CAT-DIPS",
    "RM0502": "CAT-DIPS",
    "SF0007": "CAT-DIPS",
    "SF0008": "CAT-DIPS",
    "SF0009": "CAT-DIPS",
    "RM0784": "CAT-DIPS",
    "RM0785": "CAT-DIPS",
    "RM0786": "CAT-DIPS",
    "RM0787": "CAT-DIPS",
    "RM0788": "CAT-DIPS",
    "RM0789": "CAT-DIPS",

    # Signature Gravies & Masala Bases
    "SF0001": "CAT-MASALA-BASE",
    "SF0002": "CAT-MASALA-BASE",
    "SF0003": "CAT-MASALA-BASE",
    "SF0004": "CAT-MASALA-BASE",
    "SF0005": "CAT-MASALA-BASE",
    "SF0006": "CAT-MASALA-BASE",

    # Consumables
    "PKG0002": "CAT-CONSUMABLE",

    # Broths (Metadata synchronization)
    "SF0010": "CAT-BROTH",
    "SF0011": "CAT-BROTH",
    "SF0012": "CAT-BROTH",

    # Salads (Metadata synchronization)
    "SF0014": "CAT-SALADS",
    "SF0015": "CAT-SALADS",
    "SF0016": "CAT-SALADS",
    "SF0017": "CAT-SALADS",
    "SF0018": "CAT-SALADS"
}

# Fetch all 196 current inventory items
live_inventory = http_get(f"{supabase_url}/inventory?tenant_id=eq.{tenant_id}&order=item_code.asc")
live_item_map = {i.get("item_code"): i for i in live_inventory}
reclassified_count = 0
metadata_synced_count = 0

# Step 2A: Explicit Reclassification
for item_code, target_cat_code in ITEM_RECLASSIFICATION.items():
    if item_code not in live_item_map:
        print(f"  ⚠️ Warning: Item {item_code} not found in inventory!")
        continue

    item = live_item_map[item_code]
    old_cat_code = item.get("category_code")
    cat_spec = CAT_LOOKUP.get(target_cat_code)

    if not cat_spec:
        raise ValueError(f"Unknown target category code {target_cat_code}")

    existing_data = item.get("data") or {}
    
    needs_cat_update = (old_cat_code != target_cat_code)
    needs_data_sync = (
        existing_data.get("categoryCode") != target_cat_code or
        existing_data.get("categoryName") != cat_spec["categoryName"] or
        existing_data.get("productFamilyCode") != cat_spec["productFamilyCode"] or
        existing_data.get("productFamilyName") != cat_spec["productFamilyName"]
    )

    if needs_cat_update or needs_data_sync:
        # Preserve all other fields in data
        updated_data = {
            **existing_data,
            "categoryCode": target_cat_code,
            "categoryName": cat_spec["categoryName"],
            "productFamilyCode": cat_spec["productFamilyCode"],
            "productFamilyName": cat_spec["productFamilyName"]
        }

        patch_payload = {
            "category_code": target_cat_code,
            "data": updated_data
        }

        http_patch(f"{supabase_url}/inventory?item_code=eq.{item_code}&tenant_id=eq.{tenant_id}", patch_payload)

        # Update in-memory item map
        item["category_code"] = target_cat_code
        item["data"] = updated_data

        if needs_cat_update:
            print(f"  [RECLASSIFIED] {item_code:<8} | {item.get('item_name')[:35]:<35} | {old_cat_code} ➔ {target_cat_code}")
            reclassified_count += 1
        else:
            print(f"  [JSON SYNCED]  {item_code:<8} | {item.get('item_name')[:35]:<35} | {target_cat_code} ({cat_spec['productFamilyCode']})")
            metadata_synced_count += 1

print(f"\nStep 2A Complete: {reclassified_count} reclassified.")

# Step 2B: Full Inventory JSONB Synchronization across all 196 items
print("\n--- STEP 2B: Full Inventory JSONB Metadata Synchronization ---")
for item in live_inventory:
    item_code = item.get("item_code")
    cat_code = item.get("category_code")
    cat_spec = CAT_LOOKUP.get(cat_code)
    
    if not cat_spec:
        print(f"  ⚠️ Warning: Item {item_code} has unknown category {cat_code}")
        continue

    existing_data = item.get("data") or {}
    needs_data_sync = (
        existing_data.get("categoryCode") != cat_code or
        existing_data.get("categoryName") != cat_spec["categoryName"] or
        existing_data.get("productFamilyCode") != cat_spec["productFamilyCode"] or
        existing_data.get("productFamilyName") != cat_spec["productFamilyName"]
    )

    if needs_data_sync:
        updated_data = {
            **existing_data,
            "categoryCode": cat_code,
            "categoryName": cat_spec["categoryName"],
            "productFamilyCode": cat_spec["productFamilyCode"],
            "productFamilyName": cat_spec["productFamilyName"]
        }
        patch_payload = {"data": updated_data}
        http_patch(f"{supabase_url}/inventory?item_code=eq.{item_code}&tenant_id=eq.{tenant_id}", patch_payload)
        item["data"] = updated_data
        metadata_synced_count += 1

print(f"Step 2B Complete: Total {metadata_synced_count} items with taxonomy JSON synchronized.")

# ==============================================================================
# STEP 3: POST-MIGRATION HARD AUDIT CERTIFICATION
# ==============================================================================
print("\n--- STEP 3: Post-Migration Hard Audit Certification ---")

final_categories = http_get(f"{supabase_url}/inventory_categories?tenant_id=eq.{tenant_id}")
final_inventory = http_get(f"{supabase_url}/inventory?tenant_id=eq.{tenant_id}&order=item_code.asc")

print(f"1. Category Master Count: {len(final_categories)} (Expected: 20)")
assert len(final_categories) == 20, f"Expected 20 categories, got {len(final_categories)}"

canonical_codes = set(CAT_LOOKUP.keys())
live_cat_codes = {c.get("category_code") for c in final_categories}
diff_cats = canonical_codes.symmetric_difference(live_cat_codes)
print(f"2. Canonical vs Live Category Code Parity: {'MATCH' if not diff_cats else diff_cats}")
assert not diff_cats, f"Category code mismatch: {diff_cats}"

print(f"3. Total Inventory Records: {len(final_inventory)} (Expected: 196)")
assert len(final_inventory) == 196, f"Expected 196 inventory items, got {len(final_inventory)}"

# Check for legacy categories in inventory
legacy_codes = {
    'CAT-MEAT', 'CAT-SEAFOOD', 'CAT-PRODUCE', 'CAT-GRAIN', 'CAT-OIL',
    'CAT-SPICE', 'CAT-PREP', 'CAT-PKG', 'CAT-CONS', 'CAT-DAIRY'
}

legacy_items = [i for i in final_inventory if i.get("category_code") in legacy_codes]
print(f"4. Legacy Category References in Inventory: {len(legacy_items)} (Expected: 0)")
assert len(legacy_items) == 0, f"Found {len(legacy_items)} legacy items: {[i['item_code'] for i in legacy_items]}"

# Check for unmapped categories
unmapped_items = [i for i in final_inventory if i.get("category_code") not in canonical_codes]
print(f"5. Unmapped Category References in Inventory: {len(unmapped_items)} (Expected: 0)")
assert len(unmapped_items) == 0, f"Found {len(unmapped_items)} unmapped items: {[i['item_code'] for i in unmapped_items]}"

# Check category_code ↔ data.categoryCode consistency
data_cat_mismatches = []
pf_mismatches = []

for i in final_inventory:
    code = i.get("item_code")
    cat_code = i.get("category_code")
    d = i.get("data") or {}
    d_cat = d.get("categoryCode")
    d_pf = d.get("productFamilyCode")
    expected_pf = CAT_LOOKUP[cat_code]["productFamilyCode"]

    if d_cat != cat_code:
        data_cat_mismatches.append(f"{code}: SQL={cat_code}, data={d_cat}")
    if d_pf != expected_pf:
        pf_mismatches.append(f"{code}: expected={expected_pf}, data={d_pf}")

print(f"6. SQL category_code ↔ data.categoryCode Mismatches: {len(data_cat_mismatches)} (Expected: 0)")
assert len(data_cat_mismatches) == 0, f"Mismatches found: {data_cat_mismatches[:5]}"

print(f"7. Category ➔ Product Family Mismatches: {len(pf_mismatches)} (Expected: 0)")
assert len(pf_mismatches) == 0, f"Product family mismatches found: {pf_mismatches[:5]}"

# Save post-migration snapshot
post_snapshot = []
post_cat_counts = {}
for it in final_inventory:
    c = it.get("item_code")
    cat = it.get("category_code")
    d = it.get("data") or {}
    post_snapshot.append({
        'item_code': c,
        'item_name': it.get("item_name"),
        'category_code': cat,
        'data_categoryCode': d.get('categoryCode'),
        'data_categoryName': d.get('categoryName'),
        'data_productFamilyCode': d.get('productFamilyCode'),
        'data_productFamilyName': d.get('productFamilyName')
    })
    post_cat_counts[cat] = post_cat_counts.get(cat, 0) + 1

with open('scratch/post_migration_inventory_snapshot.json', 'w', encoding='utf-8') as f:
    json.dump(post_snapshot, f, indent=2)

print("\n--- Post-Migration Final Category Distribution ---")
for cat, count in sorted(post_cat_counts.items()):
    print(f"  {cat:<18}: {count} items")

print("\n=================================================================")
print("✅ PHASE 2 TAXONOMY MIGRATION & RECONCILIATION COMPLETE & CERTIFIED!")
print("=================================================================")
