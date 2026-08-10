# RestaurantOS Product Decision Log

This log records every key architectural, technical, and operational decision made for RestaurantOS to ensure long-term clarity and prevent unnecessary rework.

---

## Decision Entries

### PD-001: Automatic Inventory Deduction Timing
* **Decision:** Inventory stock is automatically deducted when an Order Item transitions to `READY` status in KDS/BDS.
* **Reason:** Marking an item `READY` represents actual physical production completion.
* **Alternatives Rejected:**
  * *Deduct on Order creation:* Risk of deducting stock for cancelled/modified orders before cooking starts.
  * *Deduct on Preparing:* Inaccurate if prep fails or item is burned/re-queued.
* **Status:** Accepted

---

### PD-002: PIN-Based Authentication Model
* **Decision:** Staff authenticate using a unique 6-digit PIN linked to their Employee ID.
* **Reason:** Restaurant employees share terminal hardware and need rapid, friction-free login/logout during peak operational shifts.
* **Alternatives Rejected:**
  * *Username/Password:* Too slow and cumbersome for touch terminals during high-volume service.
* **Status:** Accepted

---

### PD-003: Attendance Tied Directly to Auth Session
* **Decision:** Clock-in occurs automatically upon PIN login, and Clock-out occurs automatically upon logout or session lock.
* **Reason:** Eliminates manual attendance tracking software and prevents forgotten clock-ins/outs.
* **Alternatives Rejected:**
  * *Separate Attendance Module:* Adds manual software overhead for employees after arriving at work.
* **Status:** Accepted

---

### PD-004: Item-Level KDS/BDS Tracking
* **Decision:** KDS/BDS statuses are tracked per individual order item (`Queued` → `Preparing` → `Ready` → `Served`) rather than per ticket.
* **Reason:** Allows kitchen and bar to prep at item speed, enables granular item-level waiter notifications (e.g. "Garlic Naan Ready"), and derives ticket-level status automatically.
* **Alternatives Rejected:**
  * *Ticket-Level Only Status:* Forces entire ticket to wait for the slowest item before updating waiter.
* **Status:** Accepted

---

### PD-005: Operational Philosophy Override
* **Decision:** *Every feature should remove work from the restaurant, not add work to the staff.*
* **Reason:** High-volume restaurant software fails when employees are burdened by administrative software upkeep.
* **Alternatives Rejected:**
  * *Feature-heavy manual reporting workflows.*
* **Status:** Accepted

---

### PD-006: Workspace Projections over Duplicated Data
* **Decision:** Every workspace is a projection of the same unified restaurant state. No workspace owns duplicated business data.
* **Reason:** Ensures single source of truth under CQRS architecture; prevents data desynchronization across Waiter, Kitchen, Cashier, and Manager screens.
* **Alternatives Rejected:**
  * *Per-workspace local state duplication or custom local table copies.*
* **Status:** Accepted

---

### PD-007: Configuration vs. Operational Runtime Separation
* **Decision:** The physical restaurant layout (areas, tables, shapes, capacities) is static Configuration. The operational state (table occupancy, active session, waiter, prep status) is dynamic Runtime. Configuration never owns runtime state.
* **Reason:** Prevents mutating physical infrastructure specs when tables transition operational states during shifts.
* **Alternatives Rejected:**
  * *Mixing table state and session data directly into table configuration objects.*
* **Status:** Accepted

---

### PD-008: Physical Assets vs. Operational Context Separation
* **Decision:** The Table is a physical asset. The Table Session is the operational context. Operational data (guests, orders, bills, active waiter) belongs to the session, not the table.
* **Reason:** Prevents table entity bloat and keeps table runtime states clean (`AVAILABLE`, `RESERVED`, `OCCUPIED`, `PAYMENT_PENDING`, `CLEANING`, `OUT_OF_SERVICE`) while session milestones live in the session lifecycle.
* **Alternatives Rejected:**
  * *Embedding guest counts, active orders, and bill totals directly on the table asset.*
* **Status:** Accepted

---

