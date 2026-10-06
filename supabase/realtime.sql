-- ============================================================
-- supabase/realtime.sql
-- Phase 5 - DB-side enablement required by Phase 4 (supabase-js Realtime).
--
-- Apply in the Supabase Dashboard SQL Editor AFTER rls_policies.sql.
-- Idempotent: safe to re-run; only changes what is missing.
--
-- What this enables:
--   1. REPLICA IDENTITY FULL: Realtime UPDATE/DELETE events include the full
--      old_record payload. Without it, deletes deliver only the PK and updates
--      deliver no previous values (under the DEFAULT replica identity).
--   2. Publication membership: the six operational tables are added to the
--      `supabase_realtime` publication so postgres_changes events fire for them.
--      If the publication doesn't exist yet (new project), create it.
--
-- How security is preserved:
--   Realtime Server respects RLS: each subscriber's Postgres role + JWT claims
--   determine which rows they can observe. The pin-login JWT carries
--   `tenant_id`, and rls_policies.sql already scopes SELECT to
--   `tenant_id = public.jwt_tenant_id()`. The supabaseClientFactory passes the
--   authenticated JWT via the `accessToken` callback, so subscribers receive
--   ONLY their own tenant's changes.
-- ============================================================

-- 1. Set REPLICA IDENTITY FULL on the six operational tables.
ALTER TABLE public.orders          REPLICA IDENTITY FULL;
ALTER TABLE public.table_sessions  REPLICA IDENTITY FULL;
ALTER TABLE public.bill_revisions  REPLICA IDENTITY FULL;
ALTER TABLE public.invoices        REPLICA IDENTITY FULL;
ALTER TABLE public.payments        REPLICA IDENTITY FULL;
ALTER TABLE public.stock_balances  REPLICA IDENTITY FULL;
ALTER TABLE public.cancellation_requests REPLICA IDENTITY FULL;
ALTER TABLE public.prepared_item_holds   REPLICA IDENTITY FULL;

-- 2. Ensure the `supabase_realtime` publication exists.
--    Supabase creates this by default; guard just in case.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 3. Add each operational table to the publication (idempotent loop).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'orders',
    'table_sessions',
    'bill_revisions',
    'invoices',
    'payments',
    'stock_balances',
    'cancellation_requests',
    'prepared_item_holds'
  ];
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

-- 4. Verify (informational; SELECT output after run).
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
  AND c.relname IN ('orders','table_sessions','bill_revisions','invoices','payments','stock_balances','cancellation_requests','prepared_item_holds')
ORDER BY c.relname;
