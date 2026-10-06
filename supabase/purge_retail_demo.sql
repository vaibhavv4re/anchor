-- Retail: purge the Phase 1 demo/mock catalogue + fabricated stock.
-- ============================================================================
-- ARCHITECTURE CORRECTION: Retail is a PURE CONSUMER of the shared Inventory
-- Core (exactly like Kitchen/Bar). Retail physical stock at LOC-RETAIL must
-- arrive ONLY through an inventory-manager warehouse transfer (LOC-805 ->
-- LOC-RETAIL) that fulfils a requisition. There is NO demo opening stock and
-- NO hardcoded wine catalogue. This script removes the old mock rows that were
-- inserted by the now-deleted seed_retail_demo.sql.
--
-- Run in the Supabase Dashboard SQL Editor. Tenant: tenant_h0qc7wf.
-- Idempotent: safe to run repeatedly.

BEGIN;

-- 1. Remove fabricated LOC-RETAIL opening stock (demo item codes).
DELETE FROM stock_balances
WHERE tenant_id = 'tenant_h0qc7wf'
  AND location_code = 'LOC-RETAIL'
  AND item_code IN (
    'WINE-SAUVEIGN-750', 'WINE-CABERNET-750', 'WINE-SHIRAZ-750', 'WINE-CHAMPAGNE-750'
  );

-- 2. Remove the hardcoded demo wine catalogue rows.
DELETE FROM retail_products
WHERE tenant_id = 'tenant_h0qc7wf'
  AND product_code IN ('RP-WINE-001', 'RP-WINE-002', 'RP-WINE-003', 'RP-WINE-004');

COMMIT;

-- Verify: expect zero demo rows, and LOC-RETAIL stock only if a real manager
-- transfer has since fulfilled a retail requisition.
SELECT count(*) AS demo_retail_products
FROM retail_products
WHERE tenant_id = 'tenant_h0qc7wf' AND product_code LIKE 'RP-WINE-%';

SELECT item_code, quantity
FROM stock_balances
WHERE tenant_id = 'tenant_h0qc7wf' AND location_code = 'LOC-RETAIL'
ORDER BY item_code;

-- ---------------------------------------------------------------------------
-- OPTIONAL (uncomment ONLY if you want to wipe ALL retail stock + catalogue
-- for this tenant, e.g. a clean cutover to live-data-only operation):
--
-- DELETE FROM stock_balances  WHERE tenant_id = 'tenant_h0qc7wf' AND location_code = 'LOC-RETAIL';
-- DELETE FROM retail_products WHERE tenant_id = 'tenant_h0qc7wf';
-- ---------------------------------------------------------------------------
