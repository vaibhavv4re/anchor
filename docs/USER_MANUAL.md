# Anchor RestaurantOS — Workspace User Manual & Test Guide

> **Version:** 1.0.0 · **Branch:** `architecture/realtime-modularization` · **Tenant used in examples:** `tenant_h0qc7wf`
>
> 📄 Inventory auto-deduction (sale consumption) is documented separately in **[AUTO_DEDUCTION_PLAYBOOK.md](AUTO_DEDUCTION_PLAYBOOK.md)** — flow, eligible food/bar items, and step-by-step deduction tests.
> Everything in the **PIN table** and **Live / Device-local** classification below was verified against the running code and the live Supabase project (via `scratch/validate_manager_pin_login.js` and `scratch/diagnose_manager_rows.js`).

---

## 1. Running the app

```powershell
cd d:\Projects\Anchor
npx serve .            # or: npm run dev
```

Open the printed URL (e.g. `http://localhost:3000`). The app entry is the loose ES-module graph (`index.html → main.js → bootstrap.js`), **not** `bundle.js`, so a page reload always picks up your latest source edits — no build step needed.

`index.html` loads `restaurantos/frontend/config/runtime-env.js` first, which sets `window.__APP_ENV__.AUTH_MODE = 'server'` (unless overridden at deploy). That is what makes login go through the `pin-login` Edge Function.

**Multi-browser testing tip:** use separate Chrome **profiles** (`chrome --profile-directory="Manager"`, `...="Waiter"`) so each role has its own `sessionStorage` session and its own `offlineStore` copy. Same-browser tabs share storage and will confuse the test.

---

## 2. Authentication model (read this before testing)

- **Server auth is ON** (`AUTH_MODE=server`). A PIN is verified by the `pin-login` Edge Function: it computes `SHA-256(pin)` and looks for an **`identities`** row (`pin_hash` match, `status=ACTIVE`), then **joins an `employees` row** (`identity_id` = that identity, `status=ACTIVE`) to resolve `role_id` and `workspace_default`.
- A PIN is only usable if **both** rows exist and are `ACTIVE`. A missing `employees` link makes `pin-login` silently fall back to `role-waiter`/`workspace=waiter` (this is exactly the manager bug we fixed).
- The workspace you land on is driven by the employee's `workspace_default` / role — see the table.

### 2.1 Verified PIN → workspace map

| PIN | Who | Role | Opens workspace | Verified result |
|-----|-----|------|-----------------|-----------------|
| `888888` | System Superadmin | superadmin | **Superadmin** (platform/tenant bootstrap) | ✅ 200 |
| `999999` | General Manager / Tenant Admin | admin | **Admin** | ✅ 200 |
| `123456` | Sachin — Operations Manager | manager | **Manager Cockpit** | ✅ 200 → `manager` |
| `222222` | Suresh — Floor Server | waiter | **Waiter** | ✅ 200 → `waiter` |
| `666666` | Jitu — Cashier | cashier | **Cashier / Bill Inbox** (legacy nav) | ✅ identity row exists |
| `111111` | Aabhas — Head Chef | chef | **Kitchen Tower** (legacy nav) | ✅ 200 → `kitchen` |
| `444444` | Sibu — Bartender | bartender | **Bar** | ✅ 200 → `bar` |
| `333333` | Kirtan — Inventory Manager | inventory | **Inventory** | ✅ 200 → `inventory` |
| `777777` | CA Auditor | ca | **Accounts & Compliance** | ✅ identity row exists |
| `000000` | Owner (legacy `pinMap`) | owner | — | ⚠️ **401 — no live `identities` row** (see §7) |
| `555555` | Sibu (duplicate legacy) | — | — | ⚠️ 401 — no identity row |

> `888888` and `999999` are handled by Edge-Function secrets (`SUPERADMIN_PIN`/`TENANT_ADMIN_PIN`) and do not need `identities` rows.

To (re)confirm any PIN end-to-end without opening a browser:
```powershell
node scratch/validate_manager_pin_login.js 123456
# HTTP 200 + workspace='manager'  →  login works and routes correctly
# HTTP 401                        →  no ACTIVE identities+employees backing that PIN
```

---

## 3. What is "live" (cross-browser realtime) vs device-local

The realtime layer publishes `data:changed` for **six** Supabase tables. Anything a workspace reads from these updates instantly in every open session:

**🟢 Live / realtime (propagates across browsers):** `orders`, `table_sessions`, `bill_revisions`, `invoices`, `payments`, `stock_balances`.

