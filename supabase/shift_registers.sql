-- ============================================================
-- supabase/shift_registers.sql
-- Multi-screen source-of-truth migration for the two device-local
-- collections: shift_registers (manager) and production_batches (kitchen).
--
-- Apply in the Supabase Dashboard SQL Editor BEFORE re-running
-- rls_policies.sql / realtime.sql (both arrays now include these tables).
-- Idempotent: safe to re-run; only changes what is missing.
--
-- Shape follows the supabase_schema.sql runtime-state convention
-- (id TEXT PK + tenant_id + status + full record in data JSONB) so the
-- supabaseDataAdapter read path ({ ...row.data, ...row }) normalises rows
-- back to the exact localStorage shape with no per-collection mapping.
-- ============================================================

-- 1. Manager shift registers (businessos/platform/manager/shiftRegisterService.js).
CREATE TABLE IF NOT EXISTS shift_registers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  register_code TEXT,
  device_id TEXT,
  opened_by TEXT,
  opened_at TIMESTAMPTZ,
  counted_at TIMESTAMPTZ,
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_registers_tenant ON shift_registers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_registers_status ON shift_registers (tenant_id, status);

-- 2. Kitchen production batches (businessos/platform/kitchen/productionBatchModel.js).
CREATE TABLE IF NOT EXISTS production_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  batch_number TEXT,
  recipe_id TEXT,
  station TEXT,
  status TEXT DEFAULT 'PLANNED',
  planned_portions INT,
  actual_portions_produced INT,
  planned_by TEXT,
  completed_by TEXT,
  completed_at TIMESTAMPTZ,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_batches_tenant ON production_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_status ON production_batches (tenant_id, status);

-- 3. Enable + force RLS and add tenant-isolation policies using the
--    public.jwt_tenant_id() helper created by rls_policies.sql. Guarded so
--    this file can run standalone even if rls_policies.sql has not defined
--    the helper yet (policies are then applied by re-running rls_policies.sql,
--    whose tables array also includes these two tables).
ALTER TABLE public.shift_registers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_registers     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.production_batches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batches  FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  tables text[] := array['shift_registers', 'production_batches'];
BEGIN
  -- jwt_tenant_id() ships in rls_policies.sql; skip policy creation if the
  -- helper is not present yet (re-run rls_policies.sql after this file).
  IF to_regclass('public.shift_registers') IS NULL
     OR to_regprocedure('public.jwt_tenant_id()') IS NULL THEN
    RAISE NOTICE 'jwt_tenant_id() or tables missing - skipping policies (run rls_policies.sql after this file)';
    RETURN;
  END IF;
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'create policy "tenant_isolation_%1$s" on %1$I
         for all to authenticated
         using (tenant_id = public.jwt_tenant_id())
         with check (tenant_id = public.jwt_tenant_id())', t);
    RAISE NOTICE 'Tenant isolation policy ensured on public.%', t;
  END LOOP;
END $$;

-- 4. Realtime enablement (mirrors supabase/realtime.sql conventions).
ALTER TABLE public.shift_registers     REPLICA IDENTITY FULL;
ALTER TABLE public.production_batches  REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE
  t text;
  tables text[] := array['shift_registers', 'production_batches'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Added public.% to supabase_realtime publication', t;
    ELSE
      RAISE NOTICE 'public.% already in supabase_realtime publication (skipped)', t;
    END IF;
  END LOOP;
END $$;

-- 5. Verify (informational; SELECT output after run).
SELECT
  c.relname       AS table_name,
  CASE c.relreplident
    WHEN 'f' THEN 'FULL'
    WHEN 'd' THEN 'DEFAULT'
    WHEN 'n' THEN 'NOTHING'
    WHEN 'i' THEN 'INDEX'
  END             AS replica_identity,
  EXISTS (
    SELECT 1 FROM pg_publication_tables pt
    WHERE pt.pubname = 'supabase_realtime'
      AND pt.schemaname = 'public'
      AND pt.tablename = c.relname
  )               AS in_realtime_publication
FROM pg_class c
WHERE c.relkind = 'r'
  AND c.relname IN ('shift_registers', 'production_batches')
ORDER BY c.relname;
