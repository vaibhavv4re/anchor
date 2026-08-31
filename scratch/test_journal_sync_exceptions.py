import json
import urllib.request
import time

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

def test_journal_sync():
    timestamp = int(time.time())
    journal_row = {
        "job_id": f"job_exc_test_{timestamp}",
        "job_type": "RECONCILIATION_EXCEPTION",
        "tenant_id": "tenant_h0qc7wf",
        "entity_name": "reconciliation_exceptions",
        "payload": {
            "id": f"exc_test_{timestamp}",
            "exceptionId": f"EXC-{timestamp}",
            "invoiceNumber": "INV/26-27/1001",
            "status": "FLAGGED",
            "flaggedBy": "CA Auditor",
            "reason": "Test Discrepancy Flagging"
        },
        "device_id": "TEST-DEVICE-01",
        "version": 1,
        "actor": "CA Auditor",
        "correlation_id": f"CID-{timestamp}",
        "sync_state": "SYNCED"
    }

    # 1. Post to offline_journal
    url_post = f"{BASE_URL}/offline_journal"
    req_post = urllib.request.Request(
        url_post,
        data=json.dumps(journal_row).encode('utf-8'),
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        },
        method="POST"
    )
    with urllib.request.urlopen(req_post) as resp:
        res_data = json.loads(resp.read().decode('utf-8'))
        print("[OK] POST to offline_journal SUCCESS:", res_data)

    # 2. Fetch back from offline_journal
    url_get = f"{BASE_URL}/offline_journal?entity_name=eq.reconciliation_exceptions&select=*"
    req_get = urllib.request.Request(
        url_get,
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}"
        }
    )
    with urllib.request.urlopen(req_get) as resp:
        fetched = json.loads(resp.read().decode('utf-8'))
        print(f"[OK] GET offline_journal returned {len(fetched)} reconciliation_exceptions entries from Supabase Cloud!")
        for f in fetched[-3:]:
            print("   ->", f.get('job_id'), "| status:", f.get('payload', {}).get('status'), "| inv:", f.get('payload', {}).get('invoiceNumber'))

if __name__ == "__main__":
    test_journal_sync()
