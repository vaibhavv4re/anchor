-- Anchor RestaurantOS - Missing PostgreSQL Tables DDL for Supabase Cloud DB

-- 1. sessions
CREATE TABLE IF NOT EXISTS public.sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    employee_id TEXT,
    employee_name TEXT,
    role_id TEXT,
    workspace TEXT,
    device_id TEXT,
    authenticated_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'ACTIVE',
    data JSONB DEFAULT '{}'::jsonb
);

-- 2. menu_catalog
CREATE TABLE IF NOT EXISTS public.menu_catalog (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT DEFAULT 'MAIN',
    price NUMERIC(10,2) DEFAULT 0.00,
    kds_station TEXT DEFAULT 'MAIN_KITCHEN',
    status TEXT DEFAULT 'AVAILABLE',
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. devices
CREATE TABLE IF NOT EXISTS public.devices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    device_type TEXT DEFAULT 'POS_TERMINAL',
    ip_address TEXT,
    status TEXT DEFAULT 'ONLINE',
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. system_config
CREATE TABLE IF NOT EXISTS public.system_config (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    config_key TEXT NOT NULL,
    config_value JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. orders
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    table_id TEXT,
    waiter_id TEXT,
    status TEXT DEFAULT 'OPEN',
    total_amount NUMERIC(10,2) DEFAULT 0.00,
    items JSONB DEFAULT '[]'::jsonb,
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. tickets (KDS)
CREATE TABLE IF NOT EXISTS public.tickets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    order_id TEXT,
    station TEXT DEFAULT 'MAIN_KITCHEN',
    status TEXT DEFAULT 'PENDING',
    items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. attendance_logs
CREATE TABLE IF NOT EXISTS public.attendance_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL,
    clock_in TIMESTAMPTZ DEFAULT NOW(),
    clock_out TIMESTAMPTZ,
    status TEXT DEFAULT 'PRESENT',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and grant access
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon Full Access" ON public.sessions FOR ALL USING (true);
CREATE POLICY "Anon Full Access" ON public.menu_catalog FOR ALL USING (true);
CREATE POLICY "Anon Full Access" ON public.devices FOR ALL USING (true);
CREATE POLICY "Anon Full Access" ON public.system_config FOR ALL USING (true);
CREATE POLICY "Anon Full Access" ON public.orders FOR ALL USING (true);
CREATE POLICY "Anon Full Access" ON public.tickets FOR ALL USING (true);
CREATE POLICY "Anon Full Access" ON public.attendance_logs FOR ALL USING (true);

-- ====================================================================
-- Cancellation workflow tables (Station-Controlled Cancellation + Disposition).
-- Dashboard-deployable DDL; RLS for these tables is owned by
-- supabase/rls_policies.sql (tenant_isolation) - do NOT add permissive
-- "Anon Full Access" policies here.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.cancellation_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  session_id TEXT,
  order_id TEXT,
  order_line_id TEXT,
  ticket_id TEXT,
  station TEXT DEFAULT 'KITCHEN',
  item_code TEXT,
  item_name TEXT,
  quantity NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'REQUESTED',
  reason_code TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prepared_item_holds (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  source_session_id TEXT,
  source_order_id TEXT,
  source_order_line_id TEXT,
  source_ticket_id TEXT,
  source_request_id TEXT,
  station TEXT DEFAULT 'KITCHEN',
  item_code TEXT,
  item_name TEXT,
  quantity NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'HELD',
  consumed_cost NUMERIC DEFAULT 0,
  waste_amount NUMERIC DEFAULT 0,
  hold_created_at TIMESTAMPTZ DEFAULT NOW(),
  hold_expires_at TIMESTAMPTZ,
  lineage TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.disposition_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  station TEXT DEFAULT 'DEFAULT',
  category_code TEXT,
  item_code TEXT,
  allow_hold BOOLEAN DEFAULT true,
  hold_minutes INT DEFAULT 0,
  default_disposition TEXT DEFAULT 'HOLD',
  decide_by TEXT DEFAULT 'STATION',
  status TEXT DEFAULT 'ACTIVE',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
