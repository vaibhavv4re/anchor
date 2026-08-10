# 10. Implementation Roadmap

Role-by-role execution roadmap organized into demonstrable, role-switchable Product Milestones and the **PD-032 Offline First Phased Architecture Roadmap**.

---

## Canonical Golden Path Journey (PD-015 to PD-032)

```text
Super Admin — Create Restaurant & Admin Account ✅
  ↓
Admin — Card 1 Business Profile & Preferences (9 Frozen Sections) ✅ (FROZEN & APPROVED)
  ↓
Admin — Admin Workspace Navigation v1.0 (Dashboard, Configuration, Commissioning, Audit Log) ✅ (FROZEN & APPROVED)
  ↓
Admin — Card 2: Dining Areas (6 Frozen Groups, Dynamic Projections & Archive-First Engine) ✅ (FROZEN & APPROVED)
  ↓
Admin — Card 3: Dining Tables / Assets (6 Frozen Groups, Bulk Engine & Asset Separation) ✅ (FROZEN & APPROVED)
  ↓
Admin — Card 4: Staff & Access (4 Logical Groups, Role Templates PD-023, 3-Step Wizard) ✅ (FROZEN & APPROVED)
  ↓
Inventory Manager — 📦 INVENTORY WORKSPACE (CANON-11 Master Data Platform, Repositories, Command Queue, Sync Engine — PD-028 to PD-032) ⏳ (UNDER REVIEW)
  ↓
Chef — Milestone 2: Production Workspace (BOM Recipes & Signature Masala Batches) ⏳
  ↓
Milestone 3 — Menu Engineering & Catalog ⏳
  ↓
Milestone 4 — Warehouse Operations (Purchase Orders, Goods Receipt, Location Transfers) ⏳
  ↓
🚀 Milestone 5: Kitchen Operations & Automated Inventory Deduction Playbook (PD-001) ⏳
```

---

## PD-032 Offline First & Cloud Synchronization Phased Roadmap

```text
                  🌐 INTERNET
                        │
                  Supabase Cloud
─────────────────────────────────────────────
 PostgreSQL • Auth • Storage • Realtime • Edge
─────────────────────────────────────────────
              ▲                 │
              │ Sync Engine     │ Realtime Broadcast
              │ (CommandQueue)  ▼
─────────────────────────────────────────────
              Restaurant Device
─────────────────────────────────────────────
 SQLite / IndexedDB (Event Store • Command Queue • Projections)
              ▲
              │ Repositories (InventoryRepository, TableRepository, etc.)
              ▼
       RestaurantOS UI (0ms Wait Time • Top-Right Sync Badge)
```

### Phase 1 — Repository Layer Abstraction (Current)
* **Objective:** Wrap all UI data interactions inside typed Repositories (`InventoryRepository`, `SupplierRepository`, `TableRepository`, `StaffRepository`, `TenantRepository`, `OrderRepository`).
* **Deliverables:**
  * UI never calls raw storage or network APIs directly.
  * Local Command Queue (`commands` collection) logging every mutation with optimistic versioning (`version`, `correlationId`).
  * Non-intrusive top-right UI Sync Status Badge (`🟢 Synced`, `🟡 Offline (N Pending)`, `🔴 Sync Failed`).

### Phase 2 — Local SQLite / IndexedDB Storage Engine
* **Objective:** Swap local repository storage backend to SQLite / IndexedDB schema matching PostgreSQL.
* **Deliverables:** SQLite database tables (`commands`, `events`, `sync_state`, `inventory`, `recipes`, `suppliers`, `sessions`, `orders`).

### Phase 3 — Supabase Cloud Integration & Unidirectional Sync (Local → Cloud)
* **Objective:** Add Supabase Auth, PostgreSQL schema, Storage adapter, and initial background worker sync engine.
* **Deliverables:** Asynchronous background push of local `CommandQueue` items to Supabase cloud.

### Phase 4 — Full Bidirectional Sync & Realtime Broadcast
* **Objective:** Downstream cloud updates, WebSockets realtime subscriptions, optimistic versioning conflict resolution, and delta-merging.
* **Deliverables:** Multi-device realtime updates across Waiter Tablets, Kitchen KDS, Bar BDS, Cashier POS.

### Phase 5 — Production Hardening & Backup Strategy
* **Objective:** Encrypted local databases, automatic nightly backups (local SQLite $\rightarrow$ Supabase Storage $\rightarrow$ USB export), sync diagnostics, and audit reporting.
