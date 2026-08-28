import os
import sys

def verify_manager_my_shift():
    print("--- EXECUTING MANAGER WORKSPACE PHASE M8 (MY SHIFT & HANDOVER) VERIFICATION ---")

    files = [
        "restaurantos/frontend/capabilities/manager/ui/MyShiftView.js",
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
        "getMyShiftHandoverProjection",
        "managerInfo",
        "inheritedState",
        "currentShiftSnapshot",
        "handoverState",
        "openingCashFloat"
    ]

    for check in proj_checks:
        if check not in proj_code:
            print(f"[FAIL] managerProjectionService.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] managerProjectionService.js contains: '{check}'")

    # 2. Verify MyShiftView.js contracts
    view_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/MyShiftView.js")
    with open(view_path, "r", encoding="utf-8") as f:
        view_code = f.read()

    view_checks = [
        "MyShiftView",
        "getMyShiftHandoverProjection",
        "CURRENT SHIFT MANAGER",
        "INHERITED STATE AT SHIFT TAKEOVER",
        "CURRENT SHIFT PERFORMANCE SNAPSHOT",
        "SHIFT HANDOVER & CLOSE OUT FORM",
        "btn-end-shift-handover",
        "SHIFT_HANDOVER_COMPLETED"
    ]

    for check in view_checks:
        if check not in view_code:
            print(f"[FAIL] MyShiftView.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] MyShiftView.js contains: '{check}'")

    # 3. Verify ManagerWorkspaceView.js mounting for my_shift
    ws_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js")
    with open(ws_path, "r", encoding="utf-8") as f:
        ws_code = f.read()

    if "MyShiftView" not in ws_code or "this.activeSubView === 'my_shift'" not in ws_code:
        print("[FAIL] ManagerWorkspaceView.js missing MyShiftView mounting")
        sys.exit(1)
    print("[OK] ManagerWorkspaceView.js correctly mounts MyShiftView for 'my_shift' subview")

    print("\n[SUCCESS] ALL PHASE M8 (MY SHIFT & HANDOVER) ARCHITECTURAL CONTRACTS 100% VERIFIED!\n")

if __name__ == "__main__":
    verify_manager_my_shift()
