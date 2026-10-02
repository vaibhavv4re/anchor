-- supabase/rls_policies.sql
--
-- Stage 1B: replace the world-open anon policies with tenant-scoped RLS.
--
-- Today supabase_schema.sql DISABLES RLS on 30 tables and creates
-- `USING (true) WITH CHECK (true)` anon policies, so the whole DB is
-- readable/writable by anyone holding the public anon key. This migration:
--   1. drops every existing policy on the managed tables;
--   2. enables + forces RLS;
--   3. adds a tenant_isolation policy keyed on the JWT claim minted by the
--      pin-login Edge Function: auth.jwt() ->> 'tenant_id';
--   4. restricts the anon role to SELECT on a small set of read-only config
--      tables only, and grants full DML to the authenticated role.
--
-- Deploy order (staging first): run AFTER pin-login is deployed and live PINs
-- are verified (Stage 1A), otherwise authenticated reads/writes will be empty.
-- service_role (used by the Edge Function) bypasses RLS by design.

-- JWT claim helper.
create or replace function public.jwt_tenant_id()
returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')
    ::json ->> 'tenant_id'
$$;

-- 1 & 2. Drop old policies, enable + force RLS on all managed tables.
do $$
declare
  t text;
  pol record;
  tables text[] := array[
    'tenants','identities','employees','dining_areas','tables_master',
    'inventory_categories','inventory_uoms','product_families','storage_locations',
    'suppliers','supplier_catalog','inventory','kitchen_menu_items','recipes',
    'recipe_ingredients','purchase_orders','goods_receipt_notes',
    'stock_transfers','stock_issues','stock_adjustments','stock_counts',
    'stock_balances','stock_operations','stock_transactions','inventory_requests',
    'offline_journal','audit_logs','orders','table_sessions','bill_revisions',
    'invoices','payments','session_audit_logs'
  ];
begin
  foreach t in array tables loop
    -- Drop every existing policy (schema uses title-cased names like
    -- "Anon Access Stock Balances", so match by catalogue, not by guessed name).
    for pol in execute format(
          'select policyname from pg_policies where schemaname = %L and tablename = %L',
          'public', t) loop
      execute format('drop policy if exists %I on %I', pol.policyname, t);
    end loop;
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- 3. Tenant-scoped policies (authenticated role sees/edits only its tenant).
do $$
declare
  t text;
  tables text[] := array[
    'tenants','identities','employees','dining_areas','tables_master',
    'inventory_categories','inventory_uoms','product_families','storage_locations',
    'suppliers','supplier_catalog','inventory','kitchen_menu_items','recipes',
    'recipe_ingredients','purchase_orders','goods_receipt_notes',
    'stock_transfers','stock_issues','stock_adjustments','stock_counts',
    'stock_balances','stock_operations','stock_transactions','inventory_requests',
    'offline_journal','audit_logs','orders','table_sessions','bill_revisions',
    'invoices','payments','session_audit_logs'
  ];
begin
  foreach t in array tables loop
    execute format($f$
      create policy "tenant_isolation_%1$s" on %1$I
        for all to authenticated
        using (tenant_id = public.jwt_tenant_id())
        with check (tenant_id = public.jwt_tenant_id())
    $f$, t);
  end loop;
end $$;

-- 4. Role grants.
-- Deny anon all writes; allow anon SELECT only on read-only config lookups.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to anon, authenticated;

grant select on
  "inventory_categories","inventory_uoms","product_families","storage_locations","suppliers"
to anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
-- rpc_issue_invoice / rpc_record_payment (Stage 1C) are SECURITY DEFINER and run
-- as owner, bypassing client RLS while still writing the caller's tenant row.
grant execute on all functions in schema public to service_role;
