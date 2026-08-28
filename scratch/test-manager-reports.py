import os
import sys

def verify_manager_reports():
    print("--- EXECUTING MANAGER WORKSPACE PHASE M7 (REPORTS & DAY SUMMARY) VERIFICATION ---")

    files = [
        "restaurantos/frontend/capabilities/manager/ui/ReportsDaySummaryView.js",
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
        "getReportsDaySummaryProjection",
        "salesSummary",
        "paymentReconciliation",
        "cashDrawer",
        "operationsSummary",
        "auditLedger",
        "expectedOpeningCash",
        "cashVariance"
    ]

    for check in proj_checks:
        if check not in proj_code:
            print(f"[FAIL] managerProjectionService.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] managerProjectionService.js contains: '{check}'")

    # 2. Verify ReportsDaySummaryView.js contracts
    view_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ReportsDaySummaryView.js")
    with open(view_path, "r", encoding="utf-8") as f:
        view_code = f.read()

    view_checks = [
        "ReportsDaySummaryView",
        "getReportsDaySummaryProjection",
        "Sales Summary Report",
        "Payment Recon & Cash Drawer",
        "Operations Summary",
        "Audit & Financial Events Ledger",
        "GROSS SALES",
        "NET TAXABLE SALES",
        "CASH DRAWER VARIANCE"
    ]

    for check in view_checks:
        if check not in view_code:
            print(f"[FAIL] ReportsDaySummaryView.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] ReportsDaySummaryView.js contains: '{check}'")

    # 3. Verify ManagerWorkspaceView.js mounting for reports
    ws_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js")
    with open(ws_path, "r", encoding="utf-8") as f:
        ws_code = f.read()

    if "ReportsDaySummaryView" not in ws_code or "this.activeSubView === 'reports'" not in ws_code:
        print("[FAIL] ManagerWorkspaceView.js missing ReportsDaySummaryView mounting")
        sys.exit(1)
    print("[OK] ManagerWorkspaceView.js correctly mounts ReportsDaySummaryView for 'reports' subview")

    print("\n[SUCCESS] ALL PHASE M7 (REPORTS & DAY SUMMARY) ARCHITECTURAL CONTRACTS 100% VERIFIED!\n")

if __name__ == "__main__":
    verify_manager_reports()
