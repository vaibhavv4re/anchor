# Phase 0.4: Automation Matrix ⭐

The Automation Matrix enforces the core philosophy: *"If an employee has to remember to perform a software action after completing a real-world action, we've designed it wrong."*

---

## Complete Register of System Automations

| Trigger Event | Automated Action (Zero Manual Interaction) | Executing Engine |
| :--- | :--- | :--- |
| **Employee Login (PIN Entered)** | System automatically logs clock-in timestamp and creates active attendance entry. | Attendance Engine |
| **Employee Logout / Session Lock** | System automatically logs clock-out timestamp and closes attendance shift log. | Attendance Engine |
| **Order Confirmed by Waiter** | System automatically splits order into KOT & BOT and routes to respective Kitchen/Bar display queues. | Ordering Engine |
| **Order Item Marked `Ready`** | System automatically loads recipe spec, deducts ingredient stock, and writes to inventory ledger. | Production & Inventory Engine |
| **Ingredient Inventory Updated** | System automatically recalculates recipe yields; if stock hit 0, menu item marked *Unavailable* on Waiter POS. | Menu Availability Engine |
| **Bill Generated** | System automatically computes taxes/discounts, renders dynamic UPI QR, and sends print payload to ESC/POS printer. | Billing & Printing Engine |
| **Razorpay Webhook Fires** | System automatically links transaction ID to Bill, updates Bill status to `PAID`, and issues e-receipt. | Payment Engine |
| **Bill Status Becomes `PAID`** | System automatically terminates TableSession, updates Table state to `CLEANING`, and triggers prompt. | Table Engine |
| **Table Cleaning Confirmed** | System automatically resets table state to `AVAILABLE` on Live Floor Map. | Table Engine |
| **Stock Drops Below Safety Threshold** | System automatically triggers alert badge and drafts suggested Purchase Order using catalogue prices. | Purchasing Engine |
