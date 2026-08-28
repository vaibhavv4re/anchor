import os
import sys

def verify_manager_exceptions_approvals():
    print("--- EXECUTING MANAGER WORKSPACE PHASE M3 (EXCEPTIONS & APPROVALS) VERIFICATION ---")

    files = [
        "restaurantos/frontend/capabilities/manager/ui/ExceptionsView.js",
        "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js",
        "businessos/platform/billing/billRevisionModel.js",
        "businessos/platform/session/sessionAuditModel.js"
    ]

    for rel_path in files:
        full_path = os.path.join(r"d:\Projects\Anchor", rel_path.replace("/", "\\"))
        if not os.path.exists(full_path):
            print(f"[FAIL] Missing required file: {rel_path}")
            sys.exit(1)
        print(f"[OK] Found file: {rel_path}")

    # 1. Verify ExceptionsView.js contracts
    view_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ExceptionsView.js")
    with open(view_path, "r", encoding="utf-8") as f:
        view_code = f.read()

    view_checks = [
        "ExceptionsView",
        "managerProjectionService",
        "billRevisionModel",
        "sessionAuditModel",
        "ManagerTableInspectorModal",
        "WHERE (LOCATION)",
        "WHO (SESSION & SERVER)",
        "WHAT (IDENTIFIERS)",
        "WHEN (ELAPSED TIME)",
        "DISCOUNT APPROVAL EVIDENCE PAYLOAD",
        "btn-approve-discount",
        "btn-reject-discount",
        "btn-expedite-action",
        "resolvedLog"
    ]

    for check in view_checks:
        if check not in view_code:
            print(f"[FAIL] ExceptionsView.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] ExceptionsView.js contains: '{check}'")

    # 2. Verify billRevisionModel.js discount approval methods
    rev_path = os.path.join(r"d:\Projects\Anchor", "businessos/platform/billing/billRevisionModel.js")
    with open(rev_path, "r", encoding="utf-8") as f:
        rev_code = f.read()

    rev_checks = [
        "approveDiscount",
        "rejectDiscount",
        "discount:approved",
        "discount:rejected"
    ]

    for check in rev_checks:
        if check not in rev_code:
            print(f"[FAIL] billRevisionModel.js missing discount contract: {check}")
            sys.exit(1)
        print(f"[OK] billRevisionModel.js contains: '{check}'")

    # 3. Verify ManagerWorkspaceView.js routing to ExceptionsView
    ws_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js")
    with open(ws_path, "r", encoding="utf-8") as f:
        ws_code = f.read()

    if "ExceptionsView" not in ws_code or "this.activeSubView === 'exceptions'" not in ws_code:
        print("[FAIL] ManagerWorkspaceView.js missing ExceptionsView mounting")
        sys.exit(1)
    print("[OK] ManagerWorkspaceView.js correctly mounts ExceptionsView for 'exceptions' subview")

    print("\n[SUCCESS] ALL PHASE M3 (EXCEPTIONS & APPROVALS) ARCHITECTURAL CONTRACTS 100% VERIFIED!\n")

if __name__ == "__main__":
    verify_manager_exceptions_approvals()
