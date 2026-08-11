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
  status TEXT DEFAULT 'ACTIVE',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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

-- 🔓 STEP 2: DISABLE ROW LEVEL SECURITY (RLS) & GRANT FULL ANON ACCESS
ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE identities DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE dining_areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE tables_master DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_uoms DISABLE ROW LEVEL SECURITY;
ALTER TABLE storage_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_issues DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE offline_journal DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- Add permissive policies safely
DROP POLICY IF EXISTS "Anon Access Tenants" ON tenants;
CREATE POLICY "Anon Access Tenants" ON tenants FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Identities" ON identities;
CREATE POLICY "Anon Access Identities" ON identities FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Employees" ON employees;
CREATE POLICY "Anon Access Employees" ON employees FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Dining Areas" ON dining_areas;
CREATE POLICY "Anon Access Dining Areas" ON dining_areas FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Tables Master" ON tables_master;
CREATE POLICY "Anon Access Tables Master" ON tables_master FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Categories" ON inventory_categories;
CREATE POLICY "Anon Access Categories" ON inventory_categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access UOMs" ON inventory_uoms;
CREATE POLICY "Anon Access UOMs" ON inventory_uoms FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Storage Locations" ON storage_locations;
CREATE POLICY "Anon Access Storage Locations" ON storage_locations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Suppliers" ON suppliers;
CREATE POLICY "Anon Access Suppliers" ON suppliers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Inventory" ON inventory;
CREATE POLICY "Anon Access Inventory" ON inventory FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Purchase Orders" ON purchase_orders;
CREATE POLICY "Anon Access Purchase Orders" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Goods Receipt Notes" ON goods_receipt_notes;
CREATE POLICY "Anon Access Goods Receipt Notes" ON goods_receipt_notes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Stock Transfers" ON stock_transfers;
CREATE POLICY "Anon Access Stock Transfers" ON stock_transfers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Stock Issues" ON stock_issues;
CREATE POLICY "Anon Access Stock Issues" ON stock_issues FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Stock Adjustments" ON stock_adjustments;
CREATE POLICY "Anon Access Stock Adjustments" ON stock_adjustments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Stock Counts" ON stock_counts;
CREATE POLICY "Anon Access Stock Counts" ON stock_counts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Stock Balances" ON stock_balances;
CREATE POLICY "Anon Access Stock Balances" ON stock_balances FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Inventory Requests" ON inventory_requests;
CREATE POLICY "Anon Access Inventory Requests" ON inventory_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Offline Journal" ON offline_journal;
CREATE POLICY "Anon Access Offline Journal" ON offline_journal FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Access Audit Logs" ON audit_logs;
CREATE POLICY "Anon Access Audit Logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
