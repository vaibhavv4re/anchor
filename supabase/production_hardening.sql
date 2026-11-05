-- ============================================================================
-- supabase/production_hardening.sql
-- Additive, non-destructive DDL for the Production Hardening & Cohesion plan.
-- Apply on STAGING first, then production (Supabase Dashboard SQL editor or
--   supabase db push). Safe to re-run (IF NOT EXISTS / guards).
--
-- Adds the three tables the app previously kept client-side only:
--   * roles          - canonical role catalog (reference data, cross-tenant)
--   * attendance     - clock-in/out ledger (per-tenant, multi-device)
--   * system_config  - business/hardware/printing/tax config (per-tenant)
-- plus their RLS and Realtime enablement.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table definitions
-- ---------------------------------------------------------------------------

-- Canonical roles. Reference data: identical for every tenant, never secret.
CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  workspace   TEXT,
  tenant_scoped BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '[]'::jsonb,
  data        JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance / timesheet ledger.
CREATE TABLE IF NOT EXISTS attendance (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  employee_id   TEXT,
  employee_name TEXT,
  workspace     TEXT,
  device_id     TEXT,
  clock_in_time  TIMESTAMPTZ,
  clock_out_time TIMESTAMPTZ,
  duration_ms    BIGINT,
  status         TEXT DEFAULT 'ACTIVE_SHIFT',
  data           JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS attendance_tenant_emp_idx ON attendance (tenant_id, employee_id);

-- System configuration (business profile, hardware/printers, printing, tax).
CREATE TABLE IF NOT EXISTS system_config (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  section    TEXT,           -- business | hardware | printing | payments | system
  data       JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS system_config_tenant_section_idx ON system_config (tenant_id, section);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------

-- roles: enable + force, but SELECT is allowed for ALL authenticated users
-- regardless of tenant (it is non-secret reference data). No anon writes.
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "roles_select_all" ON public.roles;
CREATE POLICY "roles_select_all" ON public.roles
  FOR SELECT TO authenticated USING (true);
-- Only tenant admins / superadmin mutate roles (service_role bypasses anyway).
DROP POLICY IF EXISTS "roles_write_admin" ON public.roles;
CREATE POLICY "roles_write_admin" ON public.roles
  FOR ALL TO authenticated
  USING ( (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::json ->> 'role_id') IN ('role-admin','role-superadmin') )
  WITH CHECK ( (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::json ->> 'role_id') IN ('role-admin','role-superadmin') );

-- attendance + system_config: standard tenant isolation (same pattern as the
-- rest of the app keyed on the pin-login JWT claim).
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_attendance" ON public.attendance;
CREATE POLICY "tenant_isolation_attendance" ON public.attendance
  FOR ALL TO authenticated
  USING (tenant_id = public.jwt_tenant_id())
  WITH CHECK (tenant_id = public.jwt_tenant_id());

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_system_config" ON public.system_config;
CREATE POLICY "tenant_isolation_system_config" ON public.system_config
  FOR ALL TO authenticated
  USING (tenant_id = public.jwt_tenant_id())
  WITH CHECK (tenant_id = public.jwt_tenant_id());

-- Privilege grants (mirror rls_policies.sql posture).
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.roles TO anon, authenticated;              -- reference data, pre-login readable
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance, public.system_config TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Realtime publication (attendance + system_config change live views)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
ALTER TABLE public.attendance    REPLICA IDENTITY FULL;
ALTER TABLE public.system_config REPLICA IDENTITY FULL;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance','system_config'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Seed the canonical role catalog (idempotent upsert).
--    Kept byte-for-byte in sync with businessos/platform/authorization/roleCatalog.js
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (id, name, workspace, tenant_scoped, permissions) VALUES
  ('role-superadmin','System Superadmin','superadmin', false, '["*"]'::jsonb),
  ('role-admin','General Manager','admin', true, '["*"]'::jsonb),
  ('role-owner','Restaurant Owner','owner', true, '["*"]'::jsonb),
  ('role-manager','Operations Manager','manager', true, '["override.lock","floor.view","kitchen.view","attendance.view","action.approve","void.approve","reports.view","staff.view"]'::jsonb),
  ('role-ca','Chartered Accountant / CA Auditor','ca', true, '["ca.view","accounting.view","reports.view","export.generate"]'::jsonb),
  ('role-chef','Head Chef','kitchen', true, '["kitchen.view","kot.update","recipe.view","inventory.view","stock.issue"]'::jsonb),
  ('role-bartender','Bartender','bar', true, '["bar.view","order.create","inventory.view","stock.issue"]'::jsonb),
  ('role-inventory','Inventory Manager','inventory', true, '["inventory.view","stock.manage","po.create","grn.create","transfer.manage"]'::jsonb),
  ('role-cashier','Cashier','cashier', true, '["cashier.view","payment.process","invoice.create","bill.view"]'::jsonb),
  ('role-waiter','Floor Server','waiter', true, '["floor.view","order.create","session.view","bill.view"]'::jsonb),
  ('role-retail-manager','Retail Manager','retail', true, '["retail.view","retail.sale","inventory.view","stock.transfer"]'::jsonb)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      workspace = EXCLUDED.workspace,
      tenant_scoped = EXCLUDED.tenant_scoped,
      permissions = EXCLUDED.permissions,
      updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 5. Seed the superadmin as a real hashed identity in the cross-tenant
--    'system' tenant (Phase 2.2). pin-login resolves it via identities when
--    the pin matches SHA-256('888888'); the SUPERADMIN_PIN env is break-glass
--    only. Idempotent.
-- ---------------------------------------------------------------------------
INSERT INTO public.identities (id, tenant_id, pin_hash, status, created_at)
VALUES ('id-superadmin', 'system',
        '92925488b28ab12584ac8fcaa8a27a0f497b2c62940c8f4fbc8ef19ebc87c43e',
        'ACTIVE', NOW())
ON CONFLICT (id) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id,
      pin_hash  = EXCLUDED.pin_hash,
      status    = 'ACTIVE';
