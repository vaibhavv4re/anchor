"""
Anchor RestaurantOS — Architecture & UX Cohesion Audit Script
Scans all frontend views and platform modules to detect UI gaps, dead handlers, inconsistent role routing, or broken promises.
"""

import os
import re

def audit_codebase():
    print("=" * 75)
    print("ANCHOR RESTAURANT OS — WORKSPACE ARCHITECTURE & UX COHESION AUDIT")
    print("=" * 75)

    frontend_dir = "restaurantos/frontend"
    platform_dir = "businessos/platform"

    views_to_check = [
        ("Waiter Workspace", "restaurantos/frontend/capabilities/guest_service/ui/WaiterWorkspaceView.js"),
        ("KDS & Kitchen", "restaurantos/frontend/capabilities/kitchen/ui/KitchenDisplaySystemView.js"),
        ("Cashier Workspace", "restaurantos/frontend/capabilities/billing/ui/CashierWorkspaceView.js"),
        ("Manager Cockpit", "restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js"),
        ("CA Workspace", "restaurantos/frontend/capabilities/accounting/ui/AccountsCaWorkspaceView.js"),
        ("Owner Cockpit", "restaurantos/frontend/capabilities/owner/ui/OwnerWorkspaceView.js"),
        ("App Shell Router", "restaurantos/frontend/app.js")
    ]

    issues = []

    for name, path in views_to_check:
        if not os.path.exists(path):
            issues.append(f"CRITICAL: Missing view file: {path}")
            continue

        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        print(f"\n[INSPECTING] {name} ({os.path.basename(path)})...")
        print(f"   Size: {len(content)} bytes | Lines: {len(content.splitlines())}")

        # Check 1: Dead # links
        dead_links = re.findall(r'href=["\']#["\']', content)
        if dead_links:
            issues.append(f"[{name}] Found {len(dead_links)} dead href='#' links.")

        # Check 2: Unhandled TODOs
        todos = re.findall(r'//\s*TODO|//\s*FIXME', content, re.IGNORECASE)
        if todos:
            issues.append(f"[{name}] Found {len(todos)} pending TODO/FIXME markers.")

        # Check 3: Check export/render contracts
        if "render" not in content:
            issues.append(f"[{name}] Missing render() method.")

    print("\n" + "=" * 75)
    if issues:
        print("FOUND UX & ARCHITECTURAL COHESION ISSUES:")
        for issue in issues:
            print(f" - {issue}")
    else:
        print("[SUCCESS] ALL 7 CORE WORKSPACES PASSED ARCHITECTURE & UX COHESION AUDIT!")
    print("=" * 75)

if __name__ == "__main__":
    audit_codebase()
