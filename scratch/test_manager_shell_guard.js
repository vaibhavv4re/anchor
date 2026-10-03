/**
 * Manager Cockpit - shell lifecycle guard (headless, minimal DOM stub).
 *
 * Verifies the anti-leak contract the redesign depends on:
 *   - the shell owns EXACTLY ONE platform subscription (re-subscribe is a no-op)
 *   - destroy() unsubscribes every handler (no listeners survive a screen switch)
 *   - a burst of 'data:changed' coalesces into ONE refresh of the active view
 *   - refreshForWorkspace('manager', ...) is called on entry (cloud-first parity)
 *
 * Usage: node scratch/test_manager_shell_guard.js
 */

// --- Minimal DOM + rAF stubs so the ES modules import and the shell methods run.
global.window = global.window || { addEventListener: () => {} };
global.sessionStorage = global.sessionStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };

let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
global.document = {
  createElement: () => ({
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, removeChild() {}, setAttribute() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], remove() {}, scrollIntoView() {}, innerHTML: '', textContent: ''
  })
};

const { ManagerWorkspaceView } = await import('../restaurantos/frontend/capabilities/manager/ui/ManagerWorkspaceView.js');

const TENANT = 'tenant_h0qc7wf';
const checks = [];
const ok = (name, cond) => checks.push([name, !!cond]);

// Fake event bus that records subscriptions and their unsubscribe calls.
const subs = [];      // { event, handler }
const unsubbed = [];  // event names unsubscribed
const fakeBus = {
  subscribe(event, handler) {
    const rec = { event, handler, active: true };
    subs.push(rec);
    return () => { rec.active = false; unsubbed.push(event); };
  },
  publish() {}
};

// Fake gateway that records refreshForWorkspace calls.
const refreshCalls = [];
const fakeGateway = {
  refreshForWorkspace(name, collections, tenantId) {
    refreshCalls.push({ name, collections, tenantId });
    return Promise.resolve();
  }
};

const shell = new ManagerWorkspaceView({
  tenantId: TENANT,
  dataGateway: fakeGateway,
  platformEventBus: fakeBus,
  authEngine: null
});
shell.session = { tenantId: TENANT, employeeName: 'Priya Manager', roleName: 'Operations Manager' };

// ---- A. One subscription, guarded against re-subscribing.
shell.subscribeRealtimeEvents();
const firstCount = subs.length;
ok('shell subscribes to the data:changed + domain events', firstCount > 0);

shell.subscribeRealtimeEvents(); // second call must be a no-op (guard)
ok('re-subscribe is guarded (no duplicate listeners)', subs.length === firstCount);

// ---- B. Burst of events coalesces into ONE refresh per animation frame.
let refreshCount = 0;
shell.activeView = { destroy() {}, refresh() { refreshCount++; } };

const dataChanged = subs.find(s => s.event === 'data:changed');
ok('shell listens for data:changed', !!dataChanged);
for (let i = 0; i < 25; i++) dataChanged.handler({ source: 'burst' });

ok('burst queues a single repaint (coalesced)', refreshCount === 0); // deferred to rAF
if (rafCb) rafCb();                                                   // flush the queued frame
ok('burst -> exactly one activeView.refresh after flush', refreshCount === 1);

// ---- C. destroy() unsubscribes everything and clears the guard.
shell.destroy();
ok('destroy unsubscribes every handler', unsubbed.length === firstCount);
ok('destroy clears the subscribe guard', shell._subscribed === false);
ok('destroy drops the active view reference', shell.activeView === null);

// ---- D. A second shell instance subscribes fresh (proves per-instance isolation).
const beforeSecond = subs.length;
const shell2 = new ManagerWorkspaceView({ tenantId: TENANT, dataGateway: fakeGateway, platformEventBus: fakeBus });
shell2.session = { tenantId: TENANT };
shell2.subscribeRealtimeEvents();
ok('a new shell subscribes its own handlers', subs.length > beforeSecond);

// ---- E. Cloud-first refresh wiring.
shell2.refreshCloud();
const call = refreshCalls[refreshCalls.length - 1];
ok('refreshForWorkspace called for the manager workspace', call && call.name === 'manager');
ok('refresh pulls the six realtime manager collections', call && Array.isArray(call.collections) && call.collections.length === 6);
ok('refresh passes the tenant id', call && call.tenantId === TENANT);
for (const required of ['table_sessions', 'orders', 'bill_revisions', 'invoices', 'payments', 'stock_balances']) {
  ok(`refresh includes ${required}`, call.collections.includes(required));
}

console.log('=== Manager Cockpit: shell subscription-lifecycle + cloud-first guard ===');
let pass = true;
for (const [name, cond] of checks) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) pass = false;
}
console.log(pass ? '\nRESULT: ALL PASS' : '\nRESULT: FAILURES PRESENT');
process.exit(pass ? 0 : 1);
