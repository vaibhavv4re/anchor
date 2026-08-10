# CANON-11: Master Data Import Specification

> **Definitive Canonical Contract for RestaurantOS Enterprise Master Data Import Engine.**  
> **Defines import templates, versioning, sequential dependency ordering, schema contracts, validation rules, update/skip/merge behavior, rollback mechanisms, and audit history logging.**

---

## 1. Import Order & Enforced Relational Dependency Sequence (PD-028 & PD-030)

Master data MUST be imported in the exact following sequential order to preserve 100% relational integrity across the ERP database:

```text
Step 1: Categories Master (01_Categories_v1.csv)
        ↓
Step 2: Units of Measure (UOM) Master (02_Units_v1.csv)
        ↓
Step 3: Storage Locations & Hierarchy (03_Storage_Locations_v1.csv)
        ↓
Step 4: Suppliers Master (04_Suppliers_v1.csv)
        ↓
Step 5: Inventory Master (05_Inventory_Master_v1.csv)
        ↓
Step 6: Opening Stock Balances (06_Opening_Stock_v1.csv)
```

> ⚠️ **PD-030 Enforcement Rule (Master Data Before Transactions):** No transactional workspace (Waiters, Cashiers, KDS/BDS, Kitchen line) may create master data. Step 5 (Inventory Master) cannot be imported until Steps 1-4 are validated and committed. Step 6 (Opening Stock) cannot be imported until Step 5 is committed. Opening stock is imported separately from Master Items because master items change rarely while stock balances update continuously.

---

## 2. File Naming Conventions, Versioning & Metadata

All import files must include versioning in the filename and header metadata:

* **File Format:** `05_Inventory_Master_v1.csv`
* **File Header Metadata (Row 1-3 comment header or JSON sidecar):**
  ```text
  # Template_Version: 1.0.0
  # System_Version: RestaurantOS v1.0
  # Generated_On: 2026-08-07T16:15:00Z
  ```

---

## 3. Internal UUID Primary Keys & Configurable Codes

* **Internal Representation:** Every master record is assigned an immutable internal UUID (e.g. `item_id`, `category_id`, `supplier_id`).
* **Configurable User Codes:** User codes (`RM0001`, `SUP-001`, `MEAT`, `LOC-MWH`) are user-configurable strings. The system requires code uniqueness within the tenant.

---

## 4. Master Template Schema Contracts

### Pack 1: `01_Categories_v1.csv`
* `Category Code *`: String e.g. `MEAT`, `SEAFOOD`, `DAIRY`, `SPICES`, `PACKAGING`. (User configurable).
* `Category Name *`: String e.g. `Meat & Poultry`, `Seafood & Shellfish`.
* `Parent Category Code`: Optional string for nesting.
* `Product Family`: Optional string e.g. `Fresh Meats`, `Goan Masalas`, `Dips & Gravies`.
* `Default Tax Profile`: Default GST e.g. `5%`.

### Pack 2: `02_Units_v1.csv`
* `UOM Code *`: String e.g. `KG`, `G`, `ML`, `LTR`, `PCS`, `DOZEN`, `CAN`, `BOTTLE`, `PACKET`.
* `UOM Name *`: String e.g. `Kilogram`, `Gram`, `Milliliter`, `Liter`, `Pieces`.
* `UOM Family *`: Enum: `Weight`, `Volume`, `Count`.
* `Base Unit Flag`: Boolean e.g. `TRUE` for KG, LTR, PCS.
* `Conversion Factor`: Numeric e.g. `1` for base, `1000` for g -> kg.

### Pack 3: `03_Storage_Locations_v1.csv`
* `Location Code *`: String e.g. `MWH`, `KITCHEN`, `BAR`.
* `Location Name *`: String e.g. `Main Warehouse`, `Kitchen Store`, `Bar Cold Room`.
* `Parent Location Code`: Optional string for generic parent-child hierarchy (`Warehouse → Store → Zone → Rack → Shelf → Bin`).
* `Storage Type`: Enum: `Dry`, `Cold Room`, `Freezer`, `Chemical Store`, `General`.

### Pack 4: `04_Suppliers_v1.csv`
* `Supplier Code *`: String e.g. `SUP-001`.
* `Supplier Name *`: String e.g. `Fresh Poultry Co`.
* `Primary Contact`: String e.g. `Ramesh Sharma`.
* `Phone`: String e.g. `+91 9876543210`.
* `Email`: String e.g. `orders@freshpoultry.com`.
* `GSTIN`: String e.g. `27AAAAA0000A1Z5`.

