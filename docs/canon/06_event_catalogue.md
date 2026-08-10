# 6. Event Catalogue

The Event Catalogue lists all domain events published by the Event Bus within RestaurantOS. Each event specifies its publisher, subscribers, and automated side effects.

---

## Registry of Events

| Event Name | Publisher Domain | Primary Subscribers | Automated Side Effects |
| :--- | :--- | :--- | :--- |
| `EmployeeClockedIn` | Auth & Identity | Attendance Engine, Manager Workspace | Logs active shift; opens user-specific workspace. |
| `EmployeeClockedOut` | Auth & Identity | Attendance Engine, Manager Workspace | Closes active attendance record; locks session. |
| `GuestSeated` | Front of House | Table Engine, Waiter Workspace | Sets table state to `Occupied`; opens TableSession. |
| `OrderCreated` | Front of House | Ordering Engine, KDS, BDS, Audit Log | Generates KOT/BOT tickets; updates table state to `Ordering`. |
| `OrderModified` | Front of House | Ordering Engine, KDS, BDS | Updates ticket queued items; logs edit audit. |
| `KOTGenerated` | Ordering Engine | KDS (Kitchen Display System) | Displays new ticket card on Kitchen Queue; plays audio chime. |
| `BOTGenerated` | Ordering Engine | BDS (Bar Display System) | Displays new ticket card on Bar Queue; plays audio chime. |
| `OrderItemPreparing` | Production Engine | Waiter Workspace, Manager Floor | Updates item badge on Waiter Dashboard. |
| `OrderItemReady` | Production Engine | Inventory Engine, Waiter Workspace | **Auto stock movement generated; ingredient inventory deducted**; Waiter receives push notification: *"Item Ready"*. |
| `InventoryConsumed` | Inventory Engine | Menu Availability Engine, Manager Workspace | Recalculates recipe ingredient availability; sets out-of-stock items to unavailable. |
| `BillGenerated` | Billing Engine | Payment Engine, POS Printer, Cashier | Generates dynamic UPI QR; triggers receipt print job. |
| `PaymentReceived` | Payment Engine | Billing Engine, Table Engine, Audit Log | Marks Bill as `Paid`; **automatically closes TableSession and updates table to `Cleaning`**. |
| `TableClosed` | Table Engine | Floor Map, Manager Dashboard | Resets table state to `Available`; updates daily session KPIs. |
| `StockLevelBelowThreshold` | Inventory Engine | Inventory Workspace, Manager Workspace | Triggers alert badge; drafts suggested Purchase Order. |
| `PurchaseOrderReceived` | Purchasing Engine | Inventory Ledger, Finance Engine | Increases ingredient stock counts; updates unit cost ledger. |
