import json
import urllib.request

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

def test_insert_identities():
    url = f"{BASE_URL}/identities"
    payload = {
        "id": "id_test_999",
        "tenant_id": "tenant_h0qc7wf",
        "pin_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "status": "ACTIVE",
        "data": {"pin": "444444", "name": "Test CA"}
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
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
            print("IDENTITIES POST SUCCESS:", json.loads(resp.read().decode('utf-8')))
    except urllib.error.HTTPError as e:
        print(f"IDENTITIES POST ERROR {e.code}: {e.read().decode('utf-8')}")

def test_insert_employees():
    url = f"{BASE_URL}/employees"
    payload = {
        "id": "emp_test_999",
        "identity_id": "id_test_999",
        "tenant_id": "tenant_h0qc7wf",
        "employee_code": "EMP-999",
        "name": "Test CA",
        "role_id": "role-ca",
        "workspace_default": "ca",
        "status": "ACTIVE",
        "data": {"pinDisplay": "444444"}
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
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
            print("EMPLOYEES POST SUCCESS:", json.loads(resp.read().decode('utf-8')))
    except urllib.error.HTTPError as e:
        print(f"EMPLOYEES POST ERROR {e.code}: {e.read().decode('utf-8')}")

if __name__ == "__main__":
    test_insert_identities()
    test_insert_employees()
