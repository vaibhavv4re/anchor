# 7. Workspace Specifications

Every workspace is tailored for a single operational role and answers **one operational question**.

---

## 1. Waiter Workspace
* **Operational Question:** *Which guest needs me now?*
* **Primary Users:** Waiter, Head Waiter
* **Key Features:** Live Floor Map, Table Sessions, Touch Order Builder, KOT/BOT status tracker, Bill Generator, Toast Notifications.
* **Offline Capabilities:** Complete seating, order creation, and bill draft generation supported offline.

---

## 2. Kitchen Display System (KDS)
* **Operational Question:** *What should I cook next?*
* **Primary Users:** Chef, Line Cook, Sous Chef
* **Key Features:** Item-level preparation queue (`Queued` → `Preparing` → `Ready`), ticket grouping, recipe reference lookup, audio chimes.
* **Offline Capabilities:** Ticket display and item state transitions operate 100% offline.

---

## 3. Bar Display System (BDS)
* **Operational Question:** *What drink should I prepare?*
* **Primary Users:** Bartender, Bar Manager
* **Key Features:** Drink preparation queue, cocktail recipe specs, pour guides, ready notifications.
* **Offline Capabilities:** 100% functional offline.

---

## 4. Cashier Workspace
* **Operational Question:** *Which bills are waiting for payment?*
* **Primary Users:** Cashier, Billing Desk Staff
* **Key Features:** Pending bills queue, Cash/Card/UPI payment entry, receipt reprint, shift cash drawer closing, refund processing.
* **Offline Capabilities:** Cash and offline card logging supported. UPI webhooks require internet.

---

## 5. Inventory Workspace
* **Operational Question:** *What stock needs attention?*
* **Primary Users:** Inventory Manager, Store Keeper
* **Key Features:** Stock master list, supplier catalogue, Purchase Order generator, goods receiving (GRN), waste logger, stock counts.
* **Offline Capabilities:** Receiving and stock counting operate offline; syncs when online.

---

## 6. Manager Workspace
* **Operational Question:** *What needs my attention?*
* **Primary Users:** Restaurant Manager, Assistant Manager
* **Key Features:** Real-time restaurant health dashboard, live floor monitor, kitchen ticket delays alert, stock alerts, staff attendance overview, action center.
* **Offline Capabilities:** Operational dashboard updates from local state.

---

## 7. Owner Workspace
* **Operational Question:** *How is my business performing?*
* **Primary Users:** Restaurant Owner, Investor
* **Key Features:** Daily revenue, gross margins, food cost vs labor cost, sales trends, peak hour analytics, Tally accounting export.
* **Offline Capabilities:** Offline analytics cached locally.

---

## 8. Configuration & Admin Workspaces
* **Primary Users:** Super Admin, Admin
* **Key Features:** First-time system wizard, dining area/table layout builder, tax rates, ESC/POS printer routing, user PIN creation, audit logs.
