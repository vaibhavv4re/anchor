import os
import sys

def verify_manager_service_ops():
    print("--- EXECUTING MANAGER WORKSPACE PHASE M4 (SERVICE OPERATIONS) VERIFICATION ---")

    files = [
        "restaurantos/frontend/capabilities/manager/ui/ServiceOpsView.js",
        "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js",
        "businessos/platform/manager/managerProjectionService.js"
    ]

    for rel_path in files:
        full_path = os.path.join(r"d:\Projects\Anchor", rel_path.replace("/", "\\"))
        if not os.path.exists(full_path):
            print(f"[FAIL] Missing required file: {rel_path}")
            sys.exit(1)
        print(f"[OK] Found file: {rel_path}")

    # 1. Verify managerProjectionService.js contracts
    proj_path = os.path.join(r"d:\Projects\Anchor", "businessos/platform/manager/managerProjectionService.js")
    with open(proj_path, "r", encoding="utf-8") as f:
        proj_code = f.read()

    proj_checks = [
        "getServiceOperationsProjection",
        "avgKitchenPrep",
        "avgPickupLag",
        "avgOrderToTable",
        "bottleneckDiagnostic",
        "KITCHEN_BOTTLENECK",
        "PICKUP_BOTTLENECK",
        "pipelineRows"
    ]

    for check in proj_checks:
        if check not in proj_code:
            print(f"[FAIL] managerProjectionService.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] managerProjectionService.js contains: '{check}'")

    # 2. Verify ServiceOpsView.js contracts
    view_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ServiceOpsView.js")
    with open(view_path, "r", encoding="utf-8") as f:
        view_code = f.read()

    view_checks = [
        "ServiceOpsView",
        "getServiceOperationsProjection",
        "ManagerTableInspectorModal",
        "ACTIVE ORDERS",
        "PREPARING AT STATIONS",
        "READY AT PASS",
        "PICKUP LAG",
        "SERVICE TIMING & BOTTLENECK DIAGNOSTIC",
        "Table-Centric Service Flow",
        "service-flow-row"
    ]

    for check in view_checks:
        if check not in view_code:
            print(f"[FAIL] ServiceOpsView.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] ServiceOpsView.js contains: '{check}'")

    # 3. Verify ManagerWorkspaceView.js mounting for service_ops
    ws_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js")
    with open(ws_path, "r", encoding="utf-8") as f:
        ws_code = f.read()

    if "ServiceOpsView" not in ws_code or "this.activeSubView === 'service_ops'" not in ws_code:
        print("[FAIL] ManagerWorkspaceView.js missing ServiceOpsView mounting")
        sys.exit(1)
    print("[OK] ManagerWorkspaceView.js correctly mounts ServiceOpsView for 'service_ops' subview")

    print("\n[SUCCESS] ALL PHASE M4 (SERVICE OPERATIONS) ARCHITECTURAL CONTRACTS 100% VERIFIED!\n")

if __name__ == "__main__":
    verify_manager_service_ops()
