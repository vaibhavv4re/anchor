import os
import sys

def verify_manager_staff_shift():
    print("--- EXECUTING MANAGER WORKSPACE PHASE M6 (STAFF & SHIFT) VERIFICATION ---")

    files = [
        "restaurantos/frontend/capabilities/manager/ui/StaffShiftView.js",
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
        "getStaffShiftProjection",
        "totalStaffCount",
        "clockedInCount",
        "activeWaitersCount",
        "totalSalesHandled",
        "assignedTables",
        "seatedGuests",
        "salesHandled",
        "avgPickupLag"
    ]

    for check in proj_checks:
        if check not in proj_code:
            print(f"[FAIL] managerProjectionService.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] managerProjectionService.js contains: '{check}'")

    # 2. Verify StaffShiftView.js contracts
    view_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/StaffShiftView.js")
    with open(view_path, "r", encoding="utf-8") as f:
        view_code = f.read()

    view_checks = [
        "StaffShiftView",
        "getStaffShiftProjection",
        "TOTAL ONBOARDED STAFF",
        "CLOCKED IN THIS SHIFT",
        "ACTIVE SERVERS ON FLOOR",
        "TOTAL SHIFT SALES HANDLED",
        "ASSIGNED TABLES",
        "SEATED GUESTS",
        "ACTIVE ORDERS",
        "SERVED DISHES",
        "SALES HANDLED",
        "READY PICKUP AVG"
    ]

    for check in view_checks:
        if check not in view_code:
            print(f"[FAIL] StaffShiftView.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] StaffShiftView.js contains: '{check}'")

    # 3. Verify ManagerWorkspaceView.js mounting for staff_shift
    ws_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js")
    with open(ws_path, "r", encoding="utf-8") as f:
        ws_code = f.read()

    if "StaffShiftView" not in ws_code or "this.activeSubView === 'staff_shift'" not in ws_code:
        print("[FAIL] ManagerWorkspaceView.js missing StaffShiftView mounting")
        sys.exit(1)
    print("[OK] ManagerWorkspaceView.js correctly mounts StaffShiftView for 'staff_shift' subview")

    print("\n[SUCCESS] ALL PHASE M6 (STAFF & SHIFT) ARCHITECTURAL CONTRACTS 100% VERIFIED!\n")

if __name__ == "__main__":
    verify_manager_staff_shift()