### PD-009: Read-First Situational Awareness Floor Design
* **Decision:** The Floor Viewer is read-first and action-second. Every interaction begins with situational awareness before workflow execution.
* **Reason:** Waiters and staff inspect floor status 1,000+ times per day to answer "Which table needs me now?" before executing actions.
* **Alternatives Rejected:**
  * *Action-heavy modal popups opening automatically without visual floor context.*
* **Status:** Accepted

---

### PD-010: Automatic Production Routing
* **Decision:** Production routing is automatic. Waiters never choose whether an item goes to Kitchen or Bar. The Production Engine determines routing from the menu item's production specification.
* **Reason:** Eliminates manual waiter routing mistakes and ensures deterministic, zero-latency KOT/BOT generation.
* **Alternatives Rejected:**
  * *Manual waiter ticket routing checkboxes during order building.*
* **Status:** Accepted

---

### PD-011: Scenario-Driven Product Development & Playbooks
* **Decision:** Development is scenario-driven. Progress is measured strictly by working, role-switchable restaurant journeys and playbooks (Setup, Service, Production, Payment) rather than isolated platform capabilities. Every capability must feature an immediate, touch-first UI experience.
* **Reason:** Ensures RestaurantOS is demonstrable and usable by real restaurant owners from Day 1, exposing usability friction early.
* **Alternatives Rejected:**
  * *Building isolated backend capabilities without immediate end-to-end UI workflows.*
* **Status:** Accepted

---

### PD-012: Domain Workspace Data Ownership
* **Decision:** Workspaces own their operational data. Kitchen owns food menu & food recipes, Bar owns drinks menu & drink recipes, Inventory owns stock. The Admin Setup Wizard configures shared infrastructure only.
* **Reason:** Preserves strict domain ownership boundaries and prevents the setup wizard from becoming a bloated catch-all configuration screen.
* **Alternatives Rejected:**
  * *Managing menus, recipes, and inventory catalogs centrally inside the Admin Setup Wizard.*
* **Status:** Accepted

---

### PD-013: Interactive Demo Mode & Guided Operations Launcher
* **Decision:** The setup wizard is a guided launcher into the OS. Upon completing infrastructure setup ("Start Operations"), the system lands on the Admin Home Dashboard with classified setup progress cards (Infrastructure, Operations, Service), workspace deep-links (`Complete Setup →`), and instant Demo Mode ("Explore RestaurantOS") access.
* **Reason:** Gives restaurant owners a clear setup checklist and allows immediate exploration of the software before completing full configuration.
* **Alternatives Rejected:**
  * *Landing on an empty, unguided admin screen after setup wizard completion.*
* **Status:** Accepted

---

### PD-014: Progressive Restaurant Onboarding
* **Decision:** RestaurantOS supports progressive onboarding. A restaurant may begin operations with the minimum required configuration (Required: Profile, Tables, Users, 1 Waiter, 1 Chef, 1 Menu Item, 1 ProdSpec) while continuing to configure advanced operational capabilities over time.
* **Reason:** Reduces onboarding friction and time-to-value so restaurants can start using the system immediately.
* **Alternatives Rejected:**
  * *Blocking operations until all optional inventory, supplier, and analytics modules are 100% configured.*
* **Status:** Accepted

---

### PD-015: Role-by-Role Workspace Onboarding & Real CRUD Execution
* **Decision:** Restaurant commissioning proceeds role-by-role. Super Admin creates tenant, Admin prepares shared infrastructure, and department heads (Chef, Bartender, Inventory Manager, Cashier) perform real CRUD setup inside their own workspaces with cross-workspace dependency alerts.
* **Reason:** Aligns with real-life restaurant commissioning, enforces strict domain ownership, and eliminates mock data in favor of clean persistent CRUD operations.
* **Alternatives Rejected:**
  * *Centralized setup wizards attempting to configure multi-department menus, recipes, and inventory items from an Admin screen.*
* **Status:** Accepted

---

