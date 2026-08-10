# Phase 0.1: Ubiquitous Language

Every term in RestaurantOS has exactly one definition across product specification, code, database, APIs, UI, and event channels.

---

## Dictionary of Terms

| Term | Domain Scope | Definition |
| :--- | :--- | :--- |
| **Table Session** | Front of House | The operational context for a table from initial seating until guest departure and table cleaning is complete. |
| **Order** | Front of House | A collection of requested menu items submitted by a waiter within an active Table Session. |
| **Order Item** | Front of House / Production | An individual sellable menu item with associated modifiers, notes, quantity, and preparation status. |
| **KOT (Kitchen Order Ticket)** | Kitchen Production | A production ticket derived exclusively from food order items requiring kitchen preparation. |
| **BOT (Bar Order Ticket)** | Bar Production | A production ticket derived exclusively from beverage order items requiring bar preparation. |
| **Production Specification** | Kitchen / Bar / Inventory | Defines how a menu item consumes inventory ingredients, yields, and preparation steps. |
| **Recipe** | Kitchen / Bar | The ingredient blueprint and measurement ratios attached to a Production Specification. |
| **Bill** | Billing / Finance | The legal financial representation of one or more orders generated for guest settlement. |
| **Payment** | Cashier / Finance | A settlement transaction (Cash, UPI QR, Card) linked against a generated Bill. |
| **Inventory Item** | Inventory | A tracked physical ingredient or raw material stored in the restaurant stock room. |
| **Supplier Catalogue** | Inventory / Purchasing | A locked price, package size, unit, and MOQ mapping provided by an approved vendor. |
| **Purchase Order (PO)** | Purchasing | A commercial document issued to a supplier requesting inventory restock. |
| **Shift** | HR / Operations | A defined working window during which staff clock in, perform duties, and clock out. |
| **Attendance Record** | HR / Operations | An automatically generated timestamp log tracking an employee's shift clock-in and clock-out. |
