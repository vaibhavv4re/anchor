-- supabase/backfill_pin_hash.sql
--
-- Stage 1A NON-BREAKING GATE (login).
-- The pin-login Edge Function verifies a submitted PIN by comparing
-- SHA-256(pin) against identities.pin_hash. Today many working PINs are matched
-- client-side in authEngine (pinMap) and may NOT exist as rows in identities,
-- so before flipping AUTH_MODE=server every PIN that must keep working has to be
-- backed up here as a hash, joined to its employee row (identity_id).
--
-- The Edge function also resolves the display name/role from `employees`, so
-- each identity MUST have a matching employees row via employees.identity_id.
--
-- Run against STAGING first, confirm every live PIN logs in, then staging -> prod.
-- Requires: create extension if not exists pgcrypto;

-- Helper: hash a PIN.
--   encode(digest('<pin>', 'sha256'), 'hex')
--
-- The current staff PINs in the client pinMap are:
--   000000 Owner(Nagesh)  111111 Aabhas(chef)   222222 Suresh
--   333333 Kirtan(inventory) 444444 Sibu(bartender) 555555 Sibu
--   666666 Jitu(waiter)    777777 CA Auditor    888888 System Superadmin
--   999999 Tenant Admin    plus each tenants.admin_pin
--
-- Example pattern (ADJUST names/role/workspace to the real employees rows, and
-- reuse the tenant_id of the live tenant). Run one block per staff member.

-- create extension if not exists pgcrypto;

/*
-- 1) Ensure an identity exists for the PIN and carries the hash.
insert into identities (id, tenant_id, pin_hash, status, created_at)
values ('id-staff-666666', 'tenant_h0qc7wf', encode(digest('666666','sha256'),'hex'), 'ACTIVE', now())
on conflict (id) do update
  set pin_hash = excluded.pin_hash, status = 'ACTIVE';

-- 2) Link the employee to that identity so the Edge function can read role.
update employees
   set identity_id = 'id-staff-666666',
       role_id = 'role-waiter',
       workspace_default = 'waiter',
       tenant_id = 'tenant_h0qc7wf'
 where name ilike '%Jitu%' and tenant_id = 'tenant_h0qc7wf';
*/

-- Tenant admin PINs: store the SHA-256 hash in tenants.admin_pin (the Edge
-- function falls back to a raw match for admin only if it sees the plaintext;
-- prefer hashing). To hash existing plaintext admin_pin values in bulk:

/*
update tenants
   set admin_pin = encode(digest(admin_pin, 'sha256'), 'hex')
 where admin_pin is not null and length(admin_pin) = 6;
*/

-- NOTE: Superadmin (888888) and tenant-admin bootstrap PIN (999999) are handled
-- by the Edge function via SUPERADMIN_PIN / TENANT_ADMIN_PIN secrets, so they do
-- NOT require identities rows.
