// Live cloud diagnostic for billing persistence bug.
const URL = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' };

async function get(q) {
  const resp = await fetch(`${URL}/${q}`, { headers: H });
  const txt = await resp.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  return { status: resp.status, cr: resp.headers.get('content-range'), body };
}

(async () => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  console.log('TODAY =', today, '\n');

  const rev = await get('bill_revisions?select=id,tenant_id,session_id,bill_number,grand_total,revision_status,created_at&order=created_at.desc&limit=8');
  console.log('bill_revisions (latest 8):', rev.status, rev.cr);
  console.log(JSON.stringify(rev.body, null, 1));

  const sess = await get('table_sessions?select=id,status,bill_status,table_code,updated_at&order=updated_at.desc&limit=8');
  console.log('\ntable_sessions (latest 8):', sess.status, sess.cr);
  console.log(JSON.stringify(sess.body, null, 1));

  // Does an offline_journal cloud table exist?
  const oj = await get('offline_journal?select=*&limit=3');
  console.log('\noffline_journal table probe:', oj.status);
  console.log(typeof oj.body === 'string' ? oj.body.slice(0, 400) : JSON.stringify(oj.body).slice(0, 400));

  // Invoices / payments today
  const inv = await get('invoices?select=id,session_id,invoice_number,grand_total&order=id.desc&limit=5');
  console.log('\ninvoices (latest 5):', inv.status, JSON.stringify(inv.body));
})();
