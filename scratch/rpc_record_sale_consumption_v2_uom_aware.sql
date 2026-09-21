-- ==============================================================================
-- 🌊 ANCHOR RESTAURANTOS: rpc_record_sale_consumption v2 (UOM-AWARE)
-- Target: Supabase Cloud PostgreSQL (orlcftjkhqypvqzcmfci)
-- Run in: https://supabase.com/dashboard/project/orlcftjkhqypvqzcmfci/sql
--
-- WHY: The deployed v1 validates/posts p_items.quantity against
-- stock_balances.quantity WITHOUT any unit conversion. A recipe line of
-- "200 ML" vs an LTR-based balance of 9.4 was compared as 200 > 9.4 and
-- threw a FALSE INSUFFICIENT_STOCK, silently blocking bar cocktail deduction.
-- v2 normalizes every line to the target balance's base UOM (identical
-- conversion table as the client _convertDeductionQuantity), so the database
-- is safe for ANY caller, not just the normalized Anchor web client.
--
-- NON-DESTRUCTIVE: CREATE OR REPLACE keeps the exact signature & grants.
-- Idempotency guard, all-or-nothing shortage validation and JSONB balance
-- projection sync are preserved from v1.
-- ==============================================================================

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
    p_items JSONB -- Array of { itemCode, itemName, locationCode, quantity, uom }
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
    -- Step 1: Operation-Level Idempotency Guard
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

    -- Step 2: All-or-Nothing Availability Validation with UOM Normalization.
    -- Each line is converted from its recipe/BOM UOM into the balance's base
    -- UOM before comparison, and carried forward already-normalized into Step 4
    -- so ledger and projection can never disagree with the validation.
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        "itemCode" TEXT, "itemName" TEXT, "locationCode" TEXT,
        item_code TEXT, item_name TEXT, location_code TEXT,
        itemcode TEXT, itemname TEXT, locationcode TEXT,
        quantity NUMERIC, uom TEXT
    ) LOOP
        -- Tolerate camelCase, lowercase and snake_case payload key conventions
        -- (callers historically differ; unquoted camelCase in SQL folds to lowercase).
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

        -- Balance base UOM: embedded data payload, else Bar=LTR / Kitchen=KG invariant.
        v_bal_uom := UPPER(TRIM(COALESCE(
            NULLIF(v_bal.data ->> 'baseUom', ''),
            NULLIF(v_bal.data ->> 'base_uom', ''),
            NULLIF(v_bal.data ->> 'uom', ''),
            CASE WHEN v_item_code LIKE 'BAR%' THEN 'LTR' ELSE 'KG' END
        )));

        -- Normalization table mirrors client _convertDeductionQuantity
        -- (liquid density equivalence: 1 KG = 1 LTR, 1 G = 1 ML).
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
            ELSE v_raw_qty  -- unknown/PCS-style pair: pass through unchanged
        END;
        v_deduct_qty := ROUND(v_deduct_qty, 4);

        IF v_bal.quantity < v_deduct_qty THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item % at % requires % % (raw: % %), but only % is available',
                v_item_code, v_loc_code, v_deduct_qty, v_bal_uom,
                v_raw_qty, COALESCE(NULLIF(v_from_uom, ''), '-'), v_bal.quantity;
        END IF;

        -- Carry the validated, normalized line into the posting loop.
        v_norm_items := v_norm_items || jsonb_build_object(
            'itemCode', v_item_code,
            'itemName', v_item_name,
            'locationCode', v_loc_code,
            'quantity', v_deduct_qty,
            'uom', v_bal_uom,
            'balanceId', v_bal.id
        );
    END LOOP;

    -- Step 3: Insert Operation Header
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

    -- Step 4: Record Transactions & Update Balance Projections Atomically
    -- (quantities here are already normalized & validated; no re-read guessing)
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

        -- Insert Immutable Transaction Line (uom = balance uom for exact reconciliation)
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

        -- Update Balance Projection and Synchronize JSONB Data in Lockstep (stripping legacy data.data nesting)
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

GRANT EXECUTE ON FUNCTION public.rpc_record_sale_consumption TO anon, authenticated, service_role;

-- ==============================================================================
-- POST-DEPLOY VERIFICATION (optional, run after the function is created):
-- An idempotent-replay probe proves the new function is live without mutating
-- any stock (returns the cached header for an operation that already exists):
--
-- SELECT public.rpc_record_sale_consumption(
--   'tenant_h0qc7wf', 'cons_tenant_h0qc7wf_ord_bk1i0b5_line_ord_bk1i0b5_1',
--   'ord_bk1i0b5', 'line_ord_bk1i0b5_1', NULL, 'v1.0', NOW(), 'Verify', NULL,
--   '[{"itemCode":"BAR0027","itemName":"Gin","locationCode":"LOC-314","quantity":60,"uom":"ML"}]'::jsonb
-- );
-- Expected: {"success": true, "idempotentReplay": true, ...}
-- ==============================================================================
