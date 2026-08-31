import json
import urllib.request

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

def test_insert(table, fields):
    url = f"{BASE_URL}/{table}"
    req = urllib.request.Request(
        url,
        data=json.dumps(fields).encode('utf-8'),
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
            print(f"[SUCCESS] {table} insert passed! Inserted ID:", json.loads(resp.read().decode('utf-8'))[0]['id'])
            # Clean up
            del_req = urllib.request.Request(
                f"{url}?id=eq.{fields['id']}",
                headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"},
                method="DELETE"
            )
            urllib.request.urlopen(del_req)
            return True
    except urllib.error.HTTPError as e:
        print(f"[FAIL] {table} insert failed: {e.read().decode('utf-8')}")
        return False

if __name__ == "__main__":
    # Test table_sessions
    test_insert("table_sessions", {
        "id": "sess_test_col_01",
        "tenant_id": "tenant_h0qc7wf",
        "status": "GUESTS_SEATED",
        "data": {"tableNumber": 1, "tableCode": "T-01"}
    })

    # Test bill_revisions
    test_insert("bill_revisions", {
        "id": "rev_test_col_01",
        "tenant_id": "tenant_h0qc7wf",
        "session_id": "sess_test_col_01",
        "bill_number": "BILL-TEST-01",
        "revision_number": 1,
        "grand_total": 500.00,
        "revision_status": "GENERATED",
        "data": {}
    })

    # Test invoices
    test_insert("invoices", {
        "id": "inv_test_col_01",
        "tenant_id": "tenant_h0qc7wf",
        "invoice_number": "INV-TEST-01",
        "status": "ISSUED",
        "grand_total": 500.00,
        "data": {}
    })

    # Test payments
    test_insert("payments", {
        "id": "pay_test_col_01",
        "tenant_id": "tenant_h0qc7wf",
        "amount": 500.00,
        "payment_method": "UPI",
        "status": "COMPLETED",
        "data": {}
    })
