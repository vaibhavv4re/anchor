/**
 * A3 scenario check (plan Test Plan: "auth fail-closed when server unreachable").
 *
 * Production posture (AUTH_MODE=server): the pin-login Edge Function is the ONLY
 * authority. When it is unreachable the engine FAILS CLOSED - no session is minted
 * locally for ANY PIN (privileged admin/superadmin shortcuts or a real employee PIN),
 * so an offline attacker can never forge an admin/CA role. The data-driven local
 * path is reachable ONLY when server auth is disabled (clearly-gated offline dev),
 * and even then it never fabricates an identity from a hardcoded PIN.
 */
import { AuthEngine } from '../businessos/platform/authentication/authEngine.js';

const employees = [
  { id: 'emp-real-1', name: 'Suresh Kumar', roleId: 'role-waiter', tenantId: 'tenant_h0qc7wf', pin: '222222' }
];

const stubDg = {
  async getCollection(name) {
    if (name === 'employees') return employees;
    if (name === 'tenants') return [];
    return [];
  }
};

// pin-login unreachable (function undeployed / network down).
class UnreachableAuthEngine extends AuthEngine {
  async _authenticateViaServer() { return { infraUnavailable: true }; }
}

// pin-login reachable & authoritative.
class ReachableAuthEngine extends AuthEngine {
  async _authenticateViaServer(pin, deviceId) {
    if (pin === '222222') {
      return {
        success: true,
        workspace: 'waiter',
        session: {
          employeeId: 'emp-real-1', employeeName: 'Suresh Kumar', roleId: 'role-waiter',
          tenantId: 'tenant_h0qc7wf', workspace: 'waiter', deviceId, status: 'ACTIVE'
        }
      };
    }
    return { success: false, error: 'Invalid PIN or credentials' };
  }
}

async function main() {
  let failures = 0;
  const check = (label, cond) => {
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
    if (!cond) failures++;
  };

  // ---- Server mode: FAIL CLOSED when the Edge Function is unreachable ----
  process.env.AUTH_MODE = 'server';
  const offEngine = new UnreachableAuthEngine({ dataGateway: stubDg });
  for (const pin of ['888888', '999999', '000000', '777777', '222222']) {
    const res = await offEngine.authenticate(pin, 'TEST-SCREEN-A');
    check(`server-unreachable PIN ${pin} fails closed (no local role mint)`, res && res.success === false);
  }

  // ---- Server mode: authoritative when reachable ----
  const onEngine = new ReachableAuthEngine({ dataGateway: stubDg });
  const ok = await onEngine.authenticate('222222', 'TEST-SCREEN-A');
  check('server-reachable real PIN authenticates from claims', ok && ok.success === true && ok.session.roleId === 'role-waiter');
  check('server session carries self-reported deviceId', !!(ok.session && ok.session.deviceId === 'TEST-SCREEN-A'));
  const bad = await onEngine.authenticate('123456', 'TEST-SCREEN-A');
  check('server-reachable unknown PIN rejected', bad && bad.success === false);

  // ---- Offline-dev mode (server auth disabled): data-driven local path only ----
  delete process.env.AUTH_MODE;
  const localEngine = new AuthEngine({ dataGateway: stubDg });
  const localEmp = await localEngine.authenticate('222222', 'TEST-SCREEN-C');
  check('offline-dev real employee PIN authenticates from data', localEmp && localEmp.success === true);
  check('offline-dev session carries self-reported deviceId', !!(localEmp.session && localEmp.session.deviceId === 'TEST-SCREEN-C'));
  const localUnknown = await localEngine.authenticate('123456', 'TEST-SCREEN-C');
  check('offline-dev unknown PIN rejected (no fabricated employee)', localUnknown && localUnknown.success === false);

  // Typed event contract (real authenticate path): EMPLOYEE_AUTHENTICATED fired.
  let typedSeen = false;
  localEngine.platformEventBus.subscribe('platform:employee:authenticated', () => { typedSeen = true; });
  await localEngine.authenticate('222222', 'TEST-SCREEN-D');
  check('EMPLOYEE_AUTHENTICATED typed event published on login', typedSeen);

  // Lock event contract: typed SESSION_LOCKED carries the snapshot.
  let lockPayload = null;
  localEngine.platformEventBus.subscribe('platform:session:locked', (env) => { lockPayload = env && env.payload; });
  localEngine.lockSession({ reason: 'MANUAL' });
  check('SESSION_LOCKED typed event published with snapshot', !!(lockPayload && lockPayload.session && lockPayload.session.employeeName));

  console.log(failures === 0 ? '\nA3 SCENARIO: PASS' : `\nA3 SCENARIO: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
