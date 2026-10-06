-- ============================================================================
-- Retail Catalogue Categories - COMPLETE one-shot migration (this module only)
-- ----------------------------------------------------------------------------
-- Safe to run in a single pass in the Supabase SQL Editor. Idempotent.
--
--   1. Creates the tenant-scoped `retail_categories` table (two-level taxonomy).
--   2. Defensively adds a `category_code` column to retail_products (the app
--      persists the tag inside the existing `data` JSONB, so this column is
--      optional / future server-side filtering only).
--   3. Seeds the default wine-shop taxonomy for tenant_h0qc7wf
--      (ON CONFLICT DO NOTHING so manager edits are never clobbered).
--   4. Enables RLS + the tenant-isolation policy for retail_categories ONLY
--      (mirrors supabase/rls_policies.sql, scoped to this one table so you do
--      NOT need to re-run the whole RLS script).
-- ============================================================================

-- 1. Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retail_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_code TEXT,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_retail_category_tenant_code UNIQUE (tenant_id, code)
);

-- 2. Defensive product column (harmless if unused by the app) -----------------
ALTER TABLE retail_products ADD COLUMN IF NOT EXISTS category_code TEXT;

-- 3. Seed the default taxonomy (parent_code NULL = top-level) -----------------
INSERT INTO retail_categories (id, tenant_id, code, name, parent_code, sort_order, status)
VALUES
  ('rc-wine',        'tenant_h0qc7wf', 'WINE',        'Wine',                    NULL,       10, 'ACTIVE'),
  ('rc-whisky',      'tenant_h0qc7wf', 'WHISKY',      'Whisky',                  NULL,       20, 'ACTIVE'),
  ('rc-beer',        'tenant_h0qc7wf', 'BEER',        'Beer',                    NULL,       30, 'ACTIVE'),
  ('rc-cider',       'tenant_h0qc7wf', 'CIDER',       'Cider',                   NULL,       40, 'ACTIVE'),
  ('rc-nonalc',      'tenant_h0qc7wf', 'NONALC',      'Non-Alcoholic & Mixers',  NULL,       50, 'ACTIVE'),

  ('rc-wine-red',       'tenant_h0qc7wf', 'WINE-RED',       'Red Wine',              'WINE',    11, 'ACTIVE'),
  ('rc-wine-white',     'tenant_h0qc7wf', 'WINE-WHITE',     'White Wine',            'WINE',    12, 'ACTIVE'),
  ('rc-wine-rose',      'tenant_h0qc7wf', 'WINE-ROSE',      'Rosé',                  'WINE',    13, 'ACTIVE'),
  ('rc-wine-sparkling', 'tenant_h0qc7wf', 'WINE-SPARKLING', 'Sparkling & Champagne', 'WINE',    14, 'ACTIVE'),
  ('rc-wine-fortified', 'tenant_h0qc7wf', 'WINE-FORTIFIED', 'Fortified & Dessert',   'WINE',    15, 'ACTIVE'),

  ('rc-whisky-isma',    'tenant_h0qc7wf', 'WHISKY-ISMA',    'Indian Single Malt',    'WHISKY',  21, 'ACTIVE'),
  ('rc-whisky-scotch',  'tenant_h0qc7wf', 'WHISKY-SCOTCH',  'Scotch',                'WHISKY',  22, 'ACTIVE'),
  ('rc-whisky-bourbon', 'tenant_h0qc7wf', 'WHISKY-BOURBON', 'Bourbon',               'WHISKY',  23, 'ACTIVE'),
  ('rc-whisky-other',   'tenant_h0qc7wf', 'WHISKY-OTHER',   'Other Whisky',          'WHISKY',  24, 'ACTIVE'),

  ('rc-beer-lager',   'tenant_h0qc7wf', 'BEER-LAGER',   'Lager',        'BEER',    31, 'ACTIVE'),
  ('rc-beer-ipa',     'tenant_h0qc7wf', 'BEER-IPA',     'IPA & Ale',    'BEER',    32, 'ACTIVE'),
  ('rc-beer-strong',  'tenant_h0qc7wf', 'BEER-STRONG',  'Strong Beer',  'BEER',    33, 'ACTIVE'),
  ('rc-beer-craft',   'tenant_h0qc7wf', 'BEER-CRAFT',   'Craft',        'BEER',    34, 'ACTIVE'),

  ('rc-cider-dry',     'tenant_h0qc7wf', 'CIDER-DRY',     'Dry',      'CIDER',    41, 'ACTIVE'),
  ('rc-cider-classic', 'tenant_h0qc7wf', 'CIDER-CLASSIC', 'Classic',  'CIDER',    42, 'ACTIVE'),
  ('rc-cider-premium', 'tenant_h0qc7wf', 'CIDER-PREMIUM', 'Premium',  'CIDER',    43, 'ACTIVE'),

  ('rc-nonalc-soft',   'tenant_h0qc7wf', 'NONALC-SOFT',   'Soft Drinks',      'NONALC',  51, 'ACTIVE'),
  ('rc-nonalc-juice',  'tenant_h0qc7wf', 'NONALC-JUICE',  'Juices',           'NONALC',  52, 'ACTIVE'),
  ('rc-nonalc-mixers', 'tenant_h0qc7wf', 'NONALC-MIXERS', 'Mixers & Soda',    'NONALC',  53, 'ACTIVE'),
  ('rc-nonalc-water',  'tenant_h0qc7wf', 'NONALC-WATER',  'Packaged Water',   'NONALC',  54, 'ACTIVE')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 4. Row Level Security for retail_categories (tenant isolation) --------------
--    Scoped to this one table so you do not need to re-run rls_policies.sql.
ALTER TABLE retail_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_retail_categories" ON retail_categories;
CREATE POLICY "tenant_isolation_retail_categories" ON retail_categories
  FOR ALL TO authenticated
  USING (tenant_id = public.jwt_tenant_id())
  WITH CHECK (tenant_id = public.jwt_tenant_id());

-- Ensure the authenticated role can read/write the new table even if this file
-- is run before the global grants in rls_policies.sql.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE retail_categories TO authenticated;
REVOKE ALL ON TABLE retail_categories FROM anon;

-- 5. Verify -------------------------------------------------------------------
SELECT count(*) AS retail_categories_seeded
FROM retail_categories
WHERE tenant_id = 'tenant_h0qc7wf';
