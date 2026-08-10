# Phase 0.3: Event Responsibility Matrix

Defines explicit publisher and consumer subscriptions for all domain events across workspaces and engines.

---

## Matrix

| Event Name | Published By | Consumed By (Reacts) | Ignored By |
| :--- | :--- | :--- | :--- |
| `EmployeeClockedIn` | Auth System | Attendance Engine, Manager Workspace | Kitchen, Bar, Cashier |
| `EmployeeClockedOut` | Auth System | Attendance Engine, Manager Workspace | Kitchen, Bar, Cashier |
| `GuestSeated` | Waiter Workspace | Table Engine, Floor Map, Manager Workspace | Kitchen, Bar, Purchasing |
| `OrderCreated` | Waiter Workspace | Ordering Engine, KDS, BDS, Audit Log | Purchasing |
| `KOTGenerated` | Ordering Engine | KDS (Kitchen Display System) | Cashier, Bar |
| `BOTGenerated` | Ordering Engine | BDS (Bar Display System) | Cashier, Kitchen |
| `OrderItemPreparing` | KDS / BDS | Waiter Dashboard, Manager Live Floor | Cashier, Purchasing |
| `OrderItemReady` | KDS / BDS | **Inventory Engine**, Waiter Workspace, Manager Workspace | Cashier |
| `InventoryConsumed` | Inventory Engine | Menu Availability Engine, Manager Workspace | Front of House (Direct UI) |
| `BillGenerated` | Waiter / Billing | POS Printer, Dynamic QR Engine, Cashier Workspace | Kitchen, Bar |
| `PaymentReceived` | Cashier / Razorpay | Billing Engine, **Table Engine**, Manager Workspace | Kitchen, Bar |
| `TableClosed` | Table Engine | Floor Map, Manager Dashboard, Cleaning Staff | Kitchen, Bar |
| `StockLevelBelowThreshold` | Inventory Engine | Inventory Workspace, Purchasing Engine, Manager | Front of House |
| `PurchaseOrderReceived` | Store / Inventory | Inventory Ledger, Finance Engine, Manager Workspace | Front of House, Kitchen |
