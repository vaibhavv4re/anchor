-- supabase/sequences.sql
--
-- Stage 1C: server-generated, GST-safe invoice numbering + atomic financial writes.
--
-- Problem today: invoiceModel.generateNextInvoiceSequence() derives the next
-- number client-side (max+1) and formatRecordForTable() invents row ids with
-- Math.random(). Two POS devices issuing at the same instant compute the SAME
-- number, and the number/ID a client sends can be forged because writes ride
-- the public anon REST path.
--
-- This migration moves numbering and financial inserts into SECURITY DEFINER
-- functions so the DATABASE owns the counter and the primary key. Numbering is
-- seeded from the current max so existing sequences are preserved (NON-BREAKING
-- backward-compat point 3/4). The client keeps building its rich invoice object;
-- it just stops minting the authoritative number.
--
-- Deploy order: run AFTER supabase_schema.sql and supabase/rls_policies.sql.
-- service_role (pin-login Edge Function) bypasses RLS; the RPCs below are
-- SECURITY DEFINER so they run as owner and write the caller's tenant row even
-- though the client's own role is tenant-scoped.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Per-(tenant, financial_year, series) counter table.
--    `next_value` is the last value handed out; next_invoice_number() reserves
--    atomically with INSERT .. ON CONFLICT .. RETURNING (a single row lock),
--    so parallel callers never receive the same sequence.
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_sequence (
  tenant_id      TEXT        not null,
  financial_year TEXT        not null,          -- e.g. '2026-27'
  series         TEXT        not null default 'POS',
  next_value     BIGINT      not null default 1000,
  updated_at     TIMESTAMPTZ not null default now(),
  primary key (tenant_id, financial_year, series)
);
alter table public.invoice_sequence enable row level security;
alter table public.invoice_sequence force row level security;
-- No direct client policies: only SECURITY DEFINER functions touch this table.

