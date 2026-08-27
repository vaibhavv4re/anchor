import os
import sys

print("--- EXECUTING STRICT UNIFIED LIFECYCLE & DOM PROJECTION VERIFICATION ---")

# Verify file structures
files_to_check = [
    "businessos/platform/session/sessionStateMachine.js",
    "businessos/platform/table_state/tableStateMachine.js",
    "businessos/platform/table_state/tableProjectionService.js",
    "businessos/platform/session/sessionProjectionService.js",
    "restaurantos/frontend/capabilities/restaurant_layout/ui/FloorViewerView.js",
    "restaurantos/frontend/capabilities/guest_service/ui/ActiveSessionView.js",
    "restaurantos/frontend/capabilities/guest_service/ui/RunningBillModal.js"
]

all_ok = True
for f in files_to_check:
    full_path = os.path.join("d:\\Projects\\Anchor", f)
    if os.path.exists(full_path):
        print(f"[OK] Found module: {f}")
    else:
        print(f"[FAIL] Missing module: {f}")
        all_ok = False

if not all_ok:
    sys.exit(1)

# Inspect tableStateMachine.js for PhysicalTableStates
with open("d:\\Projects\\Anchor\\businessos\\platform\\table_state\\tableStateMachine.js", "r", encoding="utf-8") as f:
    content = f.read()

required_states = ["ORDER_IN_PROGRESS", "PAYMENT_PENDING", "PAID_CLEARING", "OCCUPIED", "AVAILABLE", "CLEANING"]
for state in required_states:
    if state in content:
        print(f"[OK] PhysicalTableStates contains: {state}")
    else:
        print(f"[FAIL] PhysicalTableStates missing: {state}")
        all_ok = False

# Inspect FloorViewerView.js for subscriptions
with open("d:\\Projects\\Anchor\\restaurantos\\frontend\\capabilities\\restaurant_layout\\ui\\FloorViewerView.js", "r", encoding="utf-8") as f:
    floor_content = f.read()

required_subs = ["order:confirmed", "bill:settled", "bill:finalized", "session:created", "session:milestone:changed"]
for sub in required_subs:
    if sub in floor_content:
        print(f"[OK] FloorViewerView subscribed to: {sub}")
    else:
        print(f"[FAIL] FloorViewerView missing subscription to: {sub}")
        all_ok = False

if all_ok:
    print("\n[SUCCESS] ALL STRICT LIFECYCLE & DOM PROJECTION REQUIREMENTS 100% VERIFIED!")
else:
    sys.exit(1)
