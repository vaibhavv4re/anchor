# 4. Domain Model

The Domain Model defines every entity, property, and entity relationship within RestaurantOS. This model maps directly to the database schema.

---

## Entity Relationship Overview

```text
Restaurant (1) ───< DiningArea (N) ───< Table (N) ───< Session (N) ───< Order (N) ───< OrderItem (N)
     │                                                                                        │
     ├───< User (N) ───< Attendance (N)                                                       │
     │                                                                                        ▼
     ├───< InventoryItem (N) <─── RecipeIngredient (N) <─── Recipe (1) <──────────────────────────┘
     │            ▲
     │            └─── SupplierCatalogueItem (N) <─── Supplier (1)
     │
     └───< Bill (N) ───< Payment (N)
```

---

## Core Entities

### 1. Restaurant
* `id`: UUID (PK)
* `name`: String
* `currency`: String
* `timezone`: String
* `address`: JSON
* `contact_phone`: String
* `tax_identifiers`: JSON (GST/VAT)
* `created_at`: Timestamp

### 2. DiningArea
* `id`: UUID (PK)
* `restaurant_id`: UUID (FK)
* `name`: String (e.g. Main Hall, Terrace, Bar Area)
* `display_order`: Integer

### 3. Table
* `id`: UUID (PK)
* `dining_area_id`: UUID (FK)
* `table_number`: String
* `capacity`: Integer
* `status`: Enum (`AVAILABLE`, `RESERVED`, `OCCUPIED`, `ORDERING`, `DINING`, `BILLING`, `PAID`, `CLEANING`)
* `pos_x`: Float
* `pos_y`: Float

### 4. User / Staff
* `id`: UUID (PK)
* `restaurant_id`: UUID (FK)
* `employee_id`: String (Unique)
* `name`: String
* `role`: Enum (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `WAITER`, `CHEF`, `BARTENDER`, `CASHIER`, `INVENTORY_MANAGER`, `CLEANING_STAFF`, `OWNER`)
* `pin_hash`: String (6-digit hashed PIN)
* `is_active`: Boolean

### 5. Attendance
* `id`: UUID (PK)
* `user_id`: UUID (FK)
* `clock_in_at`: Timestamp
* `clock_out_at`: Timestamp (Nullable)
* `shift_name`: String

### 6. TableSession
* `id`: UUID (PK)
* `table_id`: UUID (FK)
* `waiter_id`: UUID (FK)
* `guest_count`: Integer
* `started_at`: Timestamp
* `ended_at`: Timestamp (Nullable)
* `status`: Enum (`ACTIVE`, `CLOSED`)

### 7. MenuItem
* `id`: UUID (PK)
* `category`: String (e.g., Starters, Main Course, Cocktails)
* `name`: String
* `description`: String
* `base_price`: Decimal
* `station`: Enum (`KITCHEN`, `BAR`)
* `is_available`: Boolean (Auto-calculated from ingredient stock)
* `recipe_id`: UUID (FK, Nullable)

### 8. Recipe & RecipeIngredient
* `recipe_id`: UUID (PK)
* `menu_item_id`: UUID (FK)
* `yield_quantity`: Float
* **RecipeIngredient:**
  * `id`: UUID (PK)
  * `recipe_id`: UUID (FK)
  * `inventory_item_id`: UUID (FK)
  * `quantity_required`: Float
  * `unit_of_measure`: String

### 9. Order & OrderItem
* **Order:**
  * `id`: UUID (PK)
  * `session_id`: UUID (FK)
  * `order_number`: Integer
  * `created_by`: UUID (FK to User)
  * `created_at`: Timestamp
* **OrderItem:**
  * `id`: UUID (PK)
  * `order_id`: UUID (FK)
  * `menu_item_id`: UUID (FK)
  * `quantity`: Integer
  * `unit_price`: Decimal
  * `modifiers`: JSON
  * `notes`: String
  * `status`: Enum (`QUEUED`, `PREPARING`, `READY`, `SERVED`, `CANCELLED`)
  * `station`: Enum (`KITCHEN`, `BAR`)
  * `kitchen_ticket_id`: UUID (FK, Nullable)

### 10. InventoryItem & StockMovement
* **InventoryItem:**
  * `id`: UUID (PK)
  * `sku`: String
  * `name`: String
  * `category`: String
  * `current_stock`: Float
  * `unit_of_measure`: String (kg, liters, pcs)
  * `min_safety_stock`: Float
  * `cost_per_unit`: Decimal
* **StockMovement:**
  * `id`: UUID (PK)
  * `inventory_item_id`: UUID (FK)
  * `movement_type`: Enum (`CONSUMPTION`, `PURCHASE`, `WASTE`, `ADJUSTMENT`, `TRANSFER`)
  * `quantity`: Float
  * `reference_id`: UUID (Order Item ID / PO ID)
  * `timestamp`: Timestamp

### 11. Supplier & SupplierCatalogue
* **Supplier:**
  * `id`: UUID (PK)
  * `name`: String
  * `contact_email`: String
  * `contact_phone`: String
* **SupplierCatalogueItem:**
  * `id`: UUID (PK)
  * `supplier_id`: UUID (FK)
  * `inventory_item_id`: UUID (FK)
  * `purchase_unit`: String
  * `package_size`: Float
  * `locked_price`: Decimal
  * `moq`: Float (Minimum Order Qty)
  * `lead_time_days`: Integer

### 12. Bill & Payment
* **Bill:**
  * `id`: UUID (PK)
  * `session_id`: UUID (FK)
  * `subtotal`: Decimal
  * `tax_amount`: Decimal
  * `discount_amount`: Decimal
  * `service_charge`: Decimal
  * `total_amount`: Decimal
  * `status`: Enum (`DRAFT`, `GENERATED`, `PENDING`, `PAID`, `CLOSED`)
  * `generated_at`: Timestamp
* **Payment:**
  * `id`: UUID (PK)
  * `bill_id`: UUID (FK)
  * `payment_method`: Enum (`CASH`, `UPI_QR`, `CARD`)
  * `transaction_reference`: String
  * `amount`: Decimal
  * `status`: Enum (`PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`)
  * `completed_at`: Timestamp