-- ---------------------------------------------------------------------------
-- 2. Atomic number allocator.
--    p_fy_short is the GST display fragment ('26-27'); the caller passes the
--    financial year it already computed so the number matches the invoice's FY
--    field. Returns the assigned sequence and the composed invoice_number.
--    Minimum floor of 1000 mirrors the existing client convention (first real
--    invoice = 1001) to avoid colliding with legacy low numbers.
-- ---------------------------------------------------------------------------
create or replace function public.next_invoice_number(
  p_tenant_id TEXT,
  p_financial_year TEXT,
  p_series TEXT default 'POS'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq   BIGINT;
  v_fy_short TEXT;
  v_number   TEXT;
begin
  if p_tenant_id is null or p_tenant_id = '' then
    raise exception 'NEXT_INVOICE_NUMBER: tenant_id is required';
  end if;

  -- '2026-27' -> '26-27' for the INV/<fy>/<seq> display form.
  v_fy_short := replace(replace(coalesce(p_financial_year, '0000-00'), '20', ''), '-20', '-');

  insert into public.invoice_sequence (tenant_id, financial_year, series, next_value, updated_at)
  values (p_tenant_id, p_financial_year, p_series, 1001, now())
  on conflict (tenant_id, financial_year, series)
  do update set next_value = public.invoice_sequence.next_value + 1,
                updated_at = now()
  returning next_value into v_seq;

  v_number := 'INV/' || v_fy_short || '/' || v_seq;

  return jsonb_build_object(
    'financialYear', p_financial_year,
    'invoiceSeries', p_series,
    'invoiceSequence', v_seq,
    'invoiceNumber', v_number
  );
end $$;

-- ---------------------------------------------------------------------------
-- 3. Seed counters from already-issued invoices so a cutover never reuses a
--    number that is live today. Safe to re-run (only raises the floor).
-- ---------------------------------------------------------------------------
insert into public.invoice_sequence (tenant_id, financial_year, series, next_value)
select
  i.tenant_id,
  coalesce(nullif(i.data ->> 'financialYear', ''), 'seed') as financial_year,
  'POS',
  max(
    case
      when i.invoice_number ~ '/\d{4}$'
      then (substring(i.invoice_number from '/(\d{4})$'))::bigint
      else 1000
    end
  )
from public.invoices i
where i.tenant_id is not null and i.tenant_id <> ''
group by i.tenant_id, 2
on conflict (tenant_id, financial_year, series)
do update set next_value = greatest(public.invoice_sequence.next_value, excluded.next_value),
              updated_at = now();

-- ---------------------------------------------------------------------------
-- 4. Atomic, un-forgeable invoice issuance.
--    Stamps the authoritative number + a server uuid PK, then inserts the row.
--    Idempotent on session: an already-issued session returns the existing
--    invoice (mirrors the client-side getInvoiceForSession short-circuit).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_issue_invoice(
  p_tenant_id TEXT,
  p_session_id TEXT,
  p_series TEXT default 'POS',
  p_financial_year TEXT default null,
  p_payload JSONB default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant TEXT := coalesce(nullif(p_tenant_id, ''), public.jwt_tenant_id());
  v_existing JSONB;
  v_fy TEXT;
  v_alloc JSONB;
  v_seq BIGINT;
  v_number TEXT;
  v_id TEXT;
  v_total NUMERIC;
begin
  if v_tenant is null or v_tenant = '' then
    raise exception 'RPC_ISSUE_INVOICE: no tenant in context';
  end if;

  -- Idempotent replay: invoice already issued for this session.
  select to_jsonb(i) into v_existing
    from public.invoices i
   where i.tenant_id = v_tenant
     and (i.session_id = p_session_id or i.data ->> 'sessionId' = p_session_id)
   limit 1;
  if v_existing is not null then
    return jsonb_build_object(
      'success', true,
      'idempotentReplay', true,
      'id', v_existing ->> 'id',
      'invoiceNumber', v_existing ->> 'invoice_number',
      'invoiceSequence', (v_existing -> 'data' ->> 'invoiceSequence')::bigint
    );
  end if;

  v_fy := coalesce(
    nullif(p_financial_year, ''),
    nullif(p_payload ->> 'financialYear', ''),
    nullif(p_payload -> 'data' ->> 'financialYear', ''),
    to_char(now(), 'YYYY') || '-' || to_char(now() + interval '1 year', 'YY')
  );

  v_alloc := public.next_invoice_number(v_tenant, v_fy, p_series);
  v_seq := (v_alloc ->> 'invoiceSequence')::bigint;
  v_number := v_alloc ->> 'invoiceNumber';
  v_id := 'inv_' || replace(gen_random_uuid()::text, '-', '');
  v_total := coalesce(
    (p_payload ->> 'grandTotal')::numeric,
    (p_payload -> 'grand_total')::numeric,
    0
  );

  insert into public.invoices (id, tenant_id, session_id, invoice_number, bill_number, grand_total, status, data)
  values (
    v_id,
    v_tenant,
    p_session_id,
    v_number,
    coalesce(p_payload ->> 'billNumber', p_payload ->> 'bill_number', ''),
    v_total,
    'ISSUED',
    p_payload || jsonb_build_object(
      'id', v_id,
      'invoiceNumber', v_number,
      'invoice_number', v_number,
      'invoiceSequence', v_seq,
      'financialYear', v_fy,
      'invoiceSeries', p_series
    )
  );

  -- Server-side, append-only audit (un-forgeable: written by SECURITY DEFINER,
  -- not the client). Stage 4 observability.
  insert into public.audit_logs (id, tenant_id, time, user_name, action, correlation_id, created_at)
  values (
    'aud_' || replace(gen_random_uuid()::text, '-', ''),
    v_tenant,
    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    coalesce(nullif(p_payload ->> 'cashierName', ''), nullif(p_payload ->> 'receivedByName', ''), 'system'),
    'INVOICE_ISSUED ' || v_number,
    coalesce(nullif(p_payload ->> 'correlationId', ''), nullif(p_payload ->> 'correlation_id', ''))
  );

  return jsonb_build_object(
    'success', true,
    'id', v_id,
    'invoiceNumber', v_number,
    'invoiceSequence', v_seq,
    'financialYear', v_fy,
    'invoiceSeries', p_series
  );
end $$;

-- ---------------------------------------------------------------------------
-- 5. Atomic, un-forgeable payment ledger insert.
--    Keeps the invoice number that rpc_issue_invoice assigned; server mints the
--    payment PK. Idempotent on correlation_id so a retried flush never
--    double-books (Stage 2B idempotency relies on this).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_record_payment(
  p_tenant_id TEXT,
  p_session_id TEXT,
  p_invoice_number TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT default 'CASH',
  p_correlation_id TEXT default null,
  p_payload JSONB default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant TEXT := coalesce(nullif(p_tenant_id, ''), public.jwt_tenant_id());
  v_id TEXT;
  v_existing JSONB;
begin
  if v_tenant is null or v_tenant = '' then
    raise exception 'RPC_RECORD_PAYMENT: no tenant in context';
  end if;

  -- Idempotent replay on correlation_id.
  if p_correlation_id is not null and p_correlation_id <> '' then
    select to_jsonb(pm) into v_existing
      from public.payments pm
     where pm.tenant_id = v_tenant
       and (pm.data ->> 'correlationId' = p_correlation_id)
     limit 1;
    if v_existing is not null then
      return jsonb_build_object(
        'success', true,
        'idempotentReplay', true,
        'id', v_existing ->> 'id',
        'paymentId', v_existing ->> 'id'
      );
    end if;
  end if;

  v_id := 'pay_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.payments (id, tenant_id, session_id, bill_number, invoice_number, amount, payment_method, status, data)
  values (
    v_id,
    v_tenant,
    p_session_id,
    coalesce(p_payload ->> 'billNumber', p_payload ->> 'bill_number', ''),
    coalesce(nullif(p_invoice_number, ''), p_payload ->> 'invoiceNumber', ''),
    coalesce(p_amount, 0),
    upper(coalesce(nullif(p_payment_method, ''), 'CASH')),
    'SETTLED',
    p_payload || jsonb_build_object(
      'id', v_id,
      'paymentId', v_id,
      'correlationId', p_correlation_id
    )
  );

  -- Server-side, append-only audit (un-forgeable). Stage 4 observability.
  insert into public.audit_logs (id, tenant_id, time, user_name, action, correlation_id, created_at)
  values (
    'aud_' || replace(gen_random_uuid()::text, '-', ''),
    v_tenant,
    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    coalesce(nullif(p_payload ->> 'receivedByName', ''), nullif(p_payload ->> 'cashierName', ''), 'system'),
    'PAYMENT_RECORDED ' || coalesce(nullif(p_invoice_number, ''), 'N/A') || ' amt=' || coalesce(p_amount, 0)::text,
    p_correlation_id
  );

  return jsonb_build_object(
    'success', true,
    'id', v_id,
    'paymentId', v_id,
    'invoiceNumber', p_invoice_number
  );
end $$;

-- Explicit grants to the authenticated role (superuser/owner already has these).
grant execute on function public.next_invoice_number(text, text, text) to authenticated;
grant execute on function public.rpc_issue_invoice(text, text, text, text, jsonb) to authenticated;
grant execute on function public.rpc_record_payment(text, text, text, numeric, text, text, jsonb) to authenticated;
