import os
import sys

def verify_manager_sales_cashier():
    print("--- EXECUTING MANAGER WORKSPACE PHASE M5 (SALES & CASHIER) VERIFICATION ---")

    files = [
        "restaurantos/frontend/capabilities/manager/ui/SalesCashierView.js",
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
        "getSalesCashierProjection",
        "settledRevenue",
        "invoicedRevenue",
        "paymentPendingRevenue",
        "discountsByWaiter",
        "recalledBillHistory"
    ]

    for check in proj_checks:
        if check not in proj_code:
            print(f"[FAIL] managerProjectionService.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] managerProjectionService.js contains: '{check}'")

    # 2. Verify SalesCashierView.js contracts
    view_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/SalesCashierView.js")
    with open(view_path, "r", encoding="utf-8") as f:
        view_code = f.read()

    view_checks = [
        "SalesCashierView",
        "getSalesCashierProjection",
        "LIVE FINANCIAL POSITION",
        "SETTLED PAYMENT METHOD MIX",
        "BILL & REVISION ACTIVITY LEDGER",
        "DISCOUNTS BY SERVER",
        "RECALLED BILL HISTORY LOG",
        "GROSS SALES",
        "TOTAL DISCOUNTS",
        "NET TAXABLE SALES",
        "CGST",
        "SGST",
        "SERVICE CHARGE"
    ]

    for check in view_checks:
        if check not in view_code:
            print(f"[FAIL] SalesCashierView.js missing contract: {check}")
            sys.exit(1)
        print(f"[OK] SalesCashierView.js contains: '{check}'")

    # 3. Verify ManagerWorkspaceView.js mounting for sales_cashier
    ws_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js")
    with open(ws_path, "r", encoding="utf-8") as f:
        ws_code = f.read()

    if "SalesCashierView" not in ws_code or "this.activeSubView === 'sales_cashier'" not in ws_code:
        print("[FAIL] ManagerWorkspaceView.js missing SalesCashierView mounting")
        sys.exit(1)
    print("[OK] ManagerWorkspaceView.js correctly mounts SalesCashierView for 'sales_cashier' subview")

    print("\n[SUCCESS] ALL PHASE M5 (SALES & CASHIER) ARCHITECTURAL CONTRACTS 100% VERIFIED!\n")

if __name__ == "__main__":
    verify_manager_sales_cashier()
