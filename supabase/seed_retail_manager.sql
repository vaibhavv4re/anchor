-- Phase 0: Provision Retail Manager user + Retail location (IDEMPOTENT)
-- Run in the Supabase Dashboard SQL Editor against project orlcftjkhqypvqzcmfci.
-- Tenant: tenant_h0qc7wf
--
-- PIN 445566 is stored as lowercase, salt-less SHA-256 hex in identities.pin_hash,
-- exactly the way the pin-login Edge Function hashes & compares (see
-- supabase/functions/pin-login/index.ts -> sha256Hex()).
--   SHA-256("445566") = 48e6f958531e543731746fd0a4fcba173e2ae226d60eb19a5d021be3c29f7a3e
--
-- pin-login resolves login as: identities (by pin_hash, ACTIVE) -> employees (by
-- identity_id, ACTIVE) and derives claims.workspace = employees.workspace_default,
-- claims.role_id = employees.role_id. So workspace_default='retail' is what routes
-- the Retail Manager into the Retail workspace (see restaurantos/frontend/app.js).

BEGIN;

-- 1. Retail Wine Store physical inventory location (Retail stock lives ONLY here).
INSERT INTO storage_locations
  (id, tenant_id, location_code, location_name, parent_location_code, storage_type, data, created_at)
VALUES
  ('sl-loc-retail-001', 'tenant_h0qc7wf', 'LOC-RETAIL', 'Retail Wine Store', NULL, 'Retail',
   '{"domain":"RETAIL"}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;

-- 2. Identity = the PIN credential row.
INSERT INTO identities
  (id, pin_hash, tenant_id, status, created_at)
VALUES
  ('id-retail-mgr-001',
   '48e6f958531e543731746fd0a4fcba173e2ae226d60eb19a5d021be3c29f7a3e',
   'tenant_h0qc7wf', 'ACTIVE', NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. Employee = the Retail Manager, defaulted into the 'retail' workspace.
--    employee_code is derived from the current max (EMP-#####) to avoid collisions.
INSERT INTO employees
  (id, identity_id, tenant_id, employee_code, name, role_id, workspace_default, status, data, created_at)
VALUES
  ('emp-retail-mgr-001',
   'id-retail-mgr-001',
   'tenant_h0qc7wf',
   (SELECT 'EMP-' || LPAD((COALESCE(MAX((SUBSTR(employee_code, 5))::INT), 90000) + 1)::TEXT, 5, '0')
      FROM employees WHERE employee_code ~ '^EMP-[0-9]+$'),
   'Retail Manager',
   'role-retail-manager',
   'retail',
   'ACTIVE',
   '{"domain":"RETAIL","workspace":"retail"}'::jsonb,
   NOW())
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verify the provisioning.
SELECT e.id, e.employee_code, e.name, e.role_id, e.workspace_default, e.status, i.pin_hash
FROM employees e
JOIN identities i ON i.id = e.identity_id
WHERE e.role_id = 'role-retail-manager';
