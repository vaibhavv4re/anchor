import json
import urllib.request
import random

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

def test_onboard():
    pin = str(random.randint(100000, 999999))
    identity_payload = {
        "id": f"id_{pin}",
        "tenant_id": "tenant_h0qc7wf",
        "pin_hash": pin,
        "status": "ACTIVE"
    }
    employee_payload = {
        "id": f"emp_{pin}",
        "identity_id": f"id_{pin}",
        "tenant_id": "tenant_h0qc7wf",
        "employee_code": f"EMP-{pin}",
        "name": f"CA Auditor {pin}",
        "role_id": "role-ca",
        "workspace_default": "ca",
        "status": "ACTIVE",
        "data": {"pinDisplay": pin, "pin": pin}
    }

    print("Posting Identities Payload:", identity_payload)
    req1 = urllib.request.Request(
        f"{BASE_URL}/identities",
        data=json.dumps(identity_payload).encode('utf-8'),
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        },
        method="POST"
    )
    with urllib.request.urlopen(req1) as resp1:
        print("[OK] IDENTITIES SUCCESS:", json.loads(resp1.read().decode('utf-8')))

    print("Posting Employees Payload:", employee_payload)
    req2 = urllib.request.Request(
        f"{BASE_URL}/employees",
        data=json.dumps(employee_payload).encode('utf-8'),
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        },
        method="POST"
    )
    with urllib.request.urlopen(req2) as resp2:
        print("[OK] EMPLOYEES SUCCESS:", json.loads(resp2.read().decode('utf-8')))

if __name__ == "__main__":
    test_onboard()