### Pack 5: `05_Inventory_Master_v1.csv`
* `Item Code *`: String e.g. `RM0001`, `SF0001`, `AS0001`.
* `Item Name *`: String e.g. `Chicken Boneless`, `Damao Masala`, `Beer Mug`.
* `Item Type *`: Enum (PD-028): `Raw Material`, `Semi Finished`, `Finished Good`, `Packaging`, `Consumable`, `Cleaning Supply`, `Asset`, `Service Item`.
* `Category Code *`: References `01_Categories_v1.csv`.
* `Product Family`: Optional string e.g. `Seafood`, `Goan Spice Blends`.
* `Base UOM Code *`: References `02_Units_v1.csv`.
* `Purchase UOM Code`: References `02_Units_v1.csv`.
* `Purchase Conversion Factor`: Numeric e.g. `0.5` for 500g pack -> kg.
* `Reorder Level`: Numeric e.g. `10`.
* `Default Location Code *`: References `03_Storage_Locations_v1.csv`.
* `Default Supplier Code`: References `04_Suppliers_v1.csv`.
* `Tax %`: Numeric e.g. `5`.

### Pack 6: `06_Opening_Stock_v1.csv`
* `Item Code *`: References `05_Inventory_Master_v1.csv`.
* `Location Code *`: References `03_Storage_Locations_v1.csv`.
* `Opening Quantity *`: Numeric e.g. `25`.
* `Unit Valuation Rate *`: Numeric e.g. `320`.

---

## 5. Enterprise 6-Step Import Engine Workflow & Resumable Imports (PD-029)

```text
Step 1: Upload CSV/Excel File or Select Sample Pack
        ↓
Step 2: Column Mapping & Version Verification
        ↓
Step 3: Relational Validation Engine
        ↓
Step 4: Interactive Pre-Import Preview & Smart Import Assistant
        ↓
Step 5: Commit to Database Store
        ↓
Step 6: Import Audit History Log & Summary Report
```

### Resumable Import Progress Engine
Import progress is tracked per tenant:
```text
Restaurant Import Progress
├── Step 1: Categories       [✔ COMPLETED]
├── Step 2: Units of Measure [✔ COMPLETED]
├── Step 3: Storage Locations[✔ COMPLETED]
├── Step 4: Suppliers Master [✔ COMPLETED]
├── Step 5: Inventory Master [⏳ WAITING FOR IMPORT]
└── Step 6: Opening Stock    [⏳ PENDING]
```
Admins can pause onboarding today and resume Step 5 next week without losing progress.

### Smart Import Assistant Choices
When missing dependencies are flagged:
1. `○ Create Placeholders Automatically` (Generates missing Category/UOM records on-the-fly).
2. `○ Map to Existing Items` (Opens dropdown mapper).
3. `○ Cancel Import` (Aborts transaction safely).

---

## 6. Duplicate Handling, Update vs Skip vs Merge Behavior

When an imported code already exists in the database:
* **`Update (Overwrite)`**: Updates non-primary fields (e.g. changes supplier or reorder level).
* **`Skip`**: Skips existing item codes and imports only new records.
* **`Merge`**: Merges missing fields into the existing record without overwriting non-null values.

---

## 7. Import History & Rollback System

Every import execution logs a permanent immutable entry in `Import History`:
* `Import ID` (UUID)
* `Timestamp` & `Imported By`
* `File Name & Version`
* `Records Created / Updated / Failed`
* `View Report` (Detailed line-by-line log)
* `[↩ Rollback Import]` (1-click atomic undo operation that soft-archives created records if no downstream transactions exist).

---

## 8. Item Classification Dictionary (PD-028)

| Item Type | Description & Examples |
| :--- | :--- |
| **`Raw Material`** | Fresh produce, meats, spices, raw dairy (*Chicken, Butter, Tomatoes, Kokum*). |
| **`Semi Finished`** | In-house batch preparations, signature masalas, sauces, stocks, dips (*Damao Masala, Green Dip, Seafood Stock*). |
| **`Finished Good`** | Pre-packaged items sold directly (*Bottled Water, Soft Drink Cans*). |
| **`Packaging`** | Delivery boxes, foil rolls, paper bags, sauce containers. |
| **`Consumable`** | Tissue rolls, napkins, POS paper rolls, toothpick packs. |
| **`Cleaning Supply`** | Dishwashing liquid, floor cleaners, sanitizer, sponges. |
| **`Asset`** | Operating assets (*Beer Mugs, Chairs, Coffee Machine, Gas Cylinder, Mixer Grinder*). |
| **`Service Item`** | Delivery charges, catering service fees. |
