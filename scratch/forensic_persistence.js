/**
 * Phase 0 - READ-ONLY forensic probe for the persistence/realtime investigation.
 *
 * Hits the live project with the PUBLIC anon key ONLY and issues GET (SELECT)
 * requests. It never writes, updates, or deletes. It captures the "before"
 * baseline for the repair plan:
 *   - operational row counts + freshness for the tenant (does anything land in cloud?)
 *   - anon read behavior per table (RLS: blocked/empty vs readable)
 *   - a machine-readable JSON report + the dashboard SQL needed to confirm the
 *     catalog facts PostgREST cannot expose (policies, publication, replica id).
 *
 * Usage: node scratch/forensic_persistence.js
 */

const BASE = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';
const TENANT = 'tenant_h0qc7wf';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' };

const OPERATIONAL = ['orders', 'table_sessions', 'bill_revisions', 'invoices', 'payments', 'stock_balances'];
const HOUR_MS = 3600000;

async function get(q) {
  try {
    const resp = await fetch(`${BASE}/${q}`, { headers: H, cache: 'no-store' });
    const txt = await resp.text();
    let body; try { body = JSON.parse(txt); } catch { body = txt; }
    return { status: resp.status, cr: resp.headers.get('content-range'), body };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

// content-range header looks like: 0-9/42  -> total rows = part after "/"
function totalFromRange(cr) {
  if (!cr) return null;
  const m = String(cr).match(/\/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

(async () => {
  const report = { generatedAt: new Date().toISOString(), tenant: TENANT, tables: {}, verdict: [] };

  for (const t of OPERATIONAL) {
    // All-time total for the tenant.
    const all = await get(`${t}?select=id&tenant_id=eq.${TENANT}&limit=1`);
    // Freshness: rows updated in the last hour (order/updated_at desc, limit 5).
    const since = new Date(Date.now() - HOUR_MS).toISOString();
    const recent = await get(`${t}?select=*&tenant_id=eq.${TENANT}&updated_at=gte.${since}&order=updated_at.desc&limit=5`);

    const total = totalFromRange(all.cr);
    const recentCount = totalFromRange(recent.cr);
    report.tables[t] = {
      anonReadStatus: all.status,
      totalRows: total,
      recentHourRows: recentCount,
      sampleRecent: Array.isArray(recent.body) ? recent.body.map(r => ({ id: r.id, status: r.status || r.order_status || r.revision_status, updated_at: r.updated_at })) : recent.body
    };

    if (all.status === 401 || all.status === 403) {
      report.verdict.push(`${t}: anon SELECT BLOCKED (${all.status}) -> RLS active for anon (expected). Cloud reads need the authenticated JWT.`);
    } else if (all.status === 200 && total === 0) {
      report.verdict.push(`${t}: anon SELECT allowed but 0 rows -> operational writes are NOT landing in cloud.`);
    } else if (all.status === 200) {
      report.verdict.push(`${t}: ${total} rows total, ${recentCount ?? 0} in last hour.`);
    } else {
      report.verdict.push(`${t}: read returned status ${all.status} (${(all.error || all.body) ? String(all.error || '').slice(0, 80) : 'n/a'}).`);
    }
  }

  // offline_journal must NOT be treated as shared state; presence of a cloud
  // table is fine, but the app must never hydrate/clobber the local queue with it.
  const oj = await get(`offline_journal?select=job_id,sync_state,created_at&order=created_at.desc&limit=5`);
  report.offlineJournal = { status: oj.status, sample: oj.body };
  report.verdict.push(`offline_journal cloud table probe: status ${oj.status}. (Local device queue must never be overwritten from here.)`);

  console.log('=== Persistence / Realtime Forensic Report (anon READ-ONLY) ===\n');
  for (const line of report.verdict) console.log(' -', line);
  console.log('\nFull report JSON:\n');
  console.log(JSON.stringify(report, null, 1));

  console.log('\n=== Catalog facts PostgREST cannot expose (run in Supabase SQL editor) ===');
  console.log(`
-- 1. RLS policies actually in force?
select tablename, policyname, permissive, cmd, roles, qual
from pg_policies where schemaname='public'
  and tablename in ('orders','table_sessions','bill_revisions','invoices','payments','stock_balances','offline_journal')
order by tablename;

-- 2. Are the operational tables in the realtime publication? (Phase 5 fixes this)
select pubname, tablename from pg_publication_tables
where pubname='supabase_realtime' and schemaname='public'
  and tablename in ('orders','table_sessions','bill_revisions','invoices','payments','stock_balances');

-- 3. Replica identity must be FULL for UPDATE/DELETE payloads (Phase 5 fixes this)
select relname, case relreplident when 'f' then 'FULL' when 'd' then 'DEFAULT'
  when 'n' then 'NOTHING' when 'i' then 'INDEX' end as replica_identity
from pg_class where relname in ('orders','table_sessions','bill_revisions','invoices','payments','stock_balances');
`);
})();
