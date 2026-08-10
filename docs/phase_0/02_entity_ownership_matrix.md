# Phase 0.2: Entity Ownership Matrix

Every entity in RestaurantOS is owned by exactly one workspace/domain to prevent architectural overlap, conflicting mutations, and messy authorization logic.

---

## Entity Ownership Register

| Entity | Primary Owner Workspace | Modifying Roles | Read-Only Viewers |
| :--- | :--- | :--- | :--- |
| **Dining Area & Table** | Configuration | Admin, Manager | Waiter, Cashier, Owner |
| **Table Session** | Waiter Workspace | Waiter, Manager | Kitchen, Bar, Cashier, Owner |
| **Order** | Waiter Workspace | Waiter | Kitchen, Bar, Cashier, Manager |
| **Order Item** | Waiter Workspace | Waiter (creates/modifies), Chef/Bartender (status updates) | Cashier, Manager |
| **Food Menu** | Kitchen Workspace | Chef, Manager | Waiter, Cashier, Owner |
| **Beverage Menu** | Bar Workspace | Bartender, Manager | Waiter, Cashier, Owner |
| **Production Specification / Recipe** | Kitchen / Bar Workspace | Chef, Bartender | Inventory Manager, Manager |
| **Inventory Item** | Inventory Workspace | Inventory Manager | Chef, Bartender, Manager, Owner |
| **Supplier & Catalogue** | Inventory Workspace | Inventory Manager, Manager | Admin, Owner |
| **Purchase Order** | Inventory Workspace | Inventory Manager (drafts), Manager (approves) | Admin, Owner |
| **Bill** | Waiter / Cashier Workspace | Waiter (generates), Cashier (adjusts/settles) | Manager, Owner |
| **Payment** | Cashier Workspace | Cashier | Manager, Owner |
| **User & Role** | Admin Workspace | Admin, Super Admin | Manager |
| **Attendance Record** | HR / Platform | System (auto-generated on auth) | Manager, Owner, Admin |