### PD-016: Restaurant Commissioning Engine & Operational Readiness
* **Decision:** Platform capability (`CommissioningEngine`) managing operational readiness, cross-workspace item dependencies, and go-live validation. Department heads configure their own workspaces while the Commissioning Engine evaluates blocking vs. non-blocking requirements, resolves item dependencies (e.g. Recipe -> Inventory 1-click creation), and drives the Admin Command Center ("Things Requiring Attention") and "Restaurant Ready for Service" go-live check.
* **Reason:** Replaces static percentages with actionable business statuses (`READY`, `ATTENTION_REQUIRED`, `NOT_CONFIGURED`) and exact missing item checklists, empowering restaurant owners to go live smoothly.
* **Alternatives Rejected:**
  * *Static progress bars and uncoordinated multi-department setup.*
* **Status:** Accepted

---

### PD-017: Card 1 Restaurant Profile & Operational Preferences Contract
* **Decision:** Card 1 defines business identity and operational preferences across 9 frozen sections (Business Identity, Contact Information, Structured Address, Legal & Compliance, Regional Settings, Branding Tokens, Multi-Period Operating Hours, Billing Defaults, Receipt Defaults) with independent section save states, clean structural separation between Business Profile vs. Operational Preferences, and actionable completion checklists (`READY` vs `NEEDS_ATTENTION`).
* **Reason:** Establishes the foundational business identity that feeds all downstream modules (Receipts, Billing, Attendance, Reports, Design System) without holding operational data like menus or tables.
* **Alternatives Rejected:**
  * *Monolithic single-form setup or mixing operational tables/menus into the restaurant profile card.*
* **Status:** Accepted

---

### PD-017A: Stable Foundation Principle
* **Decision:** Card 1 ("Business Profile & Preferences") contains only data that changes infrequently (business identity, legal compliance, branding tokens, regional settings, business preferences, billing & receipt defaults). Frequently changing operational settings (such as business operating hours, shifts, service periods, and staffing) belong to dedicated operational configuration modules (e.g. "Business Operations").
* **Reason:** Keeps Card 1 stable and immutable over time without turning it into a catch-all configuration screen.
* **Alternatives Rejected:**
  * *Embedding dynamic service hours or shift schedules inside Card 1.*
* **Status:** Accepted

---

### PD-018: Admin Workspace Navigation & Boundary Lockdown
* **Decision:** Admin Workspace navigation is strictly dedicated to administrative control (`🏠 Dashboard`, `⚙ Configuration` sub-menu group with 6 cards, `📊 Commissioning Control Tower`, `📋 Audit Log`, `🔒 Logout`). Operational views (Floor Map, Kitchen KDS, Bar BDS, Master Inventory, Cashier Billing) are strictly excluded from Admin navigation and accessible only when logged in under their respective department head roles (Chef, Bartender, Inventory Manager, Cashier, Waiter).
* **Reason:** Enforces domain workspace boundaries and prevents the Admin view from becoming an overloaded, confusing catch-all screen.
* **Alternatives Rejected:**
  * *Mixing operational waiter/kitchen/bar screens into the Admin sidebar.*
* **Status:** Accepted

---

### PD-019: Card 2 Dining Areas Contract
* **Decision:** Card 2 defines physical dining zones (Main Hall, Outdoor, Bar, VIP, Rooftop, Private, Waiting Area, Takeaway Pickup) and owns area identity, area type, max guest capacity, service availability (Breakfast/Lunch/Dinner/Late Night), operating hour overrides, operational zone colors, and operational notes. Card 2 does not own individual tables or runtime session data, and acts as the strict prerequisite for Card 3 (Dining Tables).
* **Reason:** Establishes the physical zone hierarchy required for floor map rendering, seating analytics, and area-specific menu routing without overlapping table configuration.
* **Alternatives Rejected:**
  * *Combining dining areas and individual table configurations into a single unstructured view.*
* **Status:** Accepted

---

