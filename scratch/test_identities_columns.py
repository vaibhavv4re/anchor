import json
import urllib.request

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

def test_cols(cols):
    url = f"{BASE_URL}/identities"
    req = urllib.request.Request(
        url,
        data=json.dumps(cols).encode('utf-8'),
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print("SUCCESS with cols:", list(cols.keys()), "->", data)
            return True
    except urllib.error.HTTPError as e:
        print(f"FAILED with cols {list(cols.keys())}: HTTP {e.code} -> {e.read().decode('utf-8')}")
        return False

if __name__ == "__main__":
    # Test 1: id, tenant_id, pin_hash, status
    test_cols({"id": "id_t1", "tenant_id": "tenant_h0qc7wf", "pin_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "status": "ACTIVE"})
    # Test 2: id, pin_hash, status
    test_cols({"id": "id_t2", "pin_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "status": "ACTIVE"})
    # Test 3: id, status
    test_cols({"id": "id_t3", "status": "ACTIVE"})
    # Test 4: id only
    test_cols({"id": "id_t4"})