**📱 Device-local (this browser only — NOT broadcast):**
- `production_batches` — Kitchen/Bar "Prep & Production" batches.
- `shift_registers` — Manager/Cashier cash register open/close, cash counts, handover notes.
- `offline_journal` — the local retry queue for failed writes.
- Menu / recipes / tax config — hydrated **cloud-first on entry** (`refreshForWorkspace`) but not realtime-pushed, so they refresh when you (re)enter a workspace or tab, not mid-view.

The Manager Cockpit pulls the 6 realtime collections on entry via `dataGateway.refreshForWorkspace('manager', …)` and then live-updates.

---

## 4. Workspace-by-workspace

### 4.1 Manager Cockpit — PIN `123456`
Zone-based cockpit: **Floor · Kitchen & Bar · Money · People · Shift**. Single guarded realtime subscription in the shell; each screen follows `render()/refresh()/destroy()`.

| Screen | What it shows | Live? | How to test |
|--------|---------------|-------|-------------|
| **Floor & Tables** | Table cards with state colour, guest count, assigned server, elapsed time, **Running Bill**, kitchen prep/ready counts; **Inspect Session** drill-down | 🟢 realtime (table_sessions + orders) | Waiter seats a table → card flips colour instantly. Waiter orders → Running Bill total ticks up (fixed this release). Inspect → audit log + bill-revision breakdown. |
| **Service Pipeline** | Order-to-table flow, bottleneck diagnostic | 🟢 realtime | Place/serve orders from waiter; watch queue move. Empty state is honest ("Awaiting live orders", em-dashes — no fake SLA). |
| **Prep & Production** | Kitchen/bar batches | 📱 device-local | Batches are this-device only. Seeded demo batch was removed; shows empty unless you create real ones. |
| **Stock & 86s** | Low-stock alerts, 86'd items | 🟢 (stock_balances) + menu hydrated on entry | Cashier/POS consumes stock → balances update. |
| **Sales & Cashier** | Live sales, payment mix, tax **from config** | 🟢 realtime (invoices + payments) | Cashier settles a bill → totals/payments update. Tax labels read `getTaxRates`, not hardcoded. |
| **Discounts, Voids & Comps** | Voided lines + discount/comps with real values | 🟢 realtime (orders + bill_revisions) | Waiter voids an item → shows with correct value (e.g. 2×₹350 = ₹700). |
| **Reports & Day Summary** | Sales summary, payment reconciliation, cash drawer, ops summary, real CSV export | 🟢 + 📱 register | Cash drawer variance uses the **shift register** (device-local). Honest states: not open / not counted / real variance. |
| **Staff on Shift** | Who's clocked in (from **attendance**, not onboarding status), real clock-in times | 🟢 (attendance-derived) | Clock a staff in via the shift flow → appears. |
| **Approvals & Exceptions** | Needs-attention queue + **Acknowledge** (honest, writes an audit event; no order state changed) | 🟢 realtime | Seed button removed from production. Acknowledge persists `MANAGER_EXCEPTION_ACKNOWLEDGED`. |
| **My Shift & Handover** | Real manager identity from session, shift elapsed, cash register open/count/close + handover notes | 🟢 identity + 📱 register | Open register with a float, record a cash count → variance computes; handover notes persist device-locally (labelled "Local • not realtime"). |

### 4.2 Waiter / Floor Server — PIN `222222`
Table session lifecycle: seat guests → take orders → send KOT → mark served → finalise bill to cashier.
- **Live:** everything it writes (sessions, orders, bill_revisions) is realtime — this is the *producer* you test the Manager Floor against.
- **Test:** seat a table, order a few items, watch the **Manager Floor** card update across browsers.

### 4.3 Cashier / Billing — PIN `666666` (routes through the legacy nav: Bill Inbox, Invoice Register, Payments Ledger, Reports, My Shift)
- Finalise/collect bills, issue invoices, record payments, reopen/recall.
- **Live:** invoices + payments are realtime → reflect on Manager Sales & Cashier.
- **Improvement (see §7):** cashier has no dedicated workspace shell yet — it lands on the older sidebar nav, so it does not get the Manager's guarded-subscription treatment.

### 4.4 Kitchen / Chef — PIN `111111` (+ KDS display mode)
- **Kitchen Tower** (legacy nav) shows courses/KOT updates. **Live KDS Display** is a nav display mode (fullscreen ticket board), not a login role.
- **Live:** driven by `orders` item-status changes (realtime). Mark items READY → Manager Floor kitchen counters and Waiter update.

### 4.5 Bar — PIN `444444`
- Bar order-taking and bar inventory deductions (UOM-aware, auto-deduction on sale).
- **Live:** orders realtime; bar stock consumption writes `stock_balances` (realtime).
- **Deduction tests:** see [AUTO_DEDUCTION_PLAYBOOK.md](AUTO_DEDUCTION_PLAYBOOK.md) §4–§5 for which items are eligible right now and how to verify the ledger trail.