### PD-019A: Archive-First Configuration Principle
* **Decision:** System configuration entities (Dining Areas, Tables, Menu Items, Inventory Items, Suppliers, Staff Accounts, Devices/Printers) must never be permanently deleted from the database. Instead, entities support status states (`ACTIVE`, `INACTIVE`, `ARCHIVED`) with `Archive` and `Restore` operations. Hard deletes are removed completely. Archiving is blocked if downstream dependent entities exist (e.g. cannot archive a Dining Area if tables are assigned to it).
* **Reason:** Preserves historical audit trails, financial reporting integrity, and operational references without data corruption.
* **Alternatives Rejected:**
  * *Hard deleting configuration entities which breaks historical reports and audit trails.*
* **Status:** Accepted

---

### PD-019B: Domain Data Separation & Operational Status Engine
* **Decision:** Parent configuration entities must never duplicate or hardcode child entity counts or capacities (e.g., Card 2 Dining Area record must never store `tableCount` or `capacity`). All child metrics are dynamically projected from Card 3 (`tables_master`) at runtime. Card 2 owns zone identity, operational status (`OPEN`, `CLOSED`, `MAINTENANCE`, `ARCHIVED`) with closure reasons, reservation policy (`Allowed`, `Walk-in Only`, `Reservation Only`), service modes (`Dine In`, `Takeaway Pickup`, `Waiting`, `Bar Service`, `Private Dining`), expandable smart IoT schema, read-only live metrics, and audit timelines.
* **Reason:** Maintains strict domain boundaries and prevents data duplication bugs between parent areas and child tables.
* **Alternatives Rejected:**
  * *Hardcoding table counts inside dining area database records.*
* **Status:** Accepted

---

### PD-020: Physical Asset Separation & Table Definition Contract
* **Decision:** Tables are permanent physical assets defined in Card 3. Card 3 owns table identity, area code formatting (e.g. `MH-T12`), parent area linking, physical geometry (shape, min/max seats, mergeable, wheelchair accessibility), layout grid coordinates (X, Y, W, H, rotation), operational attributes, hardware printer routing, and self-ordering QR tokens. Tables NEVER own runtime operational state (Occupied, Reserved, Active Order, Bill, Session status), which is strictly projected from Table Sessions and Orders.
* **Reason:** Establishes permanent physical asset definitions separate from dynamic runtime sessions and layout map rendering engines.
* **Alternatives Rejected:**
  * *Storing runtime active session data or order totals directly inside table configuration records.*
* **Status:** Accepted

---

### PD-021: Physical Assets Never Route Work
* **Decision:** Physical dining assets define where guests can sit. Operational workflows such as production routing, thermal printer selection, billing settlement, and kitchen dispatch must never be owned by a dining asset. Tables own asset classification (Table, Booth, Bar Counter, Private Room), recommended/maximum capacity, merge rules, layout grid coordinates (X, Y, W, H, rotation, layer), categorized operational attributes, and QR-enabled toggles.
* **Reason:** Prevents coupling between physical seating configuration and production dispatch rules.
* **Alternatives Rejected:**
  * *Embedding printer IP addresses or kitchen routing logic directly inside table records.*
* **Status:** Accepted

---

### PD-022: Identity vs Employment & Access Separation Contract
* **Decision:** Card 4 ("Staff & Access") manages operational staff identity and workspace access permissions. Authentication identifies *who* the person is (auto-generated `EMP-00015` ID & 6-digit PIN). Employment defines *what* they do (primary role tile, secondary roles). Roles define *what they can access* (visual experience preview panel). These three concepts are strictly decoupled so that staff role transitions (e.g. Waiter promoted to Manager) update role assignments without mutating PIN identity or losing historical audit logs. HR hierarchy (`Department`, `Reports To`), attendance, payroll, and fake pre-seeded staff data are strictly removed from Card 4.
* **Reason:** Keeps the user model 100% focused on POS operational access control and avoids duplicate accounts.
* **Alternatives Rejected:**
  * *Deleting staff accounts or creating duplicate PINs when employee roles change.*
* **Status:** Accepted

---

