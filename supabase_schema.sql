-- ====================================================================
-- Anchor RestaurantOS v1.0 — Enterprise Supabase PostgreSQL Schema DDL
-- SAFE & NON-DESTRUCTIVE CREATION (PRESERVES ALL EXISTING DATA):
-- https://supabase.com/dashboard/project/orlcftjkhqypvqzcmfci/sql
-- ====================================================================

-- 🏢 1. Tenants Master Table
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  admin_name TEXT,
  admin_pin TEXT,
  profile_version INT DEFAULT 1,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🔑 2. Identities & Employees Tables
CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  pin_hash TEXT,
  tenant_id TEXT,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  identity_id TEXT,
  tenant_id TEXT,
  employee_code TEXT,
  name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  workspace_default TEXT,
  status TEXT DEFAULT 'ACTIVE',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🪑 3. Dining Areas & Dining Tables Assets
CREATE TABLE IF NOT EXISTS dining_areas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  area_code TEXT,
  area_name TEXT NOT NULL,
  area_type TEXT,
  status TEXT DEFAULT 'OPEN',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tables_master (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  area_id TEXT,
  table_code TEXT NOT NULL,
  seats INT DEFAULT 4,
  shape TEXT DEFAULT 'SQUARE',
  status TEXT DEFAULT 'ACTIVE',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 📦 4. Master Product Catalog, Categories, UOMs, Locations & Suppliers
CREATE TABLE IF NOT EXISTS inventory_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  category_code TEXT NOT NULL,
  category_name TEXT NOT NULL,
  category_type TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_uoms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  uom_code TEXT NOT NULL,
  uom_name TEXT NOT NULL,
  uom_family TEXT,
  is_base_unit BOOLEAN DEFAULT TRUE,
  conversion_factor NUMERIC DEFAULT 1,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_code TEXT NOT NULL,
  location_name TEXT NOT NULL,
  parent_location_code TEXT,
  storage_type TEXT DEFAULT 'Dry',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  supplier_code TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  primary_contact TEXT,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  status TEXT DEFAULT 'ACTIVE',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  uuid TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  category_code TEXT,
  base_uom TEXT,
  opening_stock NUMERIC DEFAULT 0,
  reorder_level NUMERIC DEFAULT 0,
  unit_valuation NUMERIC DEFAULT 0,
  default_location_code TEXT,
  default_supplier_code TEXT,
  version INT DEFAULT 1,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kitchen_menu_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT DEFAULT 'GENERAL',
  description TEXT,
  selling_price NUMERIC DEFAULT 0,
  tax_profile TEXT DEFAULT 'GST_5',
  dietary_type TEXT DEFAULT 'VEG',
  portion_size TEXT DEFAULT '1 Portion',
  availability_status TEXT DEFAULT 'AVAILABLE',
  lifecycle_status TEXT DEFAULT 'ACTIVE',
  recipe_id TEXT,
  routing TEXT DEFAULT 'KITCHEN_LINE',
  recipe_notes TEXT,
  spiciness_level TEXT,
  region TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 📖 Production Recipes & BOM Tables (K-03)
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  recipe_code TEXT NOT NULL,
  recipe_name TEXT NOT NULL,
  menu_item_id TEXT,
  version TEXT DEFAULT 'v1.0',
  status TEXT DEFAULT 'DRAFT',
  yield_quantity NUMERIC DEFAULT 1,
  yield_uom TEXT DEFAULT 'PORTION',
  portion_count INT DEFAULT 1,
  prep_time_minutes INT DEFAULT 15,
  cook_time_minutes INT DEFAULT 15,
  total_cost NUMERIC DEFAULT 0,
  cost_per_portion NUMERIC DEFAULT 0,
  cost_snapshot_at_approval JSONB,
  instructions TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  tenant_id TEXT,
  inventory_item_code TEXT NOT NULL,
  inventory_item_name TEXT NOT NULL,
  item_type TEXT DEFAULT 'RAW_MATERIAL',
  quantity NUMERIC DEFAULT 0,
  uom TEXT DEFAULT 'KG',
  recipe_wastage_percent NUMERIC DEFAULT 0,
  unit_cost_snapshot NUMERIC DEFAULT 0,
  line_cost NUMERIC DEFAULT 0,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 📑 5. Inventory Transaction Tables (Purchase Orders, GRN, Transfers, Issues, Adjustments, Counts, Balances, Requests)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  po_number TEXT,
  supplier_code TEXT,
  supplier_name TEXT,
  status TEXT DEFAULT 'DRAFT',
  total_amount NUMERIC DEFAULT 0,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goods_receipt_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  grn_number TEXT,
  po_number TEXT,
  supplier_code TEXT,
  status TEXT DEFAULT 'POSTED',
  total_received_value NUMERIC DEFAULT 0,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  transfer_number TEXT,
  from_location_code TEXT,
  to_location_code TEXT,
  status TEXT DEFAULT 'COMPLETED',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_issues (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  issue_number TEXT,
  location_code TEXT,
  department TEXT,
  status TEXT DEFAULT 'POSTED',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  adjustment_number TEXT,
  location_code TEXT,
  reason TEXT,
  status TEXT DEFAULT 'POSTED',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  count_number TEXT,
  location_code TEXT,
  status TEXT DEFAULT 'COMPLETED',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_balances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  quantity NUMERIC DEFAULT 0,
  unit_cost NUMERIC DEFAULT 0,
  valuation NUMERIC DEFAULT 0,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 📑 5b. Immutable Inventory Movements Ledger & Operations (K-08 Consumption Engine)
CREATE TABLE IF NOT EXISTS stock_operations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  reference_line_id TEXT,
  recipe_id TEXT,
  recipe_version TEXT DEFAULT 'v1.0',
  occurred_at TIMESTAMPTZ NOT NULL,
  performed_by TEXT NOT NULL DEFAULT 'System',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_stock_op_idempotency UNIQUE (tenant_id, operation_id)
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED',
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  reference_line_id TEXT,
  recipe_id TEXT,
  recipe_version TEXT DEFAULT 'v1.0',
  reversal_of_operation_id TEXT,
  reversal_reason TEXT,
  item_code TEXT NOT NULL,
  item_name TEXT,
  location_code TEXT NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL,
  uom TEXT NOT NULL,
  unit_cost NUMERIC(10, 2) NOT NULL,
  total_cost NUMERIC(12, 2) NOT NULL,
  performed_by TEXT NOT NULL DEFAULT 'System',
  correlation_id TEXT,
  notes TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_stock_txn_qty CHECK (quantity != 0),
  CONSTRAINT uq_stock_txn_op_item_loc UNIQUE (tenant_id, operation_id, item_code, location_code)
);

CREATE TABLE IF NOT EXISTS inventory_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  request_number TEXT,
  department TEXT,
  status TEXT DEFAULT 'PENDING',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ⚡ 6. Offline Journal Sync Jobs & Audit Logs
CREATE TABLE IF NOT EXISTS offline_journal (
  job_id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  tenant_id TEXT,
  entity_name TEXT,
  payload JSONB,
  device_id TEXT,
  version INT DEFAULT 1,
  actor TEXT,
  correlation_id TEXT,
  sync_state TEXT DEFAULT 'SYNCED',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  time TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  correlation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Centralized Tax Configuration Authority (single editable config row per tenant).
-- The full config (GST registration, rules, categories, itemTaxMappings) is kept
-- in the JSONB `data` column; tax_configurations is read on the billing path.
CREATE TABLE IF NOT EXISTS tax_configurations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Immutable audit trail of every tax configuration change (who/when/what).
CREATE TABLE IF NOT EXISTS tax_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  actor TEXT,
  action TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  order_number TEXT,
  session_id TEXT,
  table_number INT,
  table_code TEXT,
  order_status TEXT DEFAULT 'CONFIRMED',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS table_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  table_number INT,
  table_code TEXT,
  status TEXT DEFAULT 'OCCUPIED',
  bill_status TEXT DEFAULT 'UNBILLED',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bill_revisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  session_id TEXT,
  bill_number TEXT,
  revision_number INT DEFAULT 1,
  grand_total NUMERIC DEFAULT 0,
  revision_status TEXT DEFAULT 'GENERATED',
  invoice_status TEXT DEFAULT 'NOT_ISSUED',
  payment_status TEXT DEFAULT 'UNPAID',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  session_id TEXT,
  invoice_number TEXT,
  bill_number TEXT,
  grand_total NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'ISSUED',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  session_id TEXT,
  bill_number TEXT,
  invoice_number TEXT,
  amount NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'CASH',
  status TEXT DEFAULT 'SETTLED',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  session_id TEXT,
  event_type TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STEP 2: SECURITY - Row Level Security is enforced by migration.
-- The former "DISABLE RLS + GRANT FULL ANON ACCESS" block opened the entire
-- database to the public anon key. It is intentionally REMOVED here. Tenant
-- isolation is applied by supabase/rls_policies.sql (enable + force RLS and
-- per-table tenant_isolation policies). Do NOT re-add USING (true) policies.
-- See also supabase/backfill_pin_hash.sql and supabase/functions/pin-login.
-- Server-generated GST-safe numbering and the atomic financial writes
-- (invoice_sequence, next_invoice_number, rpc_issue_invoice, rpc_record_payment)
-- live in supabase/sequences.sql; apply it after rls_policies.sql.

-- (Removed: permissive "Anon Access *" USING (true) policies and the
--  GRANT ALL ... TO anon statements. supabase/rls_policies.sql now owns
--  policy creation and role grants: anon is read-only on config tables and
--  authenticated is tenant-scoped. Apply it after deploying pin-login.)

-- ====================================================================
-- 🧾 Enterprise RPC Functions: Atomic Model-B Sale Consumption & Reversal
-- (Canonical source of truth also kept in scratch/rpc_record_sale_consumption_v2_uom_aware.sql)
-- v2 is UOM-AWARE: every p_items line is normalized to the target balance base UOM
-- (ML/LTR/G/KG + liquid equivalence KG=LTR) BEFORE stock validation and posting,
-- so raw recipe quantities (e.g. 200 ML) can never false-trigger INSUFFICIENT_STOCK
-- against LTR-based bar balances. Signatures are unchanged from v1; re-running this
-- block safely upgrades/ idempotently replays.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.rpc_record_sale_consumption(
    p_tenant_id TEXT,
    p_operation_id TEXT,
    p_reference_id TEXT,
    p_reference_line_id TEXT,
    p_recipe_id TEXT,
    p_recipe_version TEXT,
    p_occurred_at TIMESTAMPTZ,
    p_performed_by TEXT,
    p_correlation_id TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_bal RECORD;
    v_raw_qty NUMERIC;
    v_deduct_qty NUMERIC;
    v_from_uom TEXT;
    v_bal_uom TEXT;
    v_norm_uom TEXT;
    v_cur_qty NUMERIC;
    v_new_qty NUMERIC;
    v_unit_cost NUMERIC;
    v_valuation NUMERIC;
    v_txn_id TEXT;
    v_op_id TEXT;
    v_norm_items JSONB := '[]'::jsonb;
    v_inserted_txns JSONB := '[]'::jsonb;
    v_occurred TIMESTAMPTZ := COALESCE(p_occurred_at, NOW());
    v_bal_id TEXT;
    v_item_code TEXT;
    v_item_name TEXT;
    v_loc_code TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.stock_operations
        WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotentReplay', true,
            'operationId', p_operation_id
        );
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        "itemCode" TEXT, "itemName" TEXT, "locationCode" TEXT,
        item_code TEXT, item_name TEXT, location_code TEXT,
        itemcode TEXT, itemname TEXT, locationcode TEXT,
        quantity NUMERIC, uom TEXT
    ) LOOP
        -- Tolerate camelCase, lowercase and snake_case payload key conventions
        v_item_code := COALESCE(v_item."itemCode", v_item.item_code, v_item.itemcode);
        v_item_name := COALESCE(v_item."itemName", v_item.item_name, v_item.itemname);
        v_loc_code  := COALESCE(v_item."locationCode", v_item.location_code, v_item.locationcode);
        v_raw_qty := ABS(v_item.quantity);
        v_from_uom := UPPER(TRIM(COALESCE(v_item.uom, '')));

        SELECT * INTO v_bal FROM public.stock_balances
        WHERE tenant_id = p_tenant_id
          AND item_code = v_item_code
          AND location_code = v_loc_code
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item % at % requires % (%, normalized), but no balance row exists',
                v_item_code, v_loc_code, v_raw_qty, COALESCE(NULLIF(v_from_uom, ''), 'unknown uom');
        END IF;

        v_bal_uom := UPPER(TRIM(COALESCE(
            NULLIF(v_bal.data ->> 'baseUom', ''),
            NULLIF(v_bal.data ->> 'base_uom', ''),
            NULLIF(v_bal.data ->> 'uom', ''),
            CASE WHEN v_item_code LIKE 'BAR%' THEN 'LTR' ELSE 'KG' END
        )));

        v_norm_uom := CASE WHEN v_from_uom = 'L' THEN 'LTR' ELSE v_from_uom END;
        v_deduct_qty := CASE
            WHEN v_norm_uom = v_bal_uom THEN v_raw_qty
            WHEN v_norm_uom = 'ML'  AND v_bal_uom IN ('LTR', 'L') THEN v_raw_qty / 1000.0
            WHEN v_norm_uom IN ('LTR', 'L') AND v_bal_uom = 'ML' THEN v_raw_qty * 1000.0
            WHEN v_norm_uom = 'G'   AND v_bal_uom = 'KG' THEN v_raw_qty / 1000.0
            WHEN v_norm_uom = 'KG'  AND v_bal_uom = 'G'  THEN v_raw_qty * 1000.0
            WHEN v_norm_uom = 'KG'  AND v_bal_uom IN ('LTR', 'L') THEN v_raw_qty
            WHEN v_norm_uom IN ('LTR', 'L') AND v_bal_uom = 'KG' THEN v_raw_qty
            WHEN v_norm_uom = 'G'   AND v_bal_uom IN ('LTR', 'L') THEN v_raw_qty / 1000.0
            WHEN v_norm_uom = 'ML'  AND v_bal_uom = 'KG' THEN v_raw_qty / 1000.0
            ELSE v_raw_qty
        END;
        v_deduct_qty := ROUND(v_deduct_qty, 4);

        IF v_bal.quantity < v_deduct_qty THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item % at % requires % % (raw: % %), but only % is available',
                v_item_code, v_loc_code, v_deduct_qty, v_bal_uom,
                v_raw_qty, COALESCE(NULLIF(v_from_uom, ''), '-'), v_bal.quantity;
        END IF;

        v_norm_items := v_norm_items || jsonb_build_object(
            'itemCode', v_item_code,
            'itemName', v_item_name,
            'locationCode', v_loc_code,
            'quantity', v_deduct_qty,
            'uom', v_bal_uom,
            'balanceId', v_bal.id
        );
    END LOOP;

    v_op_id := 'op-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    INSERT INTO public.stock_operations (
        id, tenant_id, operation_id, operation_type, status,
        reference_type, reference_id, reference_line_id,
        recipe_id, recipe_version, occurred_at, performed_by
    ) VALUES (
        v_op_id, p_tenant_id, p_operation_id, 'SALE_CONSUMPTION', 'COMPLETED',
        'ORDER', p_reference_id, p_reference_line_id,
        p_recipe_id, p_recipe_version, v_occurred, p_performed_by
    );

    FOR v_item IN SELECT * FROM jsonb_to_recordset(v_norm_items) AS x(
        "itemCode" TEXT, "itemName" TEXT, "locationCode" TEXT,
        quantity NUMERIC, uom TEXT, "balanceId" TEXT
    ) LOOP
        SELECT * INTO v_bal FROM public.stock_balances
        WHERE tenant_id = p_tenant_id
          AND item_code = v_item."itemCode"
          AND location_code = v_item."locationCode";

        v_cur_qty := v_bal.quantity;
        v_new_qty := ROUND(v_cur_qty - v_item.quantity, 4);
        v_unit_cost := COALESCE(v_bal.unit_cost, 0);
        v_valuation := ROUND(v_new_qty * v_unit_cost, 2);
        v_txn_id := 'txn-cons-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
        v_bal_id := COALESCE(v_item."balanceId", v_bal.id);

        INSERT INTO public.stock_transactions (
            id, tenant_id, operation_id, transaction_type, status,
            reference_type, reference_id, reference_line_id,
            recipe_id, recipe_version, item_code, item_name,
            location_code, quantity, uom, unit_cost, total_cost,
            performed_by, correlation_id, occurred_at
        ) VALUES (
            v_txn_id, p_tenant_id, p_operation_id, 'SALE_CONSUMPTION', 'POSTED',
            'ORDER', p_reference_id, p_reference_line_id,
            p_recipe_id, p_recipe_version, v_item."itemCode", v_item."itemName",
            v_item."locationCode", -v_item.quantity, v_item.uom, v_unit_cost, ROUND(v_item.quantity * v_unit_cost, 2),
            p_performed_by, p_correlation_id, v_occurred
        );

        UPDATE public.stock_balances
        SET quantity = v_new_qty,
            valuation = v_valuation,
            updated_at = NOW(),
            data = jsonb_set(
                jsonb_set(COALESCE(data - 'data', '{}'::jsonb), '{quantity}', to_jsonb(v_new_qty)),
                '{valuation}', to_jsonb(v_valuation)
            )
        WHERE id = v_bal_id;

        v_inserted_txns := v_inserted_txns || jsonb_build_object(
            'transactionId', v_txn_id,
            'itemCode', v_item."itemCode",
            'locationCode', v_item."locationCode",
            'deducted', v_item.quantity,
            'uom', v_item.uom,
            'newBalance', v_new_qty
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'operationId', p_operation_id,
        'transactions', v_inserted_txns
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reverse_sale_consumption(
    p_tenant_id TEXT,
    p_reversal_operation_id TEXT,
    p_original_operation_id TEXT,
    p_reason TEXT,
    p_occurred_at TIMESTAMPTZ,
    p_performed_by TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_orig_op RECORD;
    v_txn RECORD;
    v_bal RECORD;
    v_refund_qty NUMERIC;
    v_cur_qty NUMERIC;
    v_new_qty NUMERIC;
    v_unit_cost NUMERIC;
    v_valuation NUMERIC;
    v_txn_id TEXT;
    v_op_id TEXT;
    v_reversed_txns JSONB := '[]'::jsonb;
    v_occurred TIMESTAMPTZ := COALESCE(p_occurred_at, NOW());
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.stock_operations
        WHERE tenant_id = p_tenant_id AND operation_id = p_reversal_operation_id
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotentReplay', true,
            'reversalOperationId', p_reversal_operation_id
        );
    END IF;

    SELECT * INTO v_orig_op FROM public.stock_operations
    WHERE tenant_id = p_tenant_id AND operation_id = p_original_operation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORIGINAL_OPERATION_NOT_FOUND: Operation % does not exist', p_original_operation_id;
    END IF;

    v_op_id := 'op-rev-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    INSERT INTO public.stock_operations (
        id, tenant_id, operation_id, operation_type, status,
        reference_type, reference_id, reference_line_id,
        occurred_at, performed_by, metadata
    ) VALUES (
        v_op_id, p_tenant_id, p_reversal_operation_id, 'SALE_REVERSAL', 'COMPLETED',
        v_orig_op.reference_type, v_orig_op.reference_id, v_orig_op.reference_line_id,
        v_occurred, p_performed_by, jsonb_build_object('reversalOf', p_original_operation_id, 'reason', p_reason)
    );

    -- Compensate each posted line by its STORED (already-normalized) quantity & uom,
    -- so reversals are exact regardless of the original recipe's authoring UOM.
    FOR v_txn IN
        SELECT * FROM public.stock_transactions
        WHERE tenant_id = p_tenant_id AND operation_id = p_original_operation_id AND transaction_type = 'SALE_CONSUMPTION'
    LOOP
        v_refund_qty := ABS(v_txn.quantity);

        SELECT * INTO v_bal FROM public.stock_balances
        WHERE tenant_id = p_tenant_id
          AND item_code = v_txn.item_code
          AND location_code = v_txn.location_code
        FOR UPDATE;

        IF FOUND THEN
            v_cur_qty := v_bal.quantity;
            v_new_qty := ROUND(v_cur_qty + v_refund_qty, 4);
            v_unit_cost := COALESCE(v_bal.unit_cost, 0);
            v_valuation := ROUND(v_new_qty * v_unit_cost, 2);
            v_txn_id := 'txn-rev-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

            INSERT INTO public.stock_transactions (
                id, tenant_id, operation_id, transaction_type, status,
                reference_type, reference_id, reference_line_id,
                reversal_of_operation_id, reversal_reason,
                item_code, item_name, location_code, quantity, uom,
                unit_cost, total_cost, performed_by, occurred_at
            ) VALUES (
                v_txn_id, p_tenant_id, p_reversal_operation_id, 'SALE_REVERSAL', 'POSTED',
                v_txn.reference_type, v_txn.reference_id, v_txn.reference_line_id,
                p_original_operation_id, p_reason,
                v_txn.item_code, v_txn.item_name, v_txn.location_code, v_refund_qty, v_txn.uom,
                v_txn.unit_cost, ROUND(v_refund_qty * v_unit_cost, 2), p_performed_by, v_occurred
            );

            UPDATE public.stock_balances
            SET quantity = v_new_qty,
                valuation = v_valuation,
                updated_at = NOW(),
                data = jsonb_set(
                    jsonb_set(COALESCE(data - 'data', '{}'::jsonb), '{quantity}', to_jsonb(v_new_qty)),
                    '{valuation}', to_jsonb(v_valuation)
                )
            WHERE id = v_bal.id;

            v_reversed_txns := v_reversed_txns || jsonb_build_object(
                'reversalTxnId', v_txn_id,
                'itemCode', v_txn.item_code,
                'refundedQty', v_refund_qty,
                'restoredBalance', v_new_qty
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'reversalOperationId', p_reversal_operation_id,
        'compensatedTransactions', v_reversed_txns
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_record_sale_consumption TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reverse_sale_consumption TO anon, authenticated, service_role;
