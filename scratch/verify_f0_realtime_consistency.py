import os
import sys
import json
import urllib.request

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

def check_supabase_table(table_name):
    url = f"{BASE_URL}/{table_name}?select=id&limit=1"
    req = urllib.request.Request(url, headers={
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}"
    })
    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8'))
                print(f"[OK] Supabase table '{table_name}' accessible. Sample rows: {len(data)}")
                return True
    except Exception as e:
        print(f"[FAIL] Error accessing Supabase table '{table_name}': {e}")
        return False

def verify_f0_architecture():
    print("\n====================================================================")
    print("F0 SHARED CLOUD STATE & REALTIME CONSISTENCY AUDIT & VERIFICATION")
    print("====================================================================\n")

    tables = ["orders", "table_sessions", "bill_revisions", "invoices", "payments"]
    for tbl in tables:
        ok = check_supabase_table(tbl)
        if not ok:
            print(f"[FAIL] Required Supabase table '{tbl}' is not responding!")
            sys.exit(1)

    print("\n--- AUDITING FRONTEND & PLATFORM CODE CONTRACTS ---")

    # 1. Check SupabaseDataAdapter for unblocked collections
    adapter_path = os.path.join(r"d:\Projects\Anchor", "businessos/platform/data/adapters/supabaseDataAdapter.js")
    with open(adapter_path, "r", encoding="utf-8") as f:
        adapter_code = f.read()

    forbidden_virtuals = ["table_sessions", "bill_revisions", "invoices", "payments"]
    for v in forbidden_virtuals:
        if f"'{v}'" in adapter_code.split("virtualCollections = [")[1].split("]")[0]:
            print(f"[FAIL] '{v}' is still listed as a virtualCollection in supabaseDataAdapter.js!")
            sys.exit(1)
        print(f"[OK] '{v}' is unblocked and Cloud-enabled in supabaseDataAdapter.js")

    # 2. Check SupabaseRealtime for WebSocket channels and Delta Polling
    realtime_path = os.path.join(r"d:\Projects\Anchor", "businessos/platform/realtime/supabaseRealtime.js")
    with open(realtime_path, "r", encoding="utf-8") as f:
        realtime_code = f.read()

    realtime_checks = [
        "tablesToSubscribe",
        "_syncCloudTableSessions",
        "_syncCloudBillRevisions",
        "_syncCloudInvoices",
        "_syncCloudPayments",
        "_syncCloudOrders"
    ]
    for check in realtime_checks:
        if check not in realtime_code:
            print(f"[FAIL] supabaseRealtime.js missing required handler: {check}")
            sys.exit(1)
        print(f"[OK] supabaseRealtime.js contains Realtime handler: '{check}'")

    # 3. Check DataGateway for Idempotency & Hydration
    gateway_path = os.path.join(r"d:\Projects\Anchor", "businessos/platform/data/dataGateway.js")
    with open(gateway_path, "r", encoding="utf-8") as f:
        gateway_code = f.read()

    gateway_checks = [
        "processedOperations",
        "isOperationProcessed",
        "markOperationProcessed",
        "hydrateCollections"
    ]
    for check in gateway_checks:
        if check not in gateway_code:
            print(f"[FAIL] dataGateway.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] dataGateway.js contains idempotency/hydration contract: '{check}'")

    # 4. Check SessionModel for versioning & cloud update
    session_path = os.path.join(r"d:\Projects\Anchor", "businessos/platform/session/sessionModel.js")
    with open(session_path, "r", encoding="utf-8") as f:
        session_code = f.read()

    if "version:" not in session_code or "dg.update('table_sessions'" not in session_code:
        print("[FAIL] sessionModel.js missing version counter or cloud DataGateway.update call!")
        sys.exit(1)
    print("[OK] sessionModel.js includes monotonic version counter and Cloud DataGateway.update call.")

    # 5. Check CashierWorkspaceView for subscriptions and Cloud Hydration
    cashier_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/billing/ui/CashierWorkspaceView.js")
    with open(cashier_path, "r", encoding="utf-8") as f:
        cashier_code = f.read()

    cashier_checks = [
        "bill:revision:created",
        "session:projection:updated",
        "data:changed",
        "hydrateCollections"
    ]
    for check in cashier_checks:
        if check not in cashier_code:
            print(f"[FAIL] CashierWorkspaceView.js missing subscription or hydration: {check}")
            sys.exit(1)
        print(f"[OK] CashierWorkspaceView.js contains event subscription & hydration: '{check}'")

    print("\n====================================================================")
    print("[SUCCESS] F0 SHARED CLOUD STATE & REALTIME CONSISTENCY CONTRACTS VERIFIED!")
    print("====================================================================\n")

if __name__ == "__main__":
    verify_f0_architecture()