### PD-023: Default Operational Role Templates & 3-Step Staff Wizard
* **Decision:** Roles define a default operational workspace experience. Workspace access permissions are automatically inherited from role templates (e.g., selecting `Chef` automatically assigns Kitchen KDS, Food Recipes, Food Menu, and Item Ready status out-of-the-box). Individual permission overrides are exceptional and optional. Staff onboarding uses a fast 3-step wizard (Identity $\rightarrow$ PIN & Security $\rightarrow$ Role Template & Visual Experience Preview) with a 1-click random PIN generator (`[🎲 Generate PIN]`).
* **Reason:** Eliminates manual permission checkbox fatigue for admins while ensuring 15-second onboarding.
* **Alternatives Rejected:**
  * *Requiring admins to manually select 30 permission checkboxes for every new staff member.*
* **Status:** Accepted

---

### PD-024: Master Product Catalog & ERP Hierarchy Contract
* **Decision:** Inventory is the Master Product Catalog of the restaurant. Kitchen and Bar workspaces never create raw ingredients; they consume master inventory items via Production Recipes (Bill of Materials - BOM). Semi-finished batch preparations (signature masalas, gravies, stocks, dips) exist as inventory assets with their own production BOMs. Menu items link to Production Recipes, establishing a strict ERP hierarchy: `Inventory Master → Production Recipes (BOM) → Menu Catalog → Customer Orders → Automated Inventory Deduction`.
* **Reason:** Prevents duplicate ingredient entries and enables automated stock deduction and recipe costing across multi-location stores.
* **Alternatives Rejected:**
  * *Allowing Kitchen or Bar to type ad-hoc ingredient names directly inside menu items.*
* **Status:** Accepted

---

### PD-025: 3-Template Excel Bulk Import Architecture
* **Decision:** Restaurant onboarding supports 3 canonical Excel/CSV import templates:
  1. **Inventory Master Import** (Raw Materials, Semi-Finished Batch Preps, Packaging, Consumables, UOM, Conversion Factors, Reorder Levels, Default Location, Tax %, Default Supplier).
  2. **Production Recipe (BOM) Import** (Recipe Code, Yield Qty/UOM, Ingredient Codes/Names linked strictly to Inventory Master, Qty, Wastage %).
  3. **Menu Catalog Import** (Menu Code, Item Name, Category, Price, Tax Profile, Production Recipe Link, KDS/BDS Routing).
* **Reason:** Enables onboarding a 500-item restaurant in minutes via spreadsheet imports while guaranteeing 100% relational integrity.
* **Alternatives Rejected:**
  * *Single giant flat spreadsheet mixing menu prices, ingredients, and supplier details in one unnormalized table.*
* **Status:** Accepted

---

### PD-026: ERP-Style Master Data Platform & Phased Milestone Architecture
* **Decision:** Inventory is built as an enterprise ERP Master Data platform structured across 5 distinct milestone phases:
  1. **Milestone 1 (Inventory Foundation):** Master Product Catalog, Categories, UOMs, Storage Locations, Suppliers, 5-Pack Bulk Excel/CSV Engine, Pre-Import Review Screen, and Audit Trail.
  2. **Milestone 2 (Production & BOM Recipes):** Signature masalas, batch gravy recipes, yield calculations, and dish BOMs.
  3. **Milestone 3 (Menu Catalog):** Menu engineering, selling prices, tax profiles, and production routing links.
  4. **Milestone 4 (Warehouse Operations):** Purchase Orders, Goods Receipt, Location Transfers, Stock Requests.
  5. **Milestone 5 (Kitchen Operations & Deductions):** Live order execution and automated stock deductions (PD-001).
* **Reason:** Prevents mixing master data configuration with operational execution, ensuring each phase achieves 100% stability.
* **Alternatives Rejected:**
  * *Building recipes, menu items, warehouse transfers, and automatic deductions in a single unvalidated monolithic step.*
* **Status:** Accepted

---

