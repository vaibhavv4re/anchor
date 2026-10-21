/**
 * A3 scenario check (plan Test Plan item 1):
 * AUTH_MODE=server + pin-login Edge Function unreachable (infra fallback) →
 *   - privileged hardcoded PINs (888888 / 999999 / 000000 / 777777) FAIL CLOSED
 *   - unknown PIN FAILS (no fabricated employee synthesis)
 *   - employee PIN matching a real hydrated row still authenticates
 */
process.env.AUTH_MODE = 'server';

import { AuthEngine } from '../businessos/platform/authentication/authEngine.js';

const employees = [
  { id: 'emp-real-1', name: 'Suresh Kumar', roleId: 'role-waiter', tenantId: 'tenant_h0qc7wf', pin: '222222' }
];

const stubDg = {
  async getCollection(name) {
    if (name === 'employees') return employees;
    if (name === 'tenants') return [{ tenantId: 'tenant_h0qc7wf', adminPin: '999999' }];
    return [];
  }
};

// Simulate pin-login unreachable (404/5xx/network) so the local fallback path
// governed by the A3 lockdown is exercised.
class InfraFallbackAuthEngine extends AuthEngine {
  async _authenticateViaServer() {
    return { infraUnavailable: true };
  }
}

async function main() {
  const engine = new InfraFallbackAuthEngine({ dataGateway: stubDg });
  let failures = 0;
  const check = (label, cond) => {
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
    if (!cond) failures++;
  };

  const privileged = ['888888', '999999', '000000', '777777'];
  for (const pin of privileged) {
    const res = await engine.authenticate(pin, 'TEST-SCREEN-A');
    check(`privileged PIN ${pin} fails closed`, res && res.success === false);
  }

  const unknown = await engine.authenticate('123456', 'TEST-SCREEN-A');
  check('unknown PIN rejected (no fabricated employee)', unknown && unknown.success === false);

  const employee = await engine.authenticate('222222', 'TEST-SCREEN-A');
  check('real employee PIN authenticates via fallback', employee && employee.success === true);
  check('session carries self-reported deviceId', employee && employee.session && employee.session.deviceId === 'TEST-SCREEN-A');

  // Typed event contract (A1): EMPLOYEE_AUTHENTICATED fired alongside raw event.
  let typedSeen = false;
  engine.platformEventBus.subscribe('platform:employee:authenticated', () => { typedSeen = true; });
  await engine.authenticate('222222', 'TEST-SCREEN-B');
  check('EMPLOYEE_AUTHENTICATED typed event published on login', typedSeen);

  // Lock event contract (A1/A2): typed SESSION_LOCKED carries the snapshot.
  let lockPayload = null;
  engine.platformEventBus.subscribe('platform:session:locked', (env) => { lockPayload = env && env.payload; });
  engine.lockSession({ reason: 'MANUAL' });
  check('SESSION_LOCKED typed event published with snapshot', !!(lockPayload && lockPayload.session && lockPayload.session.employeeName));

  const unlockRes = await engine.unlockSession('222222');
  check('unlockSession re-mints session for same employee', unlockRes && unlockRes.success === true);

  console.log(failures === 0 ? '\nA3/A1 SCENARIO: PASS' : `\nA3/A1 SCENARIO: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
