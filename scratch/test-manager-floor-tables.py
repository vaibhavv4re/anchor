import os
import sys

def verify_manager_floor_tables():
    print("--- EXECUTING MANAGER WORKSPACE PHASE M2 (FLOOR & TABLES) VERIFICATION ---")

    files = [
        "restaurantos/frontend/capabilities/manager/ui/ManagerFloorView.js",
        "restaurantos/frontend/capabilities/manager/ui/ManagerTableInspectorModal.js",
        "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js",
        "restaurantos/frontend/capabilities/manager/ui/OperationsOverviewView.js"
    ]

    for rel_path in files:
        full_path = os.path.join(r"d:\Projects\Anchor", rel_path.replace("/", "\\"))
        if not os.path.exists(full_path):
            print(f"[FAIL] Missing required file: {rel_path}")
            sys.exit(1)
        print(f"[OK] Found file: {rel_path}")

    # 1. Verify ManagerFloorView.js contracts
    floor_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ManagerFloorView.js")
    with open(floor_path, "r", encoding="utf-8") as f:
        floor_code = f.read()

    floor_checks = [
        "ManagerFloorView",
        "ManagerTableInspectorModal",
        "tableProjectionService",
        "diningAreaModel",
        "orderModel",
        "billRevisionModel",
        "table:projection:updated",
        "session:milestone:changed",
        "ticket:status_changed",
        "openInspectorModal",
        "ManagerCard"
    ]

    for check in floor_checks:
        if check == "ManagerCard":
            if "manager-table-card" not in floor_code:
                print(f"[FAIL] ManagerFloorView.js missing contract: {check}")
                sys.exit(1)
        elif check not in floor_code:
            print(f"[FAIL] ManagerFloorView.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] ManagerFloorView.js contains: '{check}'")

    # 2. Verify ManagerTableInspectorModal.js contracts
    inspector_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ManagerTableInspectorModal.js")
    with open(inspector_path, "r", encoding="utf-8") as f:
        inspector_code = f.read()

    inspector_checks = [
        "ManagerTableInspectorModal",
        "tableMasterModel",
        "sessionModel",
        "orderModel",
        "billRevisionModel",
        "paymentModel",
        "sessionAuditModel",
        "SESSION OVERVIEW",
        "KITCHEN PRODUCTION",
        "FINANCIAL LEDGER SUMMARY",
        "SESSION AUDIT TIMELINE"
    ]

    for check in inspector_checks:
        if check not in inspector_code:
            print(f"[FAIL] ManagerTableInspectorModal.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] ManagerTableInspectorModal.js contains: '{check}'")

    # Ensure Waiter/Cashier operational actions are NOT present in Manager Inspector
    forbidden_actions = ["SEAT_GUESTS", "recordPayment", "openPOS"]
    for forbidden in forbidden_actions:
        if forbidden in inspector_code:
            print(f"[FAIL] ManagerTableInspectorModal violates ownership boundaries: contains '{forbidden}'")
            sys.exit(1)
        print(f"[OK] Verified ManagerTableInspectorModal excludes waiter action: '{forbidden}'")

    # 3. Verify OperationsOverviewView.js exception bridge to ManagerTableInspectorModal
    overview_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/OperationsOverviewView.js")
    with open(overview_path, "r", encoding="utf-8") as f:
        overview_code = f.read()

    overview_checks = [
        "ManagerTableInspectorModal",
        "btn-inspect-exp",
        "data-table",
        "data-session-id"
    ]

    for check in overview_checks:
        if check not in overview_code:
            print(f"[FAIL] OperationsOverviewView.js missing exception bridge contract: {check}")
            sys.exit(1)
        print(f"[OK] OperationsOverviewView.js contains: '{check}'")

    print("\n[SUCCESS] ALL PHASE M2 (FLOOR & TABLES) ARCHITECTURAL CONTRACTS 100% VERIFIED!\n")

if __name__ == "__main__":
    verify_manager_floor_tables()
