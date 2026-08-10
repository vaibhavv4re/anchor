# RestaurantOS Engineering Manifesto

> **We are not building screens.**  
> **We are not building APIs.**  
> **We are not building a POS.**  
> **We are building a digital employee that quietly performs every repetitive operational task so the real employees can focus on hospitality.**

---

## Litmus Test

Every feature is evaluated against five core questions:
* Does it reduce effort?
* Does it reduce mistakes?
* Does it reduce training time?
* Does it improve service speed?
* Does it disappear into the background?

If the answer to all five is **yes**, it belongs in RestaurantOS.

---

## 🚫 Product Discipline & Execution Rule

> **"Every completed capability must be immediately visible and usable in the frontend."**  
> **"We don't design screens—we design the restaurant. Every card must state why it exists, what data it owns, and what depends on it later."**

* ❌ **No isolated capability groups without immediate UI workflows**
* ❌ **No platform abstractions without demonstrable scenario value**
* ❌ **No catch-all configuration screens that violate workspace domain ownership**

The only reason code changes is because **a real restaurant workflow requires it**.

---

## Core Architectural Principles

* **PD-001 (Automated Inventory Deduction Timing):** Stock deduction occurs when items transition to `READY`, not on order creation.
* **PD-006 (Unified Workspace Projections):** Every workspace is a projection of the same unified restaurant state. No workspace owns duplicated business data.
* **PD-007 (Configuration vs. Runtime Separation):** The physical restaurant layout is static configuration; operational state is dynamic runtime. Configuration never owns runtime state.
* **PD-008 (Physical Assets vs. Operational Context Separation):** The Table is a physical asset. The Table Session is the operational context. Operational data belongs to the session, not the table.
* **PD-009 (Read-First Situational Awareness):** The Floor Viewer is read-first and action-second. Every interaction begins with situational awareness before workflow execution.
* **PD-010 (Automatic Production Routing):** Production routing is automatic. Waiters never choose whether an item goes to Kitchen or Bar. The Production Engine determines routing from the menu item's production specification.
* **PD-011 (Scenario-Driven Product Development & Playbooks):** Progress is measured by working, role-switchable restaurant journeys and playbooks (Setup, Service, Production, Payment) rather than isolated platform capabilities. Every capability features an immediate, touch-first UI experience.
* **PD-012 (Domain Workspace Data Ownership):** Workspaces own their operational data. Kitchen owns food menu & food recipes, Bar owns drinks menu & drink recipes, Inventory owns stock. Admin configures shared infrastructure only.
* **PD-013 (Guided Operations Launcher & Explore Mode):** Setup Assistant is a launcher into the OS. Completing infrastructure setup lands on the Admin Home Dashboard with classified setup progress checklist (Infrastructure, Operations, Service), contextual workspace action links (`Create Menu →`), and instant Explore Mode ("Explore RestaurantOS") access.
* **PD-014 (Progressive Restaurant Onboarding):** RestaurantOS supports progressive onboarding. A restaurant may begin operations with the minimum required configuration while continuing to configure advanced operational capabilities over time.
* **PD-015 (Role-by-Role Workspace Onboarding & Real CRUD Execution):** Restaurant commissioning proceeds role-by-role. Super Admin creates tenant, Admin prepares shared infrastructure checklist, and department heads (Chef, Bartender, Inventory Manager, Cashier) perform real CRUD setup inside their own workspaces with cross-workspace dependency alerts.
* **PD-016 (Restaurant Commissioning Engine & Operational Readiness):** Platform capability (`CommissioningEngine`) managing operational readiness, item dependencies, and go-live validation (`Restaurant Ready for Service`). Department heads configure their own workspaces while the Commissioning Engine evaluates blocking vs. non-blocking requirements, resolves item dependencies (e.g. Recipe -> Inventory 1-click creation), and drives the Admin Command Center ("Things Requiring Attention").
* **PD-017 (Card 1 Business Profile & Preferences Contract):** Card 1 defines business identity and operational preferences across 9 frozen sections (Business Identity, Contact Information, Structured Address, Compliance & Licences, Regional Settings, Branding, Business Preferences, Billing Defaults, Receipt Defaults) with independent section save states, clean structural separation between Business Profile vs. Operational Preferences, and 3-state section completion tracking (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETE`).
* **PD-017A (Stable Foundation Principle):** Card 1 contains only data that changes infrequently (business identity, legal compliance, branding tokens, regional settings, business preferences, billing & receipt defaults). Frequently changing operational settings (such as business operating hours, shifts, service periods, and staffing) belong to dedicated operational configuration modules (e.g. "Business Operations").
* **PD-018 (Admin Workspace Navigation & Boundary Lockdown):** Admin Workspace navigation is strictly dedicated to administrative control (`🏠 Dashboard`, `⚙ Configuration` sub-menu group with 6 cards, `📊 Commissioning Control Tower`, `📋 Audit Log`, `🔒 Logout`). Operational views (Floor Map, Kitchen KDS, Bar BDS, Master Inventory, Cashier Billing) are strictly excluded from Admin navigation and accessible only when logged in under their respective department head roles (Chef, Bartender, Inventory Manager, Cashier, Waiter).
* **PD-019 (Card 2 Dining Areas Contract):** Card 2 defines physical dining zones (Main Hall, Outdoor, Bar, VIP, Rooftop, Private, Waiting Area, Takeaway Pickup) and owns area identity, area code, area type, expected guest capacity, service availability, operating hour overrides, system preset colors, icons, features, and operational notes. Card 2 does not own individual tables or runtime session data, and acts as the strict prerequisite for Card 3 (Dining Tables).
* **PD-019A (Archive-First Configuration Principle):** System configuration entities (Dining Areas, Tables, Menu Items, Inventory Items, Suppliers, Staff Accounts, Devices/Printers) must never be permanently deleted from the database. Instead, entities support status states (`ACTIVE`, `INACTIVE`, `ARCHIVED`) with `Archive` and `Restore` operations. Archiving is blocked if downstream dependent entities exist (e.g. cannot archive a Dining Area if tables are assigned to it).
* **PD-019B (Domain Data Separation & Operational Status Engine):** Parent configuration entities must never duplicate or hardcode child entity counts or capacities (e.g., Card 2 Dining Area record must never store `tableCount` or `capacity`). All child metrics are dynamically projected from Card 3 (`tables_master`) at runtime. Card 2 owns zone identity, operational status (`OPEN`, `CLOSED`, `MAINTENANCE`, `ARCHIVED`) with closure reasons, reservation policy (`Allowed`, `Walk-in Only`, `Reservation Only`), service modes (`Dine In`, `Takeaway Pickup`, `Waiting`, `Bar Service`, `Private Dining`), expandable smart IoT schema, read-only live metrics, and audit timelines.
* **PD-020 (Physical Asset Separation & Table Definition Contract):** Tables are permanent physical assets defined in Card 3. Card 3 owns table identity, area code formatting (e.g. `MH-T12`), parent area linking, physical geometry (shape, min/max seats, mergeable, wheelchair accessibility), layout grid coordinates (X, Y, W, H, rotation), operational attributes, hardware printer routing, and self-ordering QR tokens. Tables NEVER own runtime operational state (Occupied, Reserved, Active Order, Bill, Session status), which is strictly projected from Table Sessions.
* **PD-021 (Physical Assets Never Route Work):** Physical dining assets define where guests can sit. Operational workflows such as production routing, thermal printer selection, billing settlement, and kitchen dispatch must never be owned by a dining asset. Tables own asset classification (Table, Booth, Bar Counter, Private Room), recommended/maximum capacity, merge rules, layout grid coordinates (X, Y, W, H, rotation, layer), categorized operational attributes, and QR-enabled toggles.
* **PD-022 (Identity vs Employment & Access Separation Contract):** Card 4 ("Staff & Access") manages operational staff identity and workspace access permissions. Authentication identifies *who* the person is (auto-generated `EMP-00015` ID & 6-digit PIN). Employment defines *what* they do (primary role tile, secondary roles). Roles define *what they can access* (visual experience preview panel). These three concepts are strictly decoupled so that staff role transitions (e.g. Waiter promoted to Manager) update role assignments without mutating PIN identity or losing historical audit logs. HR hierarchy (`Department`, `Reports To`), attendance, payroll, and fake pre-seeded staff data are strictly removed from Card 4.
* **PD-023 (Default Operational Role Templates & 3-Step Staff Wizard):** Roles define a default operational workspace experience. Workspace access permissions are automatically inherited from role templates (e.g., selecting `Chef` automatically assigns Kitchen KDS, Food Recipes, Food Menu, and Item Ready status out-of-the-box). Individual permission overrides are exceptional and optional. Staff onboarding uses a fast 3-step wizard (Identity $\rightarrow$ PIN & Security $\rightarrow$ Role Template & Visual Experience Preview) with a 1-click random PIN generator (`[🎲 Generate PIN]`).
* **PD-024 (Master Product Catalog & ERP Hierarchy Contract):** Inventory is the Master Product Catalog of the restaurant. Kitchen and Bar workspaces never create raw ingredients; they consume master inventory items via Production Recipes (Bill of Materials - BOM). Semi-finished batch preparations (signature masalas, gravies, stocks, dips) exist as inventory assets with their own production BOMs. Menu items link to Production Recipes, establishing a strict ERP hierarchy: `Inventory Master → Production Recipes (BOM) → Menu Catalog → Customer Orders → Automated Inventory Deduction`.
* **PD-025 (3-Template Excel Bulk Import Architecture):** Restaurant onboarding supports 3 canonical Excel/CSV import templates: 1) Inventory Master Import (Raw Materials, Semi-Finished Batch Preps, Packaging, Consumables), 2) Production Recipe BOM Import (Base Sauces, Masalas, Dish Recipes), and 3) Menu Catalog Import (Categories, Prices, Taxes, Recipe Links, Production Routing).
* **PD-026 (ERP-Style Master Data Platform & Phased Milestone Architecture):** Inventory is built as an enterprise ERP Master Data platform across 5 distinct milestone phases: Milestone 1 (Inventory Foundation & Master Data), Milestone 2 (Production Recipes), Milestone 3 (Menu Engineering), Milestone 4 (Warehouse Operations), Milestone 5 (Kitchen Operations & Deductions).
* **PD-027 (5-Pack Coastal Bistro Import Dataset & Pre-Import Review Engine):** RestaurantOS includes 5 pre-built Coastal Bistro import datasets derived directly from the restaurant menu (`Inventory_Master.csv`, `Production_Recipes.csv`, `Menu_Items.csv`, `Suppliers.csv`, `Opening_Stock.csv`). Imports NEVER write directly to the database; they pass through an interactive Pre-Import Review Screen (showing Valid Items, Error Warnings, Duplicate Codes) with a 1-click "🚀 Load Sample Coastal Bistro Dataset" launcher.
* **PD-028 (Master Data Import Specification - CANON-11):** Adheres to CANON-11 (`docs/canon/11_master_data_import_specification.md`). Enforces 6-step sequential dependency order (`Categories → UOMs → Storage Locations → Suppliers → Inventory Master → Opening Stock`), 8 Item Types (`Raw Material`, `Semi Finished`, `Finished Good`, `Packaging`, `Consumable`, `Cleaning Supply`, `Asset`, `Service Item`), and 3-tier storage hierarchy (`Warehouse → Store → Bin/Rack`).
* **PD-029 (Smart Import Assistant & Enterprise Preview Engine):** 6-step ERP import workflow: Upload $\rightarrow$ Mapping $\rightarrow$ Validation $\rightarrow$ Pre-Import Preview $\rightarrow$ Commit $\rightarrow$ Summary Log. If an import references missing categories or units, the Smart Import Assistant presents 3 interactive choices: `Create Placeholders Automatically`, `Map to Existing Items`, or `Cancel Import`.
* **PD-030 (Master Data Before Transactions Contract):** No transactional workspace (Waiters, Cashiers, KDS/BDS, Kitchen line) may create master data. Inventory owns Items, Categories, UOMs, Suppliers, Storage Locations. Kitchen owns Recipes. Menu Management owns Menu Items. Workspaces consume master data; missing items raise a dependency request (`Request Inventory Item`). Production UI excludes dev sample buttons (`🚀 Load Sample Dataset` moves strictly to Dev Tools). Imports support step progress tracking (`Resumable Imports`) and 1-click `Import Rollback`.
* **PD-031 (Dedicated Inventory Manager Workspace & Navigation Lockdown):** Master Inventory is completely removed from Admin navigation and moved to **`📦 INVENTORY WORKSPACE`** (PIN `444444`). Admin navigation is strictly dedicated to administrative control (`🏠 Dashboard`, `⚙ Configuration`, `📊 Commissioning`, `📋 Audit Log`, `🔒 Logout`). Inventory Workspace navigation is structured into 4 operational groups: `MASTER DATA`, `OPERATIONS`, `PROCUREMENT`, and `TOOLS`. Inter-workspace item requests use **`✅ Inventory Requests`** as the official dependency bridge.
* **PD-032 (Offline First & Cloud Synchronization Architecture):** Every operation executes locally first with 0ms user wait time. Cloud synchronization (Supabase / PostgreSQL) is asynchronous, background worker driven, and non-blocking. UI components interact strictly through typed Repositories (`InventoryRepository`, `SupplierRepository`, `TableRepository`, `StaffRepository`, `TenantRepository`, `RecipeRepository`, `OrderRepository`). All mutations write to a local Command Queue (`commands` collection/table) with optimistic versioning (`version`, `correlationId`). A top-right UI Sync Status Badge displays real-time connection & queue state (`🟢 Synced`, `🟡 Offline (N Pending)`, `🔴 Sync Failed`). Conflict resolution uses delta-merging instead of destructive last-write-wins overwrites.

---

## Canonical Golden Path Journey

```text
Super Admin
    ↓
Create Restaurant & Admin Account
    ↓
Admin Login (Profile, Areas, Tables, Staff & Access)
    ↓
Inventory Manager Login (PIN 444444) ──► 📦 INVENTORY WORKSPACE (Repositories, Command Queue, Sync Engine — PD-032)
    ↓
Chef Kitchen Login (PIN 222222) ──────► Milestone 2 — Production Workspace (BOM Recipes & Signature Masala Batches)
    ↓
Milestone 3 — Menu Workspace (Menu Catalog & Pricing)
    ↓
🚀 FIRST OPERATIONAL MILESTONE ──► Waiter Login ──► Floor Map ──► Seat Guests ──► Order ──► KOT ──► Kitchen Ready ──► Auto Inventory Deduction (PD-001) ──► Settlement
```

---

## Product Quality Gates

Before any scenario is merged into `main`, it must pass all seven quality gates:

| Gate | Focus | Requirement |
| :--- | :--- | :--- |
| **Gate 1 — Business** | Domain Alignment | Scenario matches Canon. Business rules satisfied. No shortcuts. |
| **Gate 2 — UX** | Operation Efficiency | Max 3 taps for common actions. Touch-friendly. Responsive. No unnecessary dialogs. |
| **Gate 3 — Offline** | Resiliency | Works without internet via CQRS command queue. Syncs correctly. Zero data loss. |
| **Gate 4 — Performance** | Speed & Responsiveness | Opens quickly (<1s). Smooth 60fps interaction. No blocking main thread operations. |
| **Gate 5 — Security** | Access Control | Role-based permissions strictly enforced. Complete audit trail generated with Correlation IDs. |
| **Gate 6 — Integration** | Ecosystem | Typed platform events published. Real-time classified notifications generated. Workspaces updated automatically. |
| **Gate 7 — Operational Simplicity** | Work Reduction | Does this feature reduce work for restaurant staff? If not, reject. |
