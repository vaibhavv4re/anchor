-- ============================================================================
-- supabase/seed_missing_identities.sql
-- Backfill the two Supabase-validated identities found missing on the live
-- project so EVERY staff role (including owner + bartender) logs in purely via
-- the pin-login Edge Function. No client-side PIN fallbacks are involved: the
-- PIN only ever appears here as SHA-256 input, stored as a hash.
--
-- Idempotent (ON CONFLICT) - safe to re-run. Apply in Supabase Dashboard ->
-- SQL editor (or `supabase db push`). Rotate the PINs afterwards if desired,
-- then re-run with the new digest.
--
-- pin-login resolves a login as:
--   identities (by pin_hash = SHA-256(pin), status ACTIVE)
--     -> employees (by identity_id = identities.id, status ACTIVE)
--     -> claims { tenant_id, role_id, workspace } from the employee row.
-- So both the identity AND a linked ACTIVE employee must exist.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Bartender - Sibu. The employee row already exists; the identity is absent.
--    Create the hashed identity and point the active bartender employee at it.
--    SHA-256('555555') = af41e68e1309fa29a5044cbdc36b90a3821d8807e68c7675a6c495112bc8a55f
-- ---------------------------------------------------------------------------
INSERT INTO public.identities (id, tenant_id, pin_hash, status)
VALUES (
  'id-staff-555555',
  'tenant_h0qc7wf',
  encode(digest('555555', 'sha256'), 'hex'),
  'ACTIVE'
)
ON CONFLICT (id) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id,
      pin_hash  = EXCLUDED.pin_hash,
      status    = 'ACTIVE';

UPDATE public.employees
   SET identity_id = 'id-staff-555555'
 WHERE tenant_id = 'tenant_h0qc7wf'
   AND role_id   = 'role-bartender'
   AND status    = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 2. Owner - no role-owner employee exists at all. Create the employee (from
--    the canonical catalog: role-owner -> workspace 'owner') AND its hashed
--    identity. EDIT the name below to the real owner before running.
-- ---------------------------------------------------------------------------
INSERT INTO public.employees
  (id, identity_id, tenant_id, name, role_id, workspace_default, status)
VALUES (
  'emp-owner-001',
  'id-staff-000000',
  'tenant_h0qc7wf',
  'Restaurant Owner',   -- <-- change to the actual owner name
  'role-owner',
  'owner',
  'ACTIVE'
)
ON CONFLICT (id) DO UPDATE
  SET identity_id       = EXCLUDED.identity_id,
      tenant_id         = EXCLUDED.tenant_id,
      name              = EXCLUDED.name,
      role_id           = EXCLUDED.role_id,
      workspace_default = EXCLUDED.workspace_default,
      status            = 'ACTIVE';

INSERT INTO public.identities (id, tenant_id, pin_hash, status)
VALUES (
  'id-staff-000000',
  'tenant_h0qc7wf',
  encode(digest('000000', 'sha256'), 'hex'),
  'ACTIVE'
)
ON CONFLICT (id) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id,
      pin_hash  = EXCLUDED.pin_hash,
      status    = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Verify: every active employee in the tenant should show a 64-hex pin_hash.
--
-- SELECT e.name, e.role_id, e.workspace_default, e.identity_id,
--        (i.pin_hash ~ '^[0-9a-f]{64}$') AS hash_ok
--   FROM public.employees e
--   LEFT JOIN public.identities i ON i.id = e.identity_id
--  WHERE e.tenant_id = 'tenant_h0qc7wf' AND e.status = 'ACTIVE'
--  ORDER BY e.role_id;
-- ---------------------------------------------------------------------------