### PD-027: 5-Pack Coastal Bistro Import Dataset & Pre-Import Review Engine
* **Decision:** RestaurantOS includes 5 pre-built Coastal Bistro import datasets derived directly from the restaurant menu:
  1. `Inventory_Master.csv` (250+ raw materials, packaging, consumables, and semi-finished masalas/bases).
  2. `Production_Recipes.csv` (Signature masala BOMs, dips, stocks, dish recipes).
  3. `Menu_Items.csv` (Menu categories, items, prices, tax profiles, KDS/BDS routing).
  4. `Suppliers.csv` (Supplier master & contact records).
  5. `Opening_Stock.csv` (Initial stock balances & unit valuation rates).
  Spreadsheet imports NEVER write directly to the database; they pass through an interactive **Pre-Import Review Screen** (showing Valid Items, Error Warnings, Duplicate Codes) with a 1-click **"🚀 Load Sample Coastal Bistro Dataset"** launcher.
* **Reason:** Enables instant demo capability and 15-second restaurant onboarding while maintaining SAP/NetSuite-level data validation.
* **Alternatives Rejected:**
  * *Directly inserting raw unvalidated CSV rows into production database tables.*
* **Status:** Accepted

---

### PD-028: Master Data Import Specification (CANON-11) & Enforced Import Sequence
* **Decision:** Master data import adheres to the canonical contract defined in `CANON-11` (`docs/canon/11_master_data_import_specification.md`). The import engine enforces a strict 6-step sequential dependency order: `Categories → UOMs → Storage Locations → Suppliers → Inventory Master → Opening Stock`. Inventory Item Types are expanded to 8 operational classifications (`Raw Material`, `Semi Finished`, `Finished Good`, `Packaging`, `Consumable`, `Cleaning Supply`, `Asset`, `Service Item`). Storage locations support a 3-tier hierarchy (`Warehouse → Store → Bin/Rack`).
* **Reason:** Guarantees 100% relational integrity across master entities and eliminates broken foreign keys during bulk onboarding.
* **Alternatives Rejected:**
  * *Allowing un-ordered or random spreadsheet imports that reference non-existent categories or units.*
* **Status:** Accepted

---

### PD-029: Smart Import Assistant & Enterprise Preview Engine
* **Decision:** The import engine implements a 6-step enterprise ERP workflow: Upload $\rightarrow$ Column Mapping $\rightarrow$ Validation $\rightarrow$ Pre-Import Preview $\rightarrow$ Commit $\rightarrow$ Summary Log. If an import references missing categories or units, the **Smart Import Assistant** presents 3 interactive resolution choices: `Create Placeholders Automatically`, `Map to Existing Items`, or `Cancel Import`.
* **Reason:** Prevents hard crashes on data errors while providing a self-healing onboarding experience comparable to SAP Business One and Oracle NetSuite.
* **Alternatives Rejected:**
  * *Hard failing imports with cryptic database exception errors.*
* **Status:** Accepted

---

### PD-030: Master Data Before Transactions Contract
* **Decision:** No transactional workspace (Waiters, Cashiers, KDS/BDS, Kitchen line) may create master data. Inventory owns Items, Categories, UOMs, Suppliers, and Storage Locations. Kitchen owns Recipes. Menu Management owns Menu Items. Workspaces consume master data; if a required master item does not exist, the workspace raises a dependency request (`Request Inventory Item`) instead of creating ad-hoc records. Production UI excludes dev sample buttons (`🚀 Load Sample Dataset` moves strictly to Dev Tools). Imports support step progress tracking (`Resumable Imports`) and 1-click `Import Rollback`.
* **Reason:** Eliminates duplicate ingredient entries, inconsistent units, and unvalidated database mutations across departments.
* **Alternatives Rejected:**
  * *Allowing waiters or line cooks to type new ingredient names or categories directly inside POS orders or KDS screens.*
* **Status:** Accepted

---

