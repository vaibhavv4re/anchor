/**
 * Observability - Redaction (headless).
 * Credentials/PII must NEVER survive into a telemetry record on any tier. This
 * guards the hard rule that observability never leaks a PIN, token or card data.
 */
import { redact, toTelemetryRecord, CaptureTiers } from '../businessos/platform/observability/captureTiers.js';

let failures = 0;
const check = (label, cond) => { console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`); if (!cond) failures++; };

function main() {
  // Top-level and nested secret keys are redacted, non-secret data is preserved.
  const r = redact({
    employeeName: 'Priya',
    pin: '888888',
    pin_hash: 'abc',
    accessToken: 'jwt.token.here',
    nested: { jwt: 'x', cvv: '123', amount: 250 }
  });
  check('redact strips pin', r.pin === '[redacted]');
  check('redact strips pin_hash', r.pin_hash === '[redacted]');
  check('redact strips accessToken', r.accessToken === '[redacted]');
  check('redact strips nested jwt', r.nested.jwt === '[redacted]');
  check('redact strips nested cvv', r.nested.cvv === '[redacted]');
  check('redact preserves non-secret employeeName', r.employeeName === 'Priya');
  check('redact preserves non-secret amount', r.nested.amount === 250);

  // Full serialized record must not contain any plaintext secret substring.
  const record = toTelemetryRecord({
    eventType: 'auth:session_started',
    payload: { pin: '999999', token: 'secret-token', workspace: 'waiter', grandTotal: 500 },
    tier: CaptureTiers.FULL,
    tenantId: 'tenant_x',
    deviceId: 'DEV-1'
  });
  const serialized = JSON.stringify(record);
  check('record does not leak plaintext pin', !serialized.includes('999999'));
  check('record does not leak plaintext token', !serialized.includes('secret-token'));
  check('record keeps business value (grandTotal)', record.data.grandTotal === 500);
  check('record has shape id/tenant/device/level', !!(record.id && record.tenant_id === 'tenant_x' && record.device_id === 'DEV-1' && record.level));

  // Circular references must not crash or hang.
  const circular = { a: 1 };
  circular.self = circular;
  let threw = false;
  let out = null;
  try { out = redact(circular); } catch { threw = true; }
  check('redact handles circular without throwing', threw === false);
  check('redact marks circular node', out && out.self === '[circular]');

  // Very long strings are truncated (bounded record size).
  const long = 'x'.repeat(5000);
  check('redact truncates huge strings', redact({ note: long }).note.length < 2100);

  console.log(failures === 0 ? '\nTELEMETRY REDACTION: PASS' : `\nTELEMETRY REDACTION: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
