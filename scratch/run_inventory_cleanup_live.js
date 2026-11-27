/**
 * Live Supabase Inventory Master Audit & Cleanup Runner
 * Usage:
 *   node scratch/run_inventory_cleanup_live.js            # Dry-run audit only
 *   node scratch/run_inventory_cleanup_live.js --apply    # Execute batch delete of duplicates + archive legacy SKUs
 */

import { runtimeConfig } from '../businessos/platform/cloud/runtimeConfig.js';
import { CANONICAL_INVENTORY_CODES } from '../businessos/platform/inventory/inventoryAuditHelper.js';

const TENANT_ID = 'tenant_h0qc7wf';
const APPLY = process.argv.includes('--apply');

async function getAuthHeaders() {
  const url = runtimeConfig.getSupabaseUrl();
  const anonKey = runtimeConfig.getAnonKey();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (serviceKey) {
    return {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    };
  }

  // Authenticate via pin-login Edge Function as Inventory Manager (PIN 333333)
  const resp = await fetch(`${url}/functions/v1/pin-login`, {
    method: 'POST',
    headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '333333', tenantId: TENANT_ID })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`pin-login failed (${resp.status}): ${txt}`);
  }
  const authData = await resp.json();
  const token = authData.access_token || authData.token || authData.jwt;
  if (!token) throw new Error('No access_token returned from pin-login');

  return {
    'apikey': anonKey,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

async function main() {
  const restUrl = runtimeConfig.getRestUrl();
  const headers = await getAuthHeaders();

  console.log(`🔍 Fetching live inventory rows for ${TENANT_ID}...`);
  const res = await fetch(`${restUrl}/inventory?tenant_id=eq.${TENANT_ID}&select=uuid,item_code,item_name,status,updated_at,data&limit=2000`, {
    headers
  });
  if (!res.ok) throw new Error(`GET inventory failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();

  const activeRows = rows.filter(r => {
    const st = String(r.status || r.data?.status || 'ACTIVE').toUpperCase();
    const act = r.data?.active;
    return st !== 'ARCHIVED' && act !== false;
  });

  // Sort newest updated_at first so newest record is retained
  const sorted = [...activeRows].sort((a, b) => {
    const ta = new Date(a.updated_at || a.data?.updatedAt || a.data?.modifiedAt || 0).getTime();
    const tb = new Date(b.updated_at || b.data?.updatedAt || b.data?.modifiedAt || 0).getTime();
    return tb - ta;
  });

  const seenCodes = new Map();
  const duplicateUuids = [];
  const legacyUuids = [];

  for (const r of sorted) {
    const code = String(r.item_code || '').toUpperCase().trim();
    if (!code) continue;
    if (seenCodes.has(code)) {
      duplicateUuids.push(r.uuid);
    } else {
      seenCodes.set(code, r);
      if (!CANONICAL_INVENTORY_CODES.has(code)) {
        legacyUuids.push({ uuid: r.uuid, code, name: r.item_name });
      }
    }
  }

  console.log(`\n📊 LIVE SUPABASE AUDIT (${TENANT_ID}):`);
  console.log(`   • Total rows in table:     ${rows.length}`);
  console.log(`   • Active rows:             ${activeRows.length}`);
  console.log(`   • Unique active item_codes:${seenCodes.size}`);
  console.log(`   • Duplicate rows to DELETE:${duplicateUuids.length}`);
  console.log(`   • Legacy SKUs to ARCHIVE:  ${legacyUuids.length}`);
  if (legacyUuids.length > 0) {
    console.log(`   • Sample legacy SKUs:      ${legacyUuids.slice(0, 10).map(l => `${l.code} (${l.name})`).join(', ')}`);
  }

  if (!APPLY) {
    console.log('\nℹ️  Dry-run complete. Pass --apply to execute cleanup.');
    return;
  }

  // 1. Batch delete exact duplicate UUIDs
  console.log(`\n🧹 Deleting ${duplicateUuids.length} duplicate rows in batches of 40...`);
  for (let i = 0; i < duplicateUuids.length; i += 40) {
    const chunk = duplicateUuids.slice(i, i + 40);
    const inList = chunk.map(u => `"${u}"`).join(',');
    const delResp = await fetch(`${restUrl}/inventory?uuid=in.(${encodeURIComponent(inList)})`, {
      method: 'DELETE',
      headers
    });
    if (!delResp.ok) {
      throw new Error(`Batch DELETE failed (${delResp.status}): ${await delResp.text()}`);
    }
    console.log(`   ✔ Deleted batch ${Math.floor(i / 40) + 1} (${chunk.length} rows)`);
  }

  // 2. Batch archive legacy non-pack SKUs
  console.log(`\n📦 Archiving ${legacyUuids.length} legacy non-pack SKUs in batches of 40...`);
  for (let i = 0; i < legacyUuids.length; i += 40) {
    const chunk = legacyUuids.slice(i, i + 40).map(l => l.uuid);
    const inList = chunk.map(u => `"${u}"`).join(',');
    const patchResp = await fetch(`${restUrl}/inventory?uuid=in.(${encodeURIComponent(inList)})`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'ARCHIVED' })
    });
    if (!patchResp.ok) {
      throw new Error(`Batch PATCH archive failed (${patchResp.status}): ${await patchResp.text()}`);
    }
    console.log(`   ✔ Archived batch ${Math.floor(i / 40) + 1} (${chunk.length} rows)`);
  }

  // 3. Re-verify final live count
  const verifyRes = await fetch(`${restUrl}/inventory?tenant_id=eq.${TENANT_ID}&select=uuid,item_code,status&limit=2000`, { headers });
  const finalRows = await verifyRes.json();
  const finalActive = finalRows.filter(r => String(r.status || 'ACTIVE').toUpperCase() !== 'ARCHIVED');
  console.log(`\n✅ CLEANUP COMPLETE! Live Supabase active inventory rows: ${finalActive.length} (Unique codes: ${new Set(finalActive.map(r => r.item_code)).size})`);
}

main().catch(err => {
  console.error('❌ ERROR:', err.message);
  process.exit(1);
});

