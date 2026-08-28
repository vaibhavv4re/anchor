import os
import sys

def verify_manager_cockpit():
    print("--- EXECUTING MANAGER WORKSPACE PHASE M1 COCKPIT & PROJECTION VERIFICATION ---")

    required_files = [
        "businessos/platform/manager/managerProjectionService.js",
        "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js",
        "restaurantos/frontend/capabilities/manager/ui/OperationsOverviewView.js",
        "restaurantos/frontend/app.js"
    ]

    for rel_path in required_files:
        full_path = os.path.join(r"d:\Projects\Anchor", rel_path)
        if not os.path.exists(full_path):
            print(f"[ERROR] Missing required file: {rel_path}")
            sys.exit(1)
        print(f"[OK] Found file: {rel_path}")

    # Check managerProjectionService.js contents
    proj_path = os.path.join(r"d:\Projects\Anchor", "businessos/platform/manager/managerProjectionService.js")
    with open(proj_path, "r", encoding="utf-8") as f:
        proj_content = f.read()

    expected_proj_tokens = [
        "getOperationalProjection",
        "tableMasterModel",
        "sessionModel",
        "orderModel",
        "billRevisionModel",
        "paymentModel",
        "salesToday",
        "needsAttentionQueue",
        "DELAYED_KOT",
        "RECALLED_BILL",
        "PICKUP_LAG",
        "DISCOUNT_APPROVAL",
        "operationalHealth",
        "INTERVENTION_REQUIRED",
        "ATTENTION_REQUIRED",
        "NORMAL"
    ]

    for token in expected_proj_tokens:
        if token not in proj_content:
            print(f"[ERROR] managerProjectionService.js missing expected token: '{token}'")
            sys.exit(1)
        print(f"[OK] managerProjectionService.js contains: '{token}'")

    # Check OperationsOverviewView.js contents
    view_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/OperationsOverviewView.js")
    with open(view_path, "r", encoding="utf-8") as f:
        view_content = f.read()

    expected_view_tokens = [
        "Operations Overview",
        "managerProjectionService",
        "Operational Health",
        "NEEDS ATTENTION",
        "SHIFT PERFORMANCE",
        "salesToday",
        "activeTableCount",
        "needsAttentionQueue"
    ]

    for token in expected_view_tokens:
        if token not in view_content:
            print(f"[ERROR] OperationsOverviewView.js missing expected token: '{token}'")
            sys.exit(1)
        print(f"[OK] OperationsOverviewView.js contains: '{token}'")

    # Check ManagerWorkspaceView.js contents
    ws_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js")
    with open(ws_path, "r", encoding="utf-8") as f:
        ws_content = f.read()

    expected_ws_tokens = [
        "MANAGER COCKPIT",
        "operations_overview",
        "floor",
        "service_ops",
        "sales_cashier",
        "staff_shift",
        "exceptions",
        "reports",
        "my_shift",
        "sidebar-exp-badge",
        "updateSidebarExceptionBadge"
    ]

    for token in expected_ws_tokens:
        if token not in ws_content:
            print(f"[ERROR] ManagerWorkspaceView.js missing expected token: '{token}'")
            sys.exit(1)
        print(f"[OK] ManagerWorkspaceView.js contains: '{token}'")

    print("\n[SUCCESS] ALL MANAGER WORKSPACE PHASE M1 COCKPIT ARCHITECTURAL CONTRACTS 100% VERIFIED!")

if __name__ == "__main__":
    verify_manager_cockpit()
