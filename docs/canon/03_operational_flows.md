# 3. Operational Flows

Operational flows map real-world restaurant customer journeys to system events, workspace actions, offline queue behavior, and automated background side-effects.

---

## Flow 1: Guest Walk-in to Seating

```text
[Walk-in Guest] ──> [Host / Waiter] ──> [Select Table on Floor Map] ──> [Start Session]
```

* **User & Workspace:** Waiter / Host (`Waiter Workspace`)
* **Trigger:** Guest arrives and asks for a table.
* **System Actions:**
  1. Waiter taps table on visual Floor Map.
  2. Waiter enters party size and taps **Seat Guest**.
* **Events Published:** `GuestSeated`, `TableSessionStarted`
* **Automations:** Table state transitions from `Available` to `Occupied`.
* **Offline Behavior:** Table session created locally; synced instantly when connection resumes.

---

## Flow 2: Ordering to KOT/BOT Dispatch

```text
[Waiter] ──> [Order Builder] ──> [Add Items & Modifiers] ──> [Send Order]
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
[Food Items ──> KDS]     [Drink Items ──> BDS]
```

* **User & Workspace:** Waiter (`Waiter Workspace`)
* **Trigger:** Guests place food and beverage orders.
* **System Actions:**
  1. Waiter selects item categories, applies modifiers (e.g. "Less Spicy").
  2. Waiter taps **Send Order**.
* **Events Published:** `OrderCreated`, `KOTGenerated`, `BOTGenerated`
* **Automations:**
  * Food items routed to Kitchen Display System (KDS).
  * Drink items routed to Bar Display System (BDS).
  * Table state transitions to `Ordering`.
* **Notifications:** KDS & BDS sound chime and flash new queued items.

---

## Flow 3: Food/Drink Preparation & Automatic Inventory Deduction

```text
[Kitchen/Bar Staff] ──> [Mark Item "Preparing"] ──> [Mark Item "Ready"]
                                                            │
                                  ┌─────────────────────────┴─────────────────────────┐
                                  ▼                                                   ▼
                    [Auto Stock Movement Generated]                    [Notification Sent to Waiter]
                                  │
                                  ▼
                    [Menu Availability Recalculated]
```

* **User & Workspace:** Chef (`Kitchen Workspace`) / Bartender (`Bar Workspace`)
* **Trigger:** Kitchen/Bar receives ticket item on KDS/BDS.
* **System Actions:**
  1. Chef taps item to change state from `Queued` to `Preparing`.
  2. Chef finishes cooking and taps item to change state to `Ready`.
* **Events Published:** `OrderItemPreparing`, `OrderItemReady`, `InventoryConsumed`
* **Automations (The Zero-Manual-Action Principle):**
  * Production engine looks up item recipe/production spec.
  * Ingredient inventory deducted automatically.
  * Inventory ledger updated.
  * Stock count checked against safety thresholds; if ingredient exhausted, item menu status updated to *Out of Stock* automatically.
  * Waiter receives notification: *"Table 4: Butter Chicken Ready"*.

---

## Flow 4: Billing to Payment & Automatic Table Closing

```text
[Waiter/Guest] ──> [Generate Bill] ──> [Print Receipt & Dynamic QR]
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
         [Guest Scans QR & Pays]                               [Cashier Accepts Cash/Card]
                    │                                                   │
                    └─────────────────────────┬─────────────────────────┘
                                              ▼
                                   [Razorpay Webhook / Paid]
                                              │
                                              ▼
                                 [Table Auto-Closed & Reset]
```

* **User & Workspace:** Waiter / Cashier (`Waiter Workspace` / `Cashier Workspace`)
* **Trigger:** Guest requests bill.
* **System Actions:**
  1. Waiter taps **Generate Bill**.
  2. System prints receipt via ESC/POS printer with dynamic UPI QR code.
  3. Guest scans QR code or pays via Cash/Card at Cashier.
* **Events Published:** `BillGenerated`, `PaymentReceived`, `TableClosed`
* **Automations:**
  * Razorpay webhook receives transaction confirmation OR Cashier confirms Cash/Card payment.
  * Payment linked to Bill ID.
  * Table session terminated; table state transitions to `Cleaning` (then `Available`).

---

## Flow 5: Employee Shift Attendance

```text
[Employee] ──> [Enter 6-Digit PIN] ──> [Authenticated & Auto Clocked-In]
                                                    │
                                                    ▼
                                           [Workspace Opened]
                                                    │
                                                    ▼
                                          [Logout / Idle Lock]
                                                    │
                                                    ▼
                                            [Auto Clocked-Out]
```

* **User & Workspace:** All Staff (All Workspaces)
* **Trigger:** Employee approaches terminal.
* **System Actions:**
  1. Employee inputs unique 6-digit PIN.
  2. System validates PIN and checks current active shift.
* **Events Published:** `EmployeeClockedIn`, `EmployeeClockedOut`
* **Automations:**
  * Attendance record created automatically upon login.
  * Workspace tailored to employee role loaded immediately.
  * Shift clock-out generated automatically upon logout.