### 4.6 Inventory — PIN `333333`
- Master items, recipes/BOM, GRN/receipts, transfers, counts.
- **Live:** `stock_balances` realtime; inventory **master** rows hydrate cloud-first on entry (not realtime mid-view).

### 4.7 Accounts & Compliance (CA) — PIN `777777`
- Read-only fiscal/audit perspective: GST-safe invoice view, tax configuration, day summary, exports.
- **Live:** invoices/payments realtime; tax config read from `taxConfigurationModel`.

### 4.8 Admin — PIN `999999` · Superadmin — PIN `888888`
- **Admin** (General Manager): staff/role/device management, PIN reset, config edit, audit view.
- **Superadmin**: platform-level tenant bootstrap. Not a shift-ops cockpit.

### 4.9 Owner — legacy PIN `000000`
- Intended: business-level read-only overview. ⚠️ Currently **cannot log in under server auth** (no `identities` row) — see §7.

---

## 5. Golden-path multi-browser test (proves the live pipeline)

Open two Chrome profiles:
1. **Manager** → `http://localhost:3000` → PIN `123456` → **Floor & Tables**.
2. **Waiter** → same URL, other profile → PIN `222222` → seat a table.
   - ✅ Manager card turns **OCCUPIED** instantly.
3. Waiter places an order (2–3 items).
   - ✅ Manager **Running Bill** ticks up (this release's fix); kitchen prep/ready counts change.
4. Waiter marks an item served / voids a line.
   - ✅ Manager Floor + **Discounts, Voids & Comps** update; void value is correct.
5. **Cashier** (PIN `666666`, third profile) finalises the bill and records a payment.
   - ✅ Manager **Sales & Cashier** totals + payment mix update; **Reports Day Summary** reflects it.
6. Cash register (Manager **My Shift**): open with a float, record a cash count.
   - ✅ Variance computes honestly (device-local, labelled accordingly).

Headless checks (no browser needed):
```powershell
node scratch/ci_check.js                     # 181 modules parse
node scratch/test_manager_projections.js     # 28 honesty/live-computation guards
node scratch/test_manager_shell_guard.js     # 18 subscription-lifecycle guards
node scratch/test_manager_entry_smoke.js     # 11 entry-path no-throw guards
```

---

## 6. Improvement backlog — platform-wide

1. **Provision every live PIN as `identities`+`employees`** and add a CI guard that asserts each expected role resolves to the correct workspace (the manager/waiter mis-route we hit would have been caught). Ship a seeded `identities` bootstrap so `123456`-style PINs can't silently disappear.
2. **Give Cashier and Kitchen dedicated workspace shells** (like the Manager) so they inherit the single guarded realtime subscription + `refresh()/destroy()` contract, instead of the legacy `app.js` sidebar nav. Right now only Manager/Waiter/Bar/Inventory/Owner/CA/Admin/Superadmin have real shells.
3. **Realtime for the device-local data that matters to the floor**: `production_batches` and `shift_registers` are per-device, so two managers see different prep/handover state. Decide per field whether to move to Supabase + realtime, and label clearly where it stays local.
4. **Single source of truth for "Running Bill"**: the Manager Floor now sums line items pre-tax until a `bill_revision` exists. Unify with `sessionProjectionService.getSessionProjection().grandTotal` (tax-inclusive live preview) so waiter/cashier/manager show the identical figure during service.
5. **Rebuild bundle only if it is ever served** — `bundle.js` is legacy; make sure no environment actually loads it, or add a check that fails CI if the served entry diverges from `main.js`.

## 7. Known issues / caveats (current state)

- **Owner `000000` returns 401** under server auth: there is no owner `identities`/`employees` row in `tenant_h0qc7wf`. Either provision one (mirroring the manager fix) or treat Admin `999999` as the owner-equivalent. Not yet addressed.
- **`555555`** is a stale duplicate in the legacy `pinMap` with no backing identity — harmless but should be pruned.
- **Cashier & Kitchen route through the legacy nav**, so their realtime/listener behaviour differs from the Manager Cockpit (§6.2).
- **`getFloorTurnoverProjection`** (tables served, avg dwell, covers, turnover rate) is computed and unit-tested but **not surfaced** in a dedicated Manager screen yet — the natural home is a compact turnover strip on **Floor & Tables**.
- **Device-local register/handover and production batches do not sync across browsers** (by current design) — verify them in the *same* session you entered them.

---

*Maintained alongside the code. If a PIN or realtime table changes, re-run the two validation scripts and update §2.1 / §3.*
