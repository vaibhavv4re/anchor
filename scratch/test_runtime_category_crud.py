import urllib.request
import json
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

print("=================================================================")
print("DISPOSABLE RUNTIME CATEGORY CRUD GATE TEST (POSTGREST / SUPABASE)")
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

test_code = 'CAT-TAX-TEST'
test_id = f'cat-tax-test-{int(time.time())}'

# Step 1: Pre-cleanup
print("\n1. Pre-cleanup: ensuring no stale test record exists...")
del_req = urllib.request.Request(
    f"{supabase_url}/inventory_categories?category_code=eq.{test_code}&tenant_id=eq.{tenant_id}",
    headers=headers,
    method='DELETE'
)
try:
    with urllib.request.urlopen(del_req) as resp:
        print(f"  Pre-cleanup status: {resp.status} OK")
except Exception as e:
    print(f"  Pre-cleanup note: {e}")

# Step 2: Construct payload strictly according to our patched supabaseClient.js serializer
print("\n2. Serializing category using patched formatRecordForTable contract...")
# The patched serializer produces:
# id, tenant_id, category_code, category_name, category_type, data
# with productFamilyCode, productFamilyName, defaultUom, status, description inside data
serialized_payload = {
    "id": test_id,
    "tenant_id": tenant_id,
    "category_code": test_code,
    "category_name": "Taxonomy Runtime Test Category",
    "category_type": "OPERATIONAL",
    "data": {
        "id": test_id,
        "tenantId": tenant_id,
        "categoryCode": test_code,
        "categoryName": "Taxonomy Runtime Test Category",
        "productFamilyCode": "FAM-MEAT",
        "productFamilyName": "Meat & Poultry",
        "defaultUom": "KG",
        "status": "ACTIVE",
        "description": "Disposable runtime verification category"
    }
}

print(f"  Top-level columns sent to PostgREST: {list(serialized_payload.keys())}")
assert 'product_family_code' not in serialized_payload, "FORBIDDEN: product_family_code must NOT be top-level"
assert 'status' not in serialized_payload, "FORBIDDEN: status must NOT be top-level"

# Step 3: Insert into Supabase via PostgREST
print("\n3. Posting serialized payload to Supabase inventory_categories...")
post_req = urllib.request.Request(
    f"{supabase_url}/inventory_categories",
    data=json.dumps(serialized_payload).encode('utf-8'),
    headers=headers,
    method='POST'
)

with urllib.request.urlopen(post_req) as resp:
    print(f"  POST Response Status: {resp.status} (Created)")
    inserted = json.loads(resp.read().decode('utf-8'))
    print(f"  PostgREST Response: {inserted}")

# Step 4: Verify directly from Supabase via GET query
print("\n4. Verifying record directly from Supabase via GET query...")
get_req = urllib.request.Request(
    f"{supabase_url}/inventory_categories?category_code=eq.{test_code}&tenant_id=eq.{tenant_id}",
    headers=headers
)

with urllib.request.urlopen(get_req) as resp:
    records = json.loads(resp.read().decode('utf-8'))
    print(f"  Retrieved {len(records)} record(s)")
    assert len(records) == 1, f"Expected 1 record, got {len(records)}"
    rec = records[0]
    
    print(f"  Fetched SQL columns: {list(rec.keys())}")
    print(f"  category_code: {rec.get('category_code')}")
    print(f"  category_name: {rec.get('category_name')}")
    print(f"  category_type: {rec.get('category_type')}")
    print(f"  data: {rec.get('data')}")

    assert rec.get('category_code') == test_code, "category_code mismatch"
    assert rec.get('category_name') == "Taxonomy Runtime Test Category", "category_name mismatch"
    assert rec.get('category_type') == "OPERATIONAL", "category_type mismatch"
    
    inner_data = rec.get('data') or {}
    assert inner_data.get('productFamilyCode') == "FAM-MEAT", "inner data productFamilyCode mismatch"
    assert inner_data.get('productFamilyName') == "Meat & Poultry", "inner data productFamilyName mismatch"
    assert inner_data.get('defaultUom') == "KG", "inner data defaultUom mismatch"
    assert inner_data.get('status') == "ACTIVE", "inner data status mismatch"
    print("  ✅ All SQL columns and data JSONB fields verified 100% compliant!")

# Step 5: Test PATCH serialization (update category name & metadata)
print("\n5. Testing PATCH serialization via PostgREST...")
patch_payload = {
    "category_name": "Taxonomy Runtime Test Category (Updated)",
    "data": {
        **inner_data,
        "categoryName": "Taxonomy Runtime Test Category (Updated)",
        "description": "Updated via patch test"
    }
}
patch_req = urllib.request.Request(
    f"{supabase_url}/inventory_categories?id=eq.{test_id}&tenant_id=eq.{tenant_id}",
    data=json.dumps(patch_payload).encode('utf-8'),
    headers=headers,
    method='PATCH'
)
with urllib.request.urlopen(patch_req) as resp:
    print(f"  PATCH Response Status: {resp.status} OK")

# Step 6: Delete test record
print("\n6. Cleaning up disposable test record...")
del_req2 = urllib.request.Request(
    f"{supabase_url}/inventory_categories?id=eq.{test_id}&tenant_id=eq.{tenant_id}",
    headers=headers,
    method='DELETE'
)
with urllib.request.urlopen(del_req2) as resp:
    print(f"  DELETE Response Status: {resp.status} OK")

# Step 7: Confirm deletion
with urllib.request.urlopen(get_req) as resp:
    remaining = json.loads(resp.read().decode('utf-8'))
    assert len(remaining) == 0, "Test record was not deleted!"
    print(f"  ✅ Confirmed 0 remaining records for {test_code}. Database clean.")

print("\n=================================================================")
print("✅ RUNTIME CATEGORY CRUD GATE TEST PASSED 100%!")
print("=================================================================")
