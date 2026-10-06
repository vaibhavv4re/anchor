# Anchor RestaurantOS — Inventory Auto-Deduction Flow & Testing Playbook

> **Version:** 1.0.0 · **Tenant used in examples:** `tenant_h0qc7wf` · Companion to [USER_MANUAL.md](USER_MANUAL.md)

This document traces the **entire auto-deduction (sale consumption) pipeline** — exactly where it starts, what it touches, which menu items are eligible, and how to verify current stock eligibility for **food (kitchen)** and **bar** categories before running a test.

---

## 1. The one-sentence rule (Model B)

**Stock is NOT deducted when the order is placed.** It is deducted **when the item is marked READY** in the KDS (chef) or BDS (bartender) — the moment we know the item was actually produced. This is enforced in [productionRoutingEngine.js](file:///d:/Projects/Anchor/businessos/platform/ordering/productionRoutingEngine.js): *"Model B Architecture: Stock deduction does NOT occur on order:confirmed. Items remain QUEUED. Consumption is triggered when Chef marks KOT items READY in KDS."*

---

## 2. End-to-end flow (where it starts and where it ends)

```
WAITER (PIN 222222)                     KITCHEN (PIN 111111) / BAR (PIN 444444)
┌─────────────────────┐                 ┌──────────────────────────────────────┐
│ Seat table → order  │   order:confirm │ KDS / BDS ticket arrives as QUEUED   │
│ items → SEND KOT    │ ───────────────►│ Chef/Bartender marks line → READY    │
└─────────────────────┘                 └──────────────────┬───────────────────┘
                                                           │ updateItemStatus(READY|SERVED)
                                                           ▼
                                    productionRoutingEngine.js  (trigger gate)
                                    - fires on READY (normal flow)
                                    - ALSO fires on direct SERVED (waiter serve-all)
                                    - NEVER re-fires if already READY/SERVED
                                                           │
                                                           ▼
                                    inventoryConsumptionService.consumeForOrderLine()
                                    ① Domain split: Bar vs Kitchen
                                    ② BOM resolution (resolvedBomEngine / barConsumptionMapping)
                                    ③ UOM normalization to balance units
                                    ④ Execute deduction
                                                           │
                                              ┌────────────┴────────────┐
                                              ▼                         ▼
                                   rpc_record_sale_consumption   client atomic fallback
                                     (Supabase Postgres RPC)       (offline / RPC failure)
                                              │                         │
                                              └───────────┬─────────────┘
                                                          ▼
                                    Ledger writes (append-only):
                                    • stock_operations   → 1 header row, idempotency key
                                    • stock_transactions → 1 line per ingredient (SALE_CONSUMPTION)
                                    • stock_balances     → quantity/valuation decreased
                                                          │
                                                          ▼
                                    Events: inventory:consumed, stock:balance:updated
                                    → realtime refresh of Inventory / Bar / Kitchen views
```

Key source files:

| Step | File | Symbol |
|---|---|---|
| Trigger | [productionRoutingEngine.js](file:///d:/Projects/Anchor/businessos/platform/ordering/productionRoutingEngine.js) | `updateItemStatus` → `consumeForOrderLine` call |
| Orchestration | [inventoryConsumptionService.js](file:///d:/Projects/Anchor/businessos/platform/inventory/inventoryConsumptionService.js) | `InventoryConsumptionService.consumeForOrderLine` |
| Kitchen BOM | [resolvedBomEngine.js](file:///d:/Projects/Anchor/businessos/platform/ordering/resolvedBomEngine.js) | `resolveOrderLineBOM` |
| Bar mapping | [barConsumptionMapping.js](file:///d:/Projects/Anchor/businessos/platform/bar/barConsumptionMapping.js) | `resolveBarConsumption`, `BAR_SKU_MAP`, `BAR_COCKTAIL_CODES` |
| Reversal | same service | `reverseConsumptionForOrderLine` (void / undo-READY) |

### Trigger & guard matrix

| Event | Effect on stock |
|---|---|
| Line → `READY` (from QUEUED/PREPARING) | **Deduct** (one SALE_CONSUMPTION operation per line) |
| Line → `SERVED` directly (skips READY) | **Deduct** — same path, guarded by idempotency |
| Line `READY` → `SERVED` | No second deduction (guard `prevItemStatus !== 'READY'`) |
| Line `READY` → `PREPARING` (undo) | **Reverse** (SALE_REVERSAL restores balances) |
| Item voided / order cancelled | **Reverse** via `reverseConsumptionForOrderLine` |
| Duplicate status update / double-click | Idempotent replay — operation id `cons_<tenant>_<orderId>_<orderLineId>` returns cached success |
| Any ingredient short of stock | **All-or-nothing**: `INSUFFICIENT_STOCK` thrown, nothing is deducted for that line |

### Storage locations used for deduction

- **Bar SKUs (`BAR…`, `RC-BAR-…`)** → hard-isolated to **LOC-314 (Bar Store)**. No exceptions.
- **Kitchen ingredients (`RM…`, `SF…`, etc.)** → kitchen locations first (`LOC-886`, `LOC-KIT`, `LOC-901`, `LOC-KITCHEN`), default **LOC-886**.

---

## 3. Which items are eligible for auto-deduction (the 3 domains)

### 3.1 Kitchen / food items

An item deducts stock **only if a BOM resolves**. The resolver looks for, in order:

1. An **ACTIVE `bom_header`** for the menu item or its ordered variant; else
2. An **APPROVED or PUBLISHED recipe** linked to the menu item (by `recipeId`, `menuItemId`, or `menuItemCode`).

Outcomes when neither exists: result `SKIPPED / NO_BOM_CONFIGURED` — the sale still bills, but **no stock moves**.

### 3.2 Bar — straight pours, wines, beers, mixers (POUR / UNIT mode)

Menu codes `RC-BAR-101 … 146` and `RC-BAR-161 … 164` are explicitly mapped 1:1 to Bar Inventory SKUs in `BAR_SKU_MAP` (50 SKUs). These **always deduct** with no recipe needed:

- **POUR** — pegs/glasses (spirits, wine): peg volume (e.g. 30/60 ml) resolved from the order-line **variant**; the variant matcher now refuses blind first-variant matching (a "60 ml" line must not deduct a 30 ml peg).
- **UNIT** — sealed bottle/can (beer, breezer, soft drinks): full pack size (e.g. 0.650 LTR for a 650 ml Kingfisher).

All of it deducts from **LOC-314**.

### 3.3 Bar — cocktails & mocktails (RECIPE mode)

The 14 codes `RC-BAR-147 … 160` (Seaside Balcony, Tropical Grove, Mango Mastani, Virgin Watermelon & Basil Mojito, Shikanji, etc.) **require an APPROVED/PUBLISHED recipe BOM**:

- Recipe exists → deducts all BOM ingredients from LOC-314 (bar SKUs) / kitchen stores (fresh produce).
- Recipe missing → **hard gate**: `RECIPE_MISSING_DEDUCTION_DISABLED`, no deduction, and the BDS line shows a *Recipe Missing* warning badge (`BarDisplaySystemView._hasActiveRecipeForLine`).

> ⚠️ Known data-quality caveat: recipes authored with weight UOM (e.g. "Gin 0.6 KG" for a peg) are sanitized to liquid volume before deduction (`_sanitizeBarDeductionQuantity`), but the correct fix is authoring bar cocktail ingredients in ML/LTR.

### 3.4 Eligibility cheat-sheet

| Category | Example items | Deducts on READY? | From |
|---|---|---|---|
| Food **with** approved recipe/BOM | curated KOT dishes mapped in recipes | ✅ recipe BOM × qty | Kitchen store (LOC-886) |
| Food **without** recipe | any un-recipe'd menu item | ❌ `NO_BOM_CONFIGURED` (logged) | — |
| Straight drinks / wines / beers | whisky pegs, Kingfisher, Breezer, soda | ✅ POUR/UNIT mapping | LOC-314 |
| Cocktails **with** recipe | RC-BAR-147…160 with APPROVED recipe | ✅ BOM | LOC-314 + kitchen |
| Cocktails **without** recipe | recipe-less drinks | ❌ `RECIPE_MISSING_DEDUCTION_DISABLED` | — |
| Bar direct item misrouted to kitchen resolver | — | ❌ `BAR_DIRECT_ITEM_BYPASS_KITCHEN_BOM` (guard) | — |

---

## 4. How to check WHICH items are eligible *right now* (before testing)

Do this first — it tells you exactly which food and bar items will move stock today.

### 4.1 Via the app UI

1. **Inventory workspace (PIN `333333`)** → Recipes/BOM screens list every recipe with its `status`. Only **APPROVED / PUBLISHED** recipes participate in deduction.
2. **Inventory workspace → stock balances** (and `BarInventoryView.js` / `KitchenInventoryView.js`) → shows current quantity per SKU per location. An item is *testable* only if its ingredients have balance ≥ required deduction at the target location (else the all-or-nothing guard throws `INSUFFICIENT_STOCK`).
3. **BDS (Bar, PIN `444444`)** → any cocktail line flagged *Recipe Missing* is **not** eligible yet.

### 4.2 Via Supabase SQL (authoritative)

```sql
-- Food + bar menu items that WILL deduct (approved recipes only)
SELECT r.menu_item_code, r.menu_item_id, r.recipe_name, r.status, r.version
FROM   recipes r
WHERE  r.tenant_id = 'tenant_h0qc7wf'
  AND  r.status IN ('APPROVED','PUBLISHED')
ORDER  BY r.menu_item_code;

-- Current available stock feeding those deductions
SELECT sb.item_code, sb.location_code, sb.quantity, sb.uom
FROM   stock_balances sb
WHERE  sb.tenant_id = 'tenant_h0qc7wf'
  AND  sb.location_code IN ('LOC-314','LOC-886')   -- Bar Store / Kitchen Store
  AND  sb.quantity > 0
ORDER  BY sb.location_code, sb.item_code;

-- Bar SKUs mapped to the 14 cocktail codes need recipes too:
SELECT r.menu_item_code, r.status
FROM   recipes r
WHERE  r.menu_item_code LIKE 'RC-BAR-1%' AND r.status IN ('APPROVED','PUBLISHED');
```

Ready-made audit scripts already exist for deeper checks:
`scratch/audit-recipes-inventory.py`, `scratch/audit-re...` family, `scratch/verify_bar_inventory_contract.py`, `scratch/check_receipes.py` (see `scratch/` folder).

### 4.3 The deterministic bar contract (never changes without a code edit)

Every `RC-BAR` menu code outside `RC-BAR-147…160` is **guaranteed eligible** because `BAR_SKU_MAP` is compiled into the app. Read it in [barConsumptionMapping.js](file:///d:/Projects/Anchor/businessos/platform/bar/barConsumptionMapping.js) — 1:1 to BAR0001…BAR0050. So for a quick bar deduction test you can always order: a whisky peg (60 ml variant), a 650 ml beer, and one cocktail **that has an approved recipe**.

---

## 5. Step-by-step deduction test (food + bar in one order)

**Prereqs:** app running (`index.html` via local server), Manager + Waiter + Kitchen + Bar open (see USER_MANUAL §2.1 PIN map), and §4 eligibility check done.

1. **Record "before" balances.** Inventory workspace → note `stock_balances` for: one kitchen ingredient of your chosen food recipe (LOC-886) and one bar SKU (LOC-314, e.g. the gin in your chosen cocktail + the straight-pour spirit).
   *Or via SQL:* `SELECT item_code, location_code, quantity FROM stock_balances WHERE ...`
2. **Waiter (PIN `222222`):** seat a table → add
   - 1 food item **with an approved recipe**,
   - 1 straight drink **with an explicit peg variant (e.g. 60 ml)**,
   - 1 cocktail **with an approved recipe**,
   → **Send KOT**. Nothing moves in stock yet (Model B) — verify balances unchanged.
3. **Kitchen (PIN `111111`):** KDS shows the food line QUEUED → mark **READY**.
4. **Bar (PIN `444444`):** BDS shows the bar lines → mark **READY** on each.
5. **Verify the deduction trail:**
   - `stock_operations` has one `SALE_CONSUMPTION` header per produced line (id `cons_<tenant>_<orderId>_<lineId>`);
   - `stock_transactions` has one negative line per ingredient (`-qty`, UOM of the balance record);
   - `stock_balances` quantities dropped by exactly the BOM × order qty; bar SKUs dropped **only at LOC-314**;
   - UI: Inventory/Bar views refresh live (realtime `stock_balances`).
6. **Idempotency probe:** toggle the same line READY again / refresh and re-serve — balances must NOT drop twice.
7. **Reversal probe:** mark the line back to PREPARING (undo READY) or void it — a `SALE_REVERSAL` operation (`rev_…`) restores the exact quantity.
8. **Shortage probe (optional):** order more than available stock of a mapped bar SKU and mark READY — expect `INSUFFICIENT_STOCK`, all-or-nothing (no partial deduction).

### Console/log signatures you should see

| Meaning | Log line |
|---|---|
| RPC path succeeded | `PostgreSQL RPC rpc_record_sale_consumption success` |
| Offline fallback used | `Executing resilient client fallback...` |
| Item correctly skipped | `⚠️ RECIPE_MISSING_DEDUCTION_DISABLED ... Skipping consumption` |
| Double-deduct prevented | `Idempotent replay detected for operation "cons_..."` |
| Deduction done (fallback) | `✅ Fallback consumption completed ... Deducted N ingredients` |

---

## 6. Troubleshooting — "it didn't deduct" checklist

1. **Was the line actually marked READY (or SERVED from a non-READY state)?** Order placement alone never deducts.
2. **Food:** does an APPROVED/PUBLISHED recipe (or ACTIVE BOM) exist for that exact `menuItemId`/`menuItemCode`? Draft recipes are ignored → `NO_BOM_CONFIGURED`.
3. **Cocktail:** is it one of the 14 `BAR_COCKTAIL_CODES` without a recipe? Expected behavior is *skip + BDS badge*, not a bug.
4. **Variant mismatch (pegs):** order line says "60 ml" but stock moved for 30 ml? Check the variant resolution block in `consumeForOrderLine` — variant must match by id/name or line-name containment.
5. **Wrong location:** balance exists at LOC-886 but BOM ingredient only stocked at a stale location → `resolveLocationForItem` picks by stocked location; verify with the §4.2 SQL.
6. **UOM weirdness:** deduction looks 1000× off → recipe authored in wrong UOM; the sanitizer warns (`Bar SKU ... BOM line has weight UOM`). Fix the recipe, not the engine.
7. **Silent failure:** look for `[productionRoutingEngine] Error during sale consumption` in devtools console — the trigger is fire-and-forget with error logging, so the UI will look "normal" even if consumption failed.

---

## 7. Related automated suites (headless, no browser)

| Script | Covers |
|---|---|
| `scratch/test_b03_certification_suite.mjs` | READY trigger, shortage guard, replay idempotency (Gate 7) |
| `scratch/test_consumption_engine_certification.mjs` | double-call replay + shortage |
| `scratch/certify_bar_pipeline_progressive.mjs` | bar POUR/UNIT/RECIPE pipeline incl. cocktail safeguard |
| `scratch/certify_b03_bar_bot_bds_lifecycle.mjs` | BDS lifecycle |
| `scratch/test_b04d_reactive_alerts.mjs` | consumption → reactive alerts |

Run any with `node scratch/<name>.mjs` while pointed at the live tenant.

---

*Maintained alongside `inventoryConsumptionService.js`. If the trigger model (READY-based) or `BAR_SKU_MAP` changes, update §2/§3/§5 here and the bar/inventory notes in USER_MANUAL §4.4–4.6.*
