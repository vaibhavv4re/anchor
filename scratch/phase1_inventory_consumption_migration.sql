-- ==============================================================================
-- 🌊 ANCHOR RESTAURANTOS: PHASE 1 INVENTORY CONSUMPTION & LEDGER MIGRATION
-- Target: Supabase Cloud PostgreSQL Instance (orlcftjkhqypvqzcmfci)
-- Dashboard: https://supabase.com/dashboard/project/orlcftjkhqypvqzcmfci/sql
-- ==============================================================================

-- 1. Operation Header Table (Enforces Operation-Level Idempotency)
CREATE TABLE IF NOT EXISTS public.stock_operations (
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

CREATE INDEX IF NOT EXISTS idx_stock_ops_idempotency ON public.stock_operations (tenant_id, operation_id);
CREATE INDEX IF NOT EXISTS idx_stock_ops_ref ON public.stock_operations (tenant_id, reference_type, reference_id);

-- 2. Append-Only Inventory Movement Ledger Table
CREATE TABLE IF NOT EXISTS public.stock_transactions (
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
    CONSTRAINT chk_stock_txn_type CHECK (
        transaction_type IN (
            'SALE_CONSUMPTION', 
            'SALE_REVERSAL', 
            'TRANSFER_OUT', 
            'TRANSFER_IN', 
            'GRN_RECEIPT', 
            'ADJUSTMENT_IN', 
            'ADJUSTMENT_OUT', 
            'WASTE_DISPOSAL', 
            'OPENING_STOCK'
        )
    ),
    CONSTRAINT uq_stock_txn_op_item_loc UNIQUE (tenant_id, operation_id, item_code, location_code)
);

CREATE INDEX IF NOT EXISTS idx_stock_txns_item_loc ON public.stock_transactions (tenant_id, item_code, location_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_txns_op ON public.stock_transactions (tenant_id, operation_id);
CREATE INDEX IF NOT EXISTS idx_stock_txns_reversal ON public.stock_transactions (tenant_id, reversal_of_operation_id) WHERE reversal_of_operation_id IS NOT NULL;

-- 3. Row Level Security Policies
ALTER TABLE public.stock_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon Access Stock Operations" ON public.stock_operations;
CREATE POLICY "Anon Access Stock Operations" ON public.stock_operations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Stock Transactions" ON public.stock_transactions;
CREATE POLICY "Anon Access Stock Transactions" ON public.stock_transactions FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.stock_operations TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.stock_transactions TO anon, authenticated, service_role;

-- 4. Stored Procedure: Atomic Sale Consumption
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
    v_deduct_qty NUMERIC;
    v_cur_qty NUMERIC;
    v_new_qty NUMERIC;
    v_unit_cost NUMERIC;
    v_valuation NUMERIC;
    v_txn_id TEXT;
    v_op_id TEXT;
    v_inserted_txns JSONB := '[]'::jsonb;
    v_occurred TIMESTAMPTZ := COALESCE(p_occurred_at, NOW());
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

    -- Step 2: All-or-Nothing Availability Validation (Row-level lock)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        itemCode TEXT, itemName TEXT, locationCode TEXT, quantity NUMERIC, uom TEXT
    ) LOOP
        v_deduct_qty := ABS(v_item.quantity);
        
        SELECT * INTO v_bal FROM public.stock_balances
        WHERE tenant_id = p_tenant_id 
          AND item_code = v_item.itemCode 
          AND location_code = v_item.locationCode
        FOR UPDATE;
        
        IF NOT FOUND OR v_bal.quantity < v_deduct_qty THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item % at % requires % %, but only % is available',
                v_item.itemCode, v_item.locationCode, v_deduct_qty, v_item.uom, COALESCE(v_bal.quantity, 0);
        END IF;
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
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        itemCode TEXT, itemName TEXT, locationCode TEXT, quantity NUMERIC, uom TEXT
    ) LOOP
        v_deduct_qty := ABS(v_item.quantity);
        
        SELECT * INTO v_bal FROM public.stock_balances
        WHERE tenant_id = p_tenant_id 
          AND item_code = v_item.itemCode 
          AND location_code = v_item.locationCode;

        v_cur_qty := v_bal.quantity;
        v_new_qty := ROUND(v_cur_qty - v_deduct_qty, 4);
        v_unit_cost := COALESCE(v_bal.unit_cost, 0);
        v_valuation := ROUND(v_new_qty * v_unit_cost, 2);
        v_txn_id := 'txn-cons-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

        -- Insert Immutable Transaction Line
        INSERT INTO public.stock_transactions (
            id, tenant_id, operation_id, transaction_type, status,
            reference_type, reference_id, reference_line_id,
            recipe_id, recipe_version, item_code, item_name,
            location_code, quantity, uom, unit_cost, total_cost,
            performed_by, correlation_id, occurred_at
        ) VALUES (
            v_txn_id, p_tenant_id, p_operation_id, 'SALE_CONSUMPTION', 'POSTED',
            'ORDER', p_reference_id, p_reference_line_id,
            p_recipe_id, p_recipe_version, v_item.itemCode, v_item.itemName,
            v_item.locationCode, -v_deduct_qty, v_item.uom, v_unit_cost, ROUND(v_deduct_qty * v_unit_cost, 2),
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
        WHERE id = v_bal.id;

        v_inserted_txns := v_inserted_txns || jsonb_build_object(
            'transactionId', v_txn_id,
            'itemCode', v_item.itemCode,
            'locationCode', v_item.locationCode,
            'deducted', v_deduct_qty,
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

-- 5. Stored Procedure: Compensating Sale Reversal
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
    -- Idempotency Guard for Reversal
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

    -- Validate Original Operation Exists
    SELECT * INTO v_orig_op FROM public.stock_operations
    WHERE tenant_id = p_tenant_id AND operation_id = p_original_operation_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORIGINAL_OPERATION_NOT_FOUND: Operation % does not exist', p_original_operation_id;
    END IF;

    -- Insert Reversal Operation Header
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

    -- Compensate Each Transaction Line
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

            -- Insert Compensating Reversal Transaction (+ Qty)
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

            -- Update Balance & Sync JSONB Data (stripping legacy data.data nesting)
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
