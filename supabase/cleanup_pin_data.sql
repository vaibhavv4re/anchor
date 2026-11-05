-- ============================================================================
-- supabase/cleanup_pin_data.sql
-- ONE-TIME data-hygiene cleanup for the Production Hardening plan (Phase 3).
--
-- SAFE TO REVIEW FIRST: this only removes provably-bad rows and strips
-- plaintext PIN material. It NEVER invents credentials. Re-hashing of any
-- identity that lost its hash is done by scratch/cleanup_live_data.js (which
-- knows each staff PIN) OR by forcing a reset in the Super Admin console.
--
-- Apply on STAGING first, inspect, then production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop the empty-string hash identity (id_t1 = SHA256("")) and any identity
--    whose hash column is empty/NULL. SHA256("") is
--    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'.
-- ---------------------------------------------------------------------------
DELETE FROM public.identities
 WHERE pin_hash IS NULL
    OR pin_hash = ''
    OR pin_hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    OR id = 'id_t1';

-- ---------------------------------------------------------------------------
-- 2. Remove orphan identities that no active employee links to. An identity is
--    kept if some employee references it (employee.identity_id) or references
--    it via employee data, OR it is a superadmin/system identity.
-- ---------------------------------------------------------------------------
DELETE FROM public.identities i
 WHERE i.tenant_id <> 'system'
   AND NOT EXISTS (
     SELECT 1 FROM public.employees e
      WHERE e.identity_id = i.id
         OR e.data ->> 'identityId' = i.id
   );

-- ---------------------------------------------------------------------------
-- 3. Collapse duplicate identities that share a pin_hash within a tenant,
--    keeping the one that a live employee points at (or the oldest). A re-run
--    of scratch/cleanup_live_data.js re-links any employee left dangling.
-- ---------------------------------------------------------------------------
DELETE FROM public.identities a
 USING public.identities b
 WHERE a.id <> b.id
   AND a.tenant_id = b.tenant_id
   AND a.pin_hash = b.pin_hash
   AND a.pin_hash ~ '^[0-9a-f]{64}$'
   AND (b.id, b.created_at) < (a.id, a.created_at);

-- ---------------------------------------------------------------------------
-- 4. Normalize each employee to a single authoritative identity_id and drop the
--    mismatched embedded data.identityId (the dual-linkage drift). Prefer the
--    column value; if absent, adopt the data value into the column then clear.
-- ---------------------------------------------------------------------------
UPDATE public.employees
   SET identity_id = data ->> 'identityId'
 WHERE (identity_id IS NULL OR identity_id = '')
   AND data ? 'identityId';

UPDATE public.employees
   SET data = data - 'identityId' - 'pinDisplay' - 'pin' - 'adminPin' - 'admin_pin'
 WHERE data ? 'identityId'
    OR data ? 'pinDisplay'
    OR data ? 'pin'
    OR data ? 'adminPin'
    OR data ? 'admin_pin';

-- Also strip any plaintext PIN columns that ever landed directly on employees.
UPDATE public.employees
   SET data = data - 'pin_hash'
 WHERE data ? 'pin_hash';

-- ---------------------------------------------------------------------------
-- 5. Retire the plaintext tenants.admin_pin path. Admins now authenticate via
--    hashed identities (scratch/cleanup_live_data.js provisions the admin
--    identity). Null the plaintext column once the identity exists.
-- ---------------------------------------------------------------------------
UPDATE public.tenants
   SET admin_pin = NULL,
       data = COALESCE(data, '{}'::jsonb) - 'adminPin' - 'admin_pin'
 WHERE admin_pin IS NOT NULL
    OR data ? 'adminPin'
    OR data ? 'admin_pin';

-- ---------------------------------------------------------------------------
-- 6. Verification helper (SELECT only). After running the JS re-hash script,
--    every identity should hold a 64-hex SHA256 and each active employee should
--    resolve to exactly one identity.
-- ---------------------------------------------------------------------------
-- SELECT
--   (SELECT count(*) FROM public.identities WHERE pin_hash !~ '^[0-9a-f]{64}$') AS bad_hashes,
--   (SELECT count(*) FROM public.employees e WHERE e.identity_id IS NULL OR e.identity_id = '') AS employees_without_identity,
--   (SELECT count(*) FROM public.tenants WHERE admin_pin IS NOT NULL) AS tenants_with_plaintext_admin_pin;
