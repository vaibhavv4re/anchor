# RestaurantOS v1.0 Master Blueprint

> **Guiding Philosophy**  
> **RestaurantOS should feel invisible. Employees should focus on serving customers, not operating software.**

> **Core Engineering Philosophy**  
> **Every feature should remove work from the restaurant, not add work to the staff.**

---

## Core Rule & Litmus Test

> **If an employee has to remember to perform a software action after completing a real-world action, we've designed it wrong.**

### Examples
* **Chef marks an item Ready** → inventory updates automatically.
* **Waiter generates a bill** → QR and print happen automatically.
* **Cashier records payment** → table closes automatically.
* **Employee logs in** → clock-in happens automatically.
* **Employee logs out** → clock-out happens automatically.

---

## Product Vision

RestaurantOS is an **offline-first, real-time Restaurant Operating System** for a **single-location restaurant**.

The system manages the complete operational lifecycle of a restaurant from opening to closing while automating repetitive tasks.

---

## Guiding Principles

1. **Single Location First** (v1.0)
2. **Offline First**
3. **Real-Time Synchronization**
4. **Touch First**
5. **One Authentication System**
6. **Role-Based Experiences**
7. **Event Driven**
8. **Automatic Where Possible**
9. **Simple over Clever**
10. **Every screen answers one operational question**
11. **Unified State Projections (PD-006):** Every workspace is a projection of the same unified restaurant state. No workspace owns duplicated business data.
12. **Layout vs Runtime Separation (PD-007):** Physical restaurant layout is static configuration; operational state is dynamic runtime. Configuration never owns runtime state.
13. **Assets vs Operational Context Separation (PD-008):** The table is a physical asset. The Table Session is the operational context. Operational data belongs to the session, not the table.
14. **Read-First Situational Awareness (PD-009):** The Floor Viewer is read-first and action-second. Every interaction begins with situational awareness before workflow execution.
15. **Automatic Production Routing (PD-010):** Production routing is automatic. Waiters never choose whether an item goes to Kitchen or Bar. The Production Engine determines routing from the menu item's production specification.
16. **Scenario-Driven Product Playbooks (PD-011):** Progress is measured by working, role-switchable restaurant journeys and playbooks (Setup, Service, Production, Payment) rather than isolated platform capabilities. Every capability must feature an immediate, touch-first UI experience.
17. **Domain Workspace Data Ownership (PD-012):** Workspaces own their operational data. Kitchen owns food menu & food recipes, Bar owns drinks menu & drink recipes, Inventory owns stock. Setup Assistant configures shared infrastructure only.
18. **Guided Operations Launcher & Explore Mode (PD-013):** Setup Assistant is a guided launcher into the OS. Completing infrastructure setup lands on the Admin Home Dashboard with classified setup progress checklist (Infrastructure, Operations, Service), workspace deep-links (`Create Menu →`), and instant Explore Mode ("Explore RestaurantOS") access.
19. **Progressive Restaurant Onboarding (PD-014):** RestaurantOS supports progressive onboarding. A restaurant may begin operations with the minimum required configuration (Required: Profile, Tables, Users, 1 Waiter, 1 Chef, 1 Menu Item, 1 ProdSpec) while continuing to configure advanced operational capabilities over time.
20. **Role-by-Role Workspace Onboarding & Real CRUD Execution (PD-015):** Restaurant commissioning proceeds role-by-role. Super Admin creates tenant, Admin prepares shared infrastructure checklist, and department heads (Chef, Bartender, Inventory Manager, Cashier) perform real CRUD setup inside their own workspaces with cross-workspace dependency alerts.
21. **Restaurant Commissioning Engine & Operational Readiness (PD-016):** Core platform capability managing operational readiness, item dependencies, and go-live validation (`Restaurant Ready for Service`). Replaces static percentages with actionable business statuses (`READY`, `ATTENTION_REQUIRED`, `NOT_CONFIGURED`), exact missing item checklists, and Admin Command Center alerts ("Things Requiring Attention").
22. **Card 1 Business Profile & Preferences Contract (PD-017):** Card 1 defines business identity and operational preferences across 9 frozen sections (Business Identity, Contact Information, Structured Address, Compliance & Licences, Regional Settings, Branding, Business Preferences, Billing Defaults, Receipt Defaults) with independent section save states, clean structural separation between Business Profile vs. Operational Preferences, and 3-state section completion tracking (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETE`).
23. **Stable Foundation Principle (PD-017A):** Card 1 contains only data that changes infrequently (business identity, legal compliance, branding tokens, regional settings, business preferences, billing & receipt defaults). Frequently changing operational settings (such as business operating hours, shifts, service periods, and staffing) belong to dedicated operational configuration modules (e.g. "Business Operations").
24. **Admin Workspace Navigation & Boundary Lockdown (PD-018):** Admin Workspace navigation is strictly dedicated to administrative control (`🏠 Dashboard`, `⚙ Configuration` sub-menu group with 6 cards, `📊 Commissioning Control Tower`, `📋 Audit Log`, `🔒 Logout`). Operational views (Floor Map, Kitchen KDS, Bar BDS, Master Inventory, Cashier Billing) are strictly excluded from Admin navigation and accessible only when logged in under their respective department head roles (Chef, Bartender, Inventory Manager, Cashier, Waiter).
25. **Card 2 Dining Areas Contract (PD-019):** Card 2 defines physical dining zones (Main Hall, Outdoor, Bar, VIP, Rooftop, Private, Waiting Area, Takeaway Pickup) and owns area identity, area code, area type, expected guest capacity, service availability, operating hour overrides, system preset colors, icons, features, and operational notes. Card 2 does not own individual tables or runtime session data, and acts as the strict prerequisite for Card 3 (Dining Tables).
26. **Archive-First Configuration Principle (PD-019A):** System configuration entities (Dining Areas, Tables, Menu Items, Inventory Items, Suppliers, Staff Accounts, Devices/Printers) must never be permanently deleted from the database. Instead, entities support status states (`ACTIVE`, `INACTIVE`, `ARCHIVED`) with `Archive` and `Restore` operations. Archiving is blocked if downstream dependent entities exist (e.g. cannot archive a Dining Area if tables are assigned to it).
27. **Domain Data Separation & Operational Status Engine (PD-019B):** Parent configuration entities must never duplicate or hardcode child entity counts or capacities (e.g., Card 2 Dining Area record must never store `tableCount` or `capacity`). All child metrics are dynamically projected from Card 3 (`tables_master`) at runtime. Card 2 owns zone identity, operational status (`OPEN`, `CLOSED`, `MAINTENANCE`, `ARCHIVED`) with closure reasons, reservation policy (`Allowed`, `Walk-in Only`, `Reservation Only`), service modes (`Dine In`, `Takeaway Pickup`, `Waiting`, `Bar Service`, `Private Dining`), expandable smart IoT schema, read-only live metrics, and audit timelines.
28. **Physical Asset Separation & Table Definition Contract (PD-020):** Tables are permanent physical assets defined in Card 3. Card 3 owns table identity, area code formatting (e.g. `MH-T12`), parent area linking, physical geometry (shape, min/max seats, mergeable, wheelchair accessibility), layout grid coordinates (X, Y, W, H, rotation), operational attributes, hardware printer routing, and self-ordering QR tokens. Tables NEVER own runtime operational state (Occupied, Reserved, Active Order, Bill, Session status), which is strictly projected from Table Sessions.
29. **Physical Assets Never Route Work (PD-021):** Physical dining assets define where guests can sit. Operational workflows such as production routing, thermal printer selection, billing settlement, and kitchen dispatch must never be owned by a dining asset. Tables own asset classification (Table, Booth, Bar Counter, Private Room), recommended/maximum capacity, merge rules, layout grid coordinates (X, Y, W, H, rotation, layer), categorized operational attributes, and QR-enabled toggles.
30. **Identity vs Employment & Access Separation Contract (PD-022):** Card 4 ("Staff & Access") manages operational staff identity and workspace access permissions. Authentication identifies *who* the person is (auto-generated `EMP-00015` ID & 6-digit PIN). Employment defines *what* they do (primary role tile, secondary roles). Roles define *what they can access* (visual experience preview panel). These three concepts are strictly decoupled so that staff role transitions (e.g. Waiter promoted to Manager) update role assignments without mutating PIN identity or losing historical audit logs. HR hierarchy (`Department`, `Reports To`), attendance, payroll, and fake pre-seeded staff data are strictly removed from Card 4.
31. **Default Operational Role Templates & 3-Step Staff Wizard (PD-023):** Roles define a default operational workspace experience. Workspace access permissions are automatically inherited from role templates (e.g., selecting `Chef` automatically assigns Kitchen KDS, Food Recipes, Food Menu, and Item Ready status out-of-the-box). Individual permission overrides are exceptional and optional. Staff onboarding uses a fast 3-step wizard (Identity $\rightarrow$ PIN & Security $\rightarrow$ Role Template & Visual Experience Preview) with a 1-click random PIN generator (`[🎲 Generate PIN]`).
32. **Master Product Catalog & ERP Hierarchy Contract (PD-024):** Inventory is the Master Product Catalog of the restaurant. Kitchen and Bar workspaces never create raw ingredients; they consume master inventory items via Production Recipes (Bill of Materials - BOM). Semi-finished batch preparations (signature masalas, gravies, stocks, dips) exist as inventory assets with their own production BOMs. Menu items link to Production Recipes, establishing a strict ERP hierarchy: `Inventory Master → Production Recipes (BOM) → Menu Catalog → Customer Orders → Automated Inventory Deduction`.
33. **3-Template Excel Bulk Import Architecture (PD-025):** Restaurant onboarding supports 3 canonical Excel/CSV import templates: 1) Inventory Master Import (Raw Materials, Semi-Finished Batch Preps, Packaging, Consumables), 2) Production Recipe BOM Import (Base Sauces, Masalas, Dish Recipes), and 3) Menu Catalog Import (Categories, Prices, Taxes, Recipe Links, Production Routing).
34. **ERP-Style Master Data Platform & Phased Milestone Architecture (PD-026):** Inventory is built as an enterprise ERP Master Data platform across 5 distinct milestone phases (Milestone 1: Inventory Foundation & Master Data, Milestone 2: Production Recipes, Milestone 3: Menu Engineering, Milestone 4: Warehouse Operations, Milestone 5: Kitchen Operations & Deductions).
35. **5-Pack Coastal Bistro Import Dataset & Pre-Import Review Engine (PD-027):** Includes 5 pre-built Coastal Bistro import packs (`Inventory_Master.csv`, `Production_Recipes.csv`, `Menu_Items.csv`, `Suppliers.csv`, `Opening_Stock.csv`) derived directly from the restaurant menu. Imports NEVER write directly to the database; they pass through an interactive **Pre-Import Review Screen** (showing Valid Items, Error Warnings, Duplicate Codes) with a 1-click **"🚀 Load Sample Coastal Bistro Dataset"** launcher.
36. **Master Data Import Specification (CANON-11) & Enforced Import Sequence (PD-028):** Master data import adheres to CANON-11 (`docs/canon/11_master_data_import_specification.md`). The import engine enforces a strict 6-step sequential dependency order: `Categories → UOMs → Storage Locations → Suppliers → Inventory Master → Opening Stock`. Inventory Item Types support 8 operational classifications (`Raw Material`, `Semi Finished`, `Finished Good`, `Packaging`, `Consumable`, `Cleaning Supply`, `Asset`, `Service Item`). Storage locations support a 3-tier hierarchy (`Warehouse → Store → Bin/Rack`).
37. **Smart Import Assistant & Enterprise Preview Engine (PD-029):** The import engine implements a 6-step enterprise ERP workflow: Upload $\rightarrow$ Mapping $\rightarrow$ Validation $\rightarrow$ Pre-Import Preview $\rightarrow$ Commit $\rightarrow$ Summary Log. If an import references missing categories or units, the **Smart Import Assistant** presents 3 interactive resolution choices: `Create Placeholders Automatically`, `Map to Existing Items`, or `Cancel Import`.
38. **Master Data Before Transactions Contract (PD-030):** No transactional workspace (Waiters, Cashiers, KDS/BDS, Kitchen line) may create master data. Inventory owns Items, Categories, UOMs, Suppliers, and Storage Locations. Kitchen owns Recipes. Menu Management owns Menu Items. Workspaces consume master data; if a required master item does not exist, the workspace raises a dependency request (`Request Inventory Item`). Production UI excludes dev sample buttons (`🚀 Load Sample Dataset` moves strictly to Dev Tools). Imports support step progress tracking (`Resumable Imports`) and 1-click `Import Rollback`.
39. **Dedicated Inventory Manager Workspace & Navigation Lockdown (PD-031):** Adheres strictly to PD-012 and PD-018. Master Inventory is completely removed from Admin Workspace navigation. Master Inventory belongs strictly to the **Inventory Manager Workspace** (`📦 INVENTORY WORKSPACE`, PIN `444444`). Admin navigation is strictly dedicated to administrative control (`🏠 Dashboard`, `⚙ Configuration`, `📊 Commissioning`, `📋 Audit Log`, `🔒 Logout`). The Inventory Workspace navigation is structured into 4 operational groups: `MASTER DATA` (Inventory, Categories, UOMs, Locations, Suppliers), `OPERATIONS` (Receipts, Issues, Transfers, Adjustments, Stock Count, Low Stock Alerts, Inventory Requests), `PROCUREMENT` (POs, Receiving), and `TOOLS` (Bulk Import, Export, Audit History, Settings). Inter-workspace item requests use **`✅ Inventory Requests`** as the official dependency bridge.
40. **Offline First & Cloud Synchronization Architecture (FROZEN PD-032):** Every operation executes locally first with 0ms user wait time. Cloud synchronization (Supabase / PostgreSQL) is asynchronous, background worker driven, and non-blocking. UI components interact strictly through typed Repositories (`InventoryRepository`, `SupplierRepository`, `TableRepository`, `StaffRepository`, `TenantRepository`, `RecipeRepository`, `OrderRepository`). Operations follow a 4-tier pipeline (`User Action → Command → Domain Event → Projection Update → Sync Job`). Every entity maintains standardized metadata (`id`, `tenantId`, `version`, `deviceId`, `createdBy`, `modifiedBy`, `correlationId`, `createdAt`, `modifiedAt`, `syncState`, `cloudVersion`, `deletedAt`) with a 6-state lifecycle (`LOCAL_ONLY`, `QUEUED`, `SYNCING`, `SYNCED`, `CONFLICT`, `ERROR`). Infrastructure sync jobs are tracked in the **Offline Journal** (`offlineJournal`) and managed via the **Developer Sync Console** (`dev-sync`).









---

## Core Platform

BusinessOS provides:
* Authentication
* Sync Engine
* CQRS
* Event Bus
* WebSocket Hub
* BusinessOS Design System
* Audit Logging
* Notification Engine
* Commissioning Engine ⭐ (PD-016)

RestaurantOS builds directly on top of BusinessOS.

---

## Authentication

### Super Admin
* Exists only once.
* Responsibilities:
  * Create Restaurant
  * Create Admin
  * Initial System Setup

### Admin
* Responsible for onboarding staff.
* Can create:
  * Manager
  * Waiter
  * Chef
  * Bartender
  * Cashier
  * Inventory Manager
  * Cleaning Staff
  * Owner

### Employee Login
Every employee gets:
* Employee ID
* Name
* Role
* Unique 6-digit PIN

#### Login Flow
```text
Enter PIN
   ↓
Authenticate
   ↓
Clock In?
   ↓
Workspace Opens
   ↓
Idle Lock
   ↓
Resume with PIN
   ↓
Logout
   ↓
Clock Out?
```

* Clock In / Clock Out is embedded into every workspace experience.
* No separate attendance module. Attendance is automatically derived from login/logout events.

---

## Restaurant Structure

```text
Restaurant
 ├── Dining Area
 │    └── Tables
 ├── Kitchen
 ├── Bar
 ├── Store
 ├── Cash Counter
 ├── Manager Office
 └── Administration
```

---

## Workspaces

### Configuration (First-time setup only)
* Restaurant Profile
* Tables
* Taxes
* Printers
* Payment Gateway
* Business Hours
* Shifts

### Admin
* Users
* Roles
* Permissions
* Devices
* Themes
* Audit Logs

### Waiter
* **Question:** *Which guest needs me now?*
* **Features:** Dashboard, Floor Map, Table Session, Order Builder, Billing, Notifications, Clock In / Out

### Kitchen (KDS)
* **Question:** *What should I cook next?*
* **Features:** Kitchen Queue, Active Items, Ready Items, Recipe Manager, Food Menu Manager, Clock In / Out

### Bar (BDS)
* **Question:** *What drink should I prepare?*
* **Features:** Drink Queue, Active Drinks, Ready Drinks, Beverage Menu, Drink Recipe Manager, Clock In / Out

### Cashier
* **Question:** *Which bills are waiting for payment?*
* **Features:** Pending Bills, Payment Processing, Refunds, Shift Closing, Clock In / Out

### Inventory
* **Question:** *What stock needs attention?*
* **Features:** Dashboard, Inventory Master, Suppliers, Supplier Catalogue, Purchase Orders, Goods Receiving, Transfers, Waste, Reservations, Stock Count, Reports, Clock In / Out

### Manager
* **Question:** *What needs my attention?*
* **Features:** Restaurant Health, Live Floor, Kitchen Summary, Inventory Summary, Action Center, Notifications, Timeline, Staff, Payments, Clock In / Out

### Owner
* **Question:** *How is my business performing?*
* **Features:** Revenue, Margins, Food Cost, Labour Cost, KPIs, Reports, Trends

---

## Core Business Engines

### Table Engine
* Tables
* Sessions
* Seating
* Reservations

### Ordering Engine
* Orders
* Order Items
* Modifiers
* KOT
* BOT

### Production Engine ⭐
*The heart of RestaurantOS.*
* Food Recipes
* Drink Recipes
* Preparation Specifications
* Inventory Consumption
* Availability Engine
* Yield
* Waste

### Billing Engine
* Bills
* Taxes
* Discounts
* Split Bills
* Service Charge

### Payment Engine
* **Supported:** Cash, UPI, Card
* **Future:** PineLabs, Razorpay, Cashfree

### Inventory Engine
* Purchase
* Consumption
* Transfer
* Waste
* Reservation
* Ledger

### Reporting Engine
* Feeds Manager & Owner workspaces

---

## Menu Management
* **Food Menu:** Owned by Chef.
* **Bar Menu:** Owned by Bar Manager.
* Configuration workspace never manages menus.

---

## Recipe Management
Every sellable item must have a **Production Specification**:
* Butter Chicken → Recipe
* Beer Bottle → Single Item Mapping
* Cocktail → Recipe

All use the unified Production Engine.

---

## Automatic Inventory Flow

```text
Customer Orders
   ↓
Waiter Creates Order
   ↓
KOT/BOT Generated
   ↓
Kitchen / Bar
   ↓
Item Ready
   ↓
Production Engine
   ↓
Recipe Loaded
   ↓
Stock Movement Generated
   ↓
Inventory Updated
   ↓
Menu Availability Recalculated
   ↓
Waiter Updated
   ↓
Manager Updated
```

*No manual stock deduction ever.*

---

## Supplier Catalogue
* Every supplier maintains their own catalogue.
* Each mapping contains:
  * Inventory Item
  * Purchase Unit
  * Package Size
  * Locked Price
  * MOQ
  * Lead Time
* Purchase Orders use catalogue pricing automatically.

---

## Billing Flow

```text
Waiter
   ↓
Generate Bill
   ↓
Bill Printed
   ↓
Dynamic QR Printed
   ↓
Customer Pays
   ↓
Razorpay Webhook
   ↓
Payment Linked
   ↓
Bill Paid
   ↓
Table Closed
```

*Cash / Card alternative:*
```text
Cashier Marks Paid → Bill Closed
```

---

## KDS / BDS Workflow
Status is tracked **per item**, not per ticket.

```text
Queued → Preparing → Ready → Served
```

KOT / BOT status is derived (e.g. 5 items: 2 Ready, 2 Preparing, 1 Queued ⇒ KOT = *Partially Ready*).  
Waiter receives itemized notifications (e.g. "Butter Chicken Ready", "Garlic Naan Ready").

---

## Offline Strategy

### Supported Offline
* Login (cached session)
* Floor Map
* Seating
* Orders
* KOT/BOT Creation
* Kitchen Updates
* Inventory Updates
* Notifications

### Requires Internet
* UPI Payment Confirmation
* Payment Webhooks
* Cloud Backup

*Everything else queues and syncs automatically.*

---

## Integrations

* **Phase 1:** Razorpay, ESC/POS Printers, WhatsApp, Tally Export
* **Future:** Swiggy, Zomato, PhonePe, PineLabs, Zoho Books

---

## Business Events

* Everything publishes events:
  * `GuestSeated`
  * `OrderCreated`
  * `KOTGenerated`, `BOTGenerated`
  * `OrderItemPreparing`, `OrderItemReady`
  * `InventoryConsumed`
  * `BillGenerated`, `PaymentReceived`
  * `TableClosed`
  * `ClockIn`, `ClockOut`

---

## Vertical Slice Roadmap

* **Phase 0 – Domain Lockdown (COMPLETE):** Ubiquitous Language, Entity Ownership Matrix, Event Responsibility Matrix, Automation Matrix, Permission Matrix, Product Decision Log
* **Phase 1 – Identity & Foundation:** Authentication (PIN), User Management, Configuration, Clock In / Clock Out, BusinessOS Design System
* **Phase 2 – Restaurant Setup:** Dining Areas, Tables, Printers, Taxes, Payment Gateways
* **Phase 3 – Front of House:** Table Sessions, Floor Map, Guest Seating, Order Builder, KOT/BOT Generation
* **Phase 4 – Production Engine:** Production Specifications, Recipe Manager, Menu Builder, Kitchen (KDS), Bar (BDS), Auto Inventory Consumption, Availability Engine
* **Phase 5 – Payments & Billing:** Billing Engine, Dynamic QR, Cashier, Payment Webhooks, Receipts
* **Phase 6 – Inventory & Purchasing:** Inventory Master, Supplier Catalogue, Purchase Orders, Goods Receiving, Transfers, Stock Count
* **Phase 7 – Operations & Management:** Manager Operations Center, Live Floor, Approvals, Action Center, Notifications, Timeline
* **Phase 8 – Owner BI & Analytics:** Owner Dashboard, KPIs, Reports, Food & Labour Costs, Tally Export

---

## Definition of Done

A feature is complete only when it:
1. Solves a real operational problem.
2. Works offline and syncs automatically.
3. Publishes appropriate business events.
4. Updates all affected workspaces in real time.
5. Produces a complete audit trail.
6. Respects roles and permissions.
7. Requires minimal user interaction.
8. Has intuitive touch-first UX.
9. Is responsive across supported devices.
10. Keeps employees focused on their job rather than the software.
