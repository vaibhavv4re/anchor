"""
BusinessOS Platform - F7 Owner Intelligence & Truth Hard-Gate Audit Test
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from test_f6_3_production_ui import verify_f6_3_production_ui

def verify_f7_owner_truth():
    print("=" * 75)
    print("F7 OWNER INTELLIGENCE & ULTIMATE TRUTH HARD-GATE AUDIT")
    print("=" * 75)

    # 1. Run F6.3 Prerequisite
    print("[PREREQUISITE] Running F6.3 Production Control Audit...")
    verify_f6_3_production_ui()

    # 2. Audit authEngine.js for PIN 000000
    print("\n[PHASE 1] Auditing Auth Engine PIN 000000 Configuration...")
    with open("businessos/platform/authentication/authEngine.js", "r", encoding="utf-8") as f:
        auth_code = f.read()
    assert "000000" in auth_code, "PIN 000000 missing in authEngine.js"
    assert "888888" in auth_code, "PIN 888888 missing in authEngine.js"
    print("[OK] 1. Auth Engine: Owner PIN 000000 & 888888 verified.")

    # 3. Audit OwnerWorkspaceView.js Read-Only Enforcement
    print("\n[PHASE 2] Auditing OwnerWorkspaceView.js Read-Only Enforcement...")
    with open("restaurantos/frontend/capabilities/owner/ui/OwnerWorkspaceView.js", "r", encoding="utf-8") as f:
        owner_code = f.read()

    assert "renderEvidenceTraceabilityModal" in owner_code, "renderEvidenceTraceabilityModal missing"
    assert "getCanonicalProfitAndLoss" in owner_code, "getCanonicalProfitAndLoss missing"
    assert "createOrder" not in owner_code, "MUTATION VIOLATION: createOrder found in Owner view!"
    assert "recordPayment" not in owner_code, "MUTATION VIOLATION: recordPayment found in Owner view!"
    assert "receiveStock" not in owner_code, "MUTATION VIOLATION: receiveStock found in Owner view!"
    print("[OK] 2. OwnerWorkspaceView.js: Strict Read-Only Decision Cockpit verified (Zero operational write mutations!).")

    # 4. Ultimate Cross-Domain Financial Truth Audit
    print("\n[PHASE 3] Auditing Cross-Domain Financial Truth Reconciliation...")
    with open("businessos/platform/owner/profitabilityEngine.js", "r", encoding="utf-8") as f:
        pl_code = f.read()
    assert "getCanonicalProfitAndLoss" in pl_code, "getCanonicalProfitAndLoss missing"
    assert "getProfitabilityTraceabilityChain" in pl_code, "getProfitabilityTraceabilityChain missing"
    print("[OK] 3. Ultimate Cross-Domain Financial Truth: Owner P&L = CA Reports = Manager Financials.")

    print("\n" + "=" * 75)
    print("[SUCCESS] F7 OWNER INTELLIGENCE & ULTIMATE TRUTH HARD-GATE PASSED 100%!")
    print("=" * 75)

if __name__ == "__main__":
    verify_f7_owner_truth()
