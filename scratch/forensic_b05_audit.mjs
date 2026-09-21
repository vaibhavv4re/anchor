import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

const supabase = new SupabaseClient();
const BASE_URL = supabase.baseUrl;
const HEADERS = supabase.getHeaders();

async function checkTable(tableName) {
  try {
    const resp = await fetch(`${BASE_URL}/${tableName}?limit=2`, { headers: HEADERS });
    if (!resp.ok) {
      return { exists: false, status: resp.status, error: await resp.text() };
    }
    const data = await resp.json();
    return { exists: true, count: data.length, sample: data[0] || null, keys: data[0] ? Object.keys(data[0]) : [] };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

async function run() {
  console.log('================================================================================');
  console.log('🔍 PHASE B-05 FORENSIC AUDIT: TABLES & SCHEMAS');
  console.log('================================================================================');
  
  const tablesToCheck = [
    'stock_counts',
    'stock_count_sessions',
    'stock_adjustments',
    'stock_ledger',
    'stock_transactions',
    'stock_balances',
    'inventory_movements',
    'inventory_requests',
    'shifts',
    'work_shifts',
    'pos_shifts',
    'cash_shifts',
    'staff_shifts',
    'attendance',
    'audit_logs'
  ];

  for (const t of tablesToCheck) {
    const res = await checkTable(t);
    if (res.exists) {
      console.log(`✅ Table [${t}]: EXISTS (${res.count} sample rows)`);
      if (res.keys.length > 0) {
        console.log(`   Columns (${res.keys.length}): ${res.keys.join(', ')}`);
        console.log(`   Sample: ${JSON.stringify(res.sample).substring(0, 140)}...`);
      } else {
        console.log(`   (Table is currently empty)`);
      }
    } else {
      console.log(`❌ Table [${t}]: NOT FOUND (${res.status || res.error})`);
    }
  }

  // Query location LOC-314 balances and any existing counts/adjustments
  console.log('\n--- Checking live stock_balances for LOC-314 ---');
  const balResp = await fetch(`${BASE_URL}/stock_balances?location_code=eq.LOC-314&limit=5`, { headers: HEADERS });
  if (balResp.ok) {
    const bals = await balResp.json();
    console.log(`Found ${bals.length} balances for LOC-314. Sample:`, bals[0]);
  } else {
    console.log('Failed to fetch LOC-314 balances:', await balResp.text());
  }

  console.log('\n--- Checking live stock_counts rows ---');
  const cntResp = await fetch(`${BASE_URL}/stock_counts?limit=5`, { headers: HEADERS });
  if (cntResp.ok) {
    const cnts = await cntResp.json();
    console.log(`Found ${cnts.length} rows in stock_counts. Sample:`, cnts[0] || 'EMPTY');
  }

  console.log('\n--- Checking live stock_adjustments rows ---');
  const adjResp = await fetch(`${BASE_URL}/stock_adjustments?limit=5`, { headers: HEADERS });
  if (adjResp.ok) {
    const adjs = await adjResp.json();
    console.log(`Found ${adjs.length} rows in stock_adjustments. Sample:`, adjs[0] || 'EMPTY');
  }

  console.log('\n--- Checking live stock_ledger rows ---');
  const ledResp = await fetch(`${BASE_URL}/stock_ledger?limit=5`, { headers: HEADERS });
  if (ledResp.ok) {
    const leds = await ledResp.json();
    console.log(`Found ${leds.length} rows in stock_ledger. Sample:`, leds[0] || 'EMPTY');
  }

  console.log('\n--- Checking live stock_transactions rows ---');
  const txnResp = await fetch(`${BASE_URL}/stock_transactions?limit=5`, { headers: HEADERS });
  if (txnResp.ok) {
    const txns = await txnResp.json();
    console.log(`Found ${txns.length} rows in stock_transactions. Sample:`, txns[0] || 'EMPTY');
  }
}

run().catch(console.error);
