# 2. Business Capabilities

Each capability represents a single domain capability in RestaurantOS. Every capability owns exactly one concern with zero overlap across the platform.

---

## Capability Inventory

### 1. Authentication & Identity
* **Scope:** Single Super Admin, Admin onboarding, 6-digit PIN authentication, idle auto-locking, session tokens.
* **Owner:** Platform / Security

### 2. Staff Attendance & Time Tracking
* **Scope:** Automatic clock-in on PIN login, clock-out on logout, shift logging, attendance event generation.
* **Owner:** HR / Operations

### 3. Restaurant Configuration
* **Scope:** First-time restaurant profile setup, business hours, shift definitions, tax parameters, printer destinations, payment gateway settings.
* **Owner:** Configuration / Admin

### 4. Table Management & Seating
* **Scope:** Physical layout mapping (Dining Area, Bar, Outdoor), table states (Available, Reserved, Occupied, Billing, Cleaning), seating guests.
* **Owner:** Front of House

### 5. Table Sessions
* **Scope:** Active guest sessions, table assignment, session start/end timestamps, session party size, active orders mapping.
* **Owner:** Front of House

### 6. Ordering & Ticket Generation
* **Scope:** Order builder, modifiers, discounts, item note additions, splitting/combining tickets, KOT generation, BOT generation.
* **Owner:** Front of House / Kitchen Interface

### 7. Production Engine & Menu Management
* **Scope:** Food recipes (Chef owned), Beverage recipes (Bar Manager owned), production specs, yield calculation, item-level KDS/BDS queue management, auto-calculated menu availability.
* **Owner:** Kitchen & Bar Production

### 8. Automated Inventory Management
* **Scope:** Real-time stock movement tracking, automated recipe-based ingredient consumption upon item completion, waste logging, safety stock reservations, stock count adjustments, general ledger.
* **Owner:** Inventory / Supply Chain

### 9. Supplier Catalogue & Purchasing
* **Scope:** Supplier registry, item cataloguing (unit, package size, locked price, MOQ, lead time), automated Purchase Order generation, goods receipt processing.
* **Owner:** Purchasing / Store

### 10. Billing Engine
* **Scope:** Bill generation, tax calculation, split billing logic, discount verification, service charge application, receipt printing trigger.
* **Owner:** Finance / POS

### 11. Payment Processing
* **Scope:** Cash register management, UPI dynamic QR creation, Razorpay webhook handling, payment state reconciliation, automated table closing upon payment.
* **Owner:** Cashier / Finance

### 12. Real-Time Notifications
* **Scope:** Push/toast/sound notifications per workspace (e.g., "Butter Chicken Ready" to Waiter, "Stock Below Safety Threshold" to Inventory Manager).
* **Owner:** Platform Core

### 13. Audit Logging
* **Scope:** Immutable event logging of user actions, state changes, overrides, discounts, and system events.
* **Owner:** Platform Core / Compliance

### 14. Reporting & Business Intelligence
* **Scope:** Live floor operational health, kitchen summary, inventory valuation, daily sales summary, labor cost analysis, food cost margin analysis, Tally export.
* **Owner:** Management & Analytics
