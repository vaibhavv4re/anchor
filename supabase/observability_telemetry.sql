-- ============================================================================
-- supabase/observability_telemetry.sql
-- Additive, non-destructive DDL for the Observability Control Center.
-- Apply on STAGING first, then production (Supabase Dashboard SQL editor or
--   supabase db push). Safe to re-run (IF NOT EXISTS / guards).
--
-- Adds the telemetry stream that every client device writes to and the owner /
-- superadmin Observatory reads from:
--   * telemetry_events - redacted, per-tenant system event/error/health stream.
-- Plus RLS (tenant isolation), realtime publication (so the Observatory can
-- live-tail) and supporting indexes.
--
-- NOTE: This table is intentionally NOT hydrated by the app's hydrateCollections
-- list and POS devices do NOT subscribe to it in REALTIME_TABLES - only the
-- Observatory opens its own scoped realtime channel when it is open, so the
-- high-frequency stream never burdens cashier/waiter/kitchen screens.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table definition
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telemetry_events (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  device_id      TEXT,
  workspace      TEXT,
  actor          TEXT,
  category       TEXT,   -- lifecycle | billing | stock | sync | error | warning | perf | other
  level          TEXT,   -- INFO | WARNING | ERROR
  event_type     TEXT,
  correlation_id TEXT,
  message        TEXT,
  data           JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Query patterns: newest-first per tenant, filter by level, and per-device drill
-- -in. Ordered indexes keep the Observatory page-load reads cheap.
CREATE INDEX IF NOT EXISTS telemetry_events_tenant_time_idx   ON telemetry_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS telemetry_events_tenant_level_idx  ON telemetry_events (tenant_id, level);
CREATE INDEX IF NOT EXISTS telemetry_events_tenant_device_idx ON telemetry_events (tenant_id, device_id);

-- ---------------------------------------------------------------------------
-- 2. RLS - standard tenant isolation (same pattern as attendance/system_config).
--    Devices write only their own tenant's rows; the Observatory reads the same.
-- ---------------------------------------------------------------------------
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_telemetry_events" ON public.telemetry_events;
CREATE POLICY "tenant_isolation_telemetry_events" ON public.telemetry_events
  FOR ALL TO authenticated
  USING (tenant_id = public.jwt_tenant_id())
  WITH CHECK (tenant_id = public.jwt_tenant_id());

-- Platform-observability: the system superadmin (JWT tenant = 'system') may READ
-- every tenant's telemetry so one owner console can watch all deployed clients.
-- This is SELECT-only and cross-tenant; writes still go through the tenant
-- isolation policy above (each device INSERTs only its own tenant's rows).
DROP POLICY IF EXISTS "observatory_superadmin_read_all" ON public.telemetry_events;
CREATE POLICY "observatory_superadmin_read_all" ON public.telemetry_events
  FOR SELECT TO authenticated
  USING (public.jwt_tenant_id() = 'system');

-- Privileges: authenticated devices INSERT; authenticated staff SELECT. No anon
-- access - telemetry is never public. service_role bypasses RLS for cleanup jobs.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT ON public.telemetry_events TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Realtime publication (only the Observatory subscribes to this stream).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER TABLE public.telemetry_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='telemetry_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_events;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Retention helper. Telemetry is high-volume; keep it bounded.
--    Run periodically (e.g. a Supabase scheduled job / pg_cron) to prune rows
--    older than 30 days. Left as a manual/incremental statement so this file
--    never deletes anything on apply.
--
--    DELETE FROM public.telemetry_events WHERE created_at < NOW() - INTERVAL '30 days';
-- ---------------------------------------------------------------------------