### PD-031: Dedicated Inventory Manager Workspace & Navigation Lockdown
* **Decision:** Adhering strictly to `PD-012 (Domain Workspace Data Ownership)` and `PD-018 (Admin Boundary Lockdown)`, Master Inventory is completely removed from Admin Workspace navigation. Master Inventory belongs strictly to the **Inventory Manager Workspace** (`📦 INVENTORY WORKSPACE`, PIN `444444`). Admin navigation is strictly dedicated to administrative control (`🏠 Dashboard`, `⚙ Configuration`, `📊 Commissioning`, `📋 Audit Log`, `🔒 Logout`). The Inventory Workspace navigation is structured into 4 operational groups: `MASTER DATA` (Inventory, Categories, UOMs, Locations, Suppliers), `OPERATIONS` (Receipts, Issues, Transfers, Adjustments, Stock Count, Low Stock Alerts, Inventory Requests), `PROCUREMENT` (POs, Receiving), and `TOOLS` (Bulk Import, Export, Audit History, Settings). Inter-workspace item requests use **`✅ Inventory Requests`** as the official dependency bridge.
* **Reason:** Ensures strict separation of administrative infrastructure vs operational department execution, allowing RestaurantOS to scale like SAP Business One or NetSuite.
* **Alternatives Rejected:**
  * *Keeping Master Inventory under Admin Configuration navigation.*
* **Status:** Accepted

---

### PD-032: Offline First & Cloud Synchronization Architecture (FROZEN SPECIFICATION)
* **Decision:** RestaurantOS officially freezes the **Offline First** architectural paradigm across all devices and workspaces. Every operation executes locally first (0ms user wait time). Cloud synchronization (Supabase / PostgreSQL) is asynchronous, background worker driven, and non-blocking. UI components interact strictly through typed Repositories (`InventoryRepository`, `SupplierRepository`, `TableRepository`, `StaffRepository`, `TenantRepository`, `RecipeRepository`, `OrderRepository`). Mutations follow a 4-tier pipeline: `User Action → Command → Domain Event → Projection Update → Sync Job`. Every entity record maintains standardized metadata (`id`, `tenantId`, `version`, `deviceId`, `createdBy`, `modifiedBy`, `correlationId`, `createdAt`, `modifiedAt`, `syncState`, `cloudVersion`, `deletedAt`) with a 6-state lifecycle (`LOCAL_ONLY`, `QUEUED`, `SYNCING`, `SYNCED`, `CONFLICT`, `ERROR`). Retries, batching, and diagnostics are managed via the **Offline Journal** (`offlineJournal`), accessible via the **Developer Sync Console** (`dev-sync`).
* **Reason:** Completely decouples business intent from network infrastructure, eliminates last-write-wins overwrites, and provides comprehensive diagnostics for restaurant devices.
* **Alternatives Rejected:**
  * *Mixing business commands directly with network retry jobs.*
  * *Using simple PENDING/SYNCED binary flags without entity versioning or correlation IDs.*
* **Status:** Accepted (FROZEN)

---

### PD-033: SQLite & Local Storage Engine Layer (Roadmap)
* **Decision:** Phase 2 persistence layer migration. Replaces `localStorage` for business data with a local SQLite / IndexedDB engine structured with the exact same relational schema as cloud PostgreSQL (`tables`, `events`, `commands`, `sync_state`, `projections`, `inventory`, `recipes`, `suppliers`, `sessions`, `orders`). `localStorage` is restricted strictly to non-critical UI preferences (theme, active tab).
* **Status:** Planned (Phase 2)

---

### PD-034: Supabase Authentication & Cloud Schema Integration (Roadmap)
* **Decision:** Phase 3 cloud integration. Establishes Supabase Auth adapter, PostgreSQL database tables, Storage bucket adapter (logos, receipts, attachments), and initial one-way (Local → Cloud) Sync Engine worker.
* **Status:** Planned (Phase 3)

---

### PD-035: One-Way Synchronization Engine (Roadmap)
* **Decision:** Phase 4 sync execution. Background worker pushes local `OfflineJournal` Sync Jobs to Supabase cloud PostgreSQL when network connectivity is active, handling exponential backoff retries.
* **Status:** Planned (Phase 4)

---

### PD-036: Bidirectional Realtime Sync & Conflict Resolution Engine (Roadmap)
* **Decision:** Phase 5 multi-device synchronization. Realtime WebSockets (Supabase Realtime) subscription for instant cross-device updates (Waiter Tablets, KDS, BDS, Cashier POS) with optimistic versioning conflict resolution and delta-merging.
* **Status:** Planned (Phase 5)





















