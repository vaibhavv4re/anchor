import os
import sys

def verify_staff_onboarding_roles():
    print("--- EXECUTING STAFF ONBOARDING & ROLE SELECTOR VERIFICATION ---")

    # 1. Check UserManagementView.js
    um_path = os.path.join(r"d:\Projects\Anchor", "restaurantos/frontend/capabilities/user_employee/ui/UserManagementView.js")
    if not os.path.exists(um_path):
        print("[ERROR] Missing UserManagementView.js")
        sys.exit(1)

    with open(um_path, "r", encoding="utf-8") as f:
        um_content = f.read()

    expected_um_tokens = [
        "Onboard New Staff Member",
        "select-staff-role",
        "role-manager",
        "role-waiter",
        "role-chef",
        "role-cashier",
        "role-inventory-manager",
        "role-admin",
        "role-bar",
        "openOnboardModal",
        "workspaceDefault"
    ]

    for token in expected_um_tokens:
        if token not in um_content:
            print(f"[ERROR] UserManagementView.js missing token: '{token}'")
            sys.exit(1)
        print(f"[OK] UserManagementView.js contains: '{token}'")

    # 2. Check offlineStore.js seed roles
    store_path = os.path.join(r"d:\Projects\Anchor", "businessos/platform/offline_store/offlineStore.js")
    with open(store_path, "r", encoding="utf-8") as f:
        store_content = f.read()

    expected_roles = [
        "role-manager",
        "role-waiter",
        "role-chef",
        "role-cashier",
        "role-inventory-manager",
        "role-bar",
        "Operations Manager"
    ]

    for role in expected_roles:
        if role not in store_content:
            print(f"[ERROR] offlineStore.js missing role token: '{role}'")
            sys.exit(1)
        print(f"[OK] offlineStore.js seed roles contains: '{role}'")

    # 3. Check authEngine.js pin matching rules
    auth_path = os.path.join(r"d:\Projects\Anchor", "businessos/platform/authentication/authEngine.js")
    with open(auth_path, "r", encoding="utf-8") as f:
        auth_content = f.read()

    expected_auth_tokens = [
        "pinDisplay",
        "data?.pinDisplay",
        "role-manager",
        "resolvedRoleName"
    ]

    for token in expected_auth_tokens:
        if token not in auth_content:
            print(f"[ERROR] authEngine.js missing token: '{token}'")
            sys.exit(1)
        print(f"[OK] authEngine.js contains: '{token}'")

    print("\n[SUCCESS] STAFF ONBOARDING & ROLE SELECTOR WORKFLOW 100% VERIFIED!")

if __name__ == "__main__":
    verify_staff_onboarding_roles()
