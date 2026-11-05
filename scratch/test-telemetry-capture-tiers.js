/**
 * Observability - Capture tier gating (headless).
 * Proves lean/full/off behave as designed and that high-frequency realtime_sync
 * noise is suppressed in lean but not full, while errors always survive.
 */
import { shouldCapture, classifyEventType, CaptureTiers, TelemetryLevel, TelemetryCategory } from '../businessos/platform/observability/captureTiers.js';

let failures = 0;
const check = (label, cond) => { console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`); if (!cond) failures++; };

function main() {
  // OFF captures nothing, even errors.
  check('off captures nothing', shouldCapture(CaptureTiers.OFF, 'order:confirmed', {}) === false);
  check('off captures not even errors', shouldCapture(CaptureTiers.OFF, 'some:failure', { severity: 'ERROR' }) === false);

  // LEAN captures lifecycle + billing + stock signals.
  check('lean captures order:confirmed', shouldCapture(CaptureTiers.LEAN, 'order:confirmed', {}) === true);
  check('lean captures kot:dispatched', shouldCapture(CaptureTiers.LEAN, 'kot:dispatched', {}) === true);
  check('lean captures stock:balance:updated', shouldCapture(CaptureTiers.LEAN, 'stock:balance:updated', {}) === true);
  check('lean captures auth:session_started', shouldCapture(CaptureTiers.LEAN, 'auth:session_started', {}) === true);

  // LEAN always keeps errors/warnings regardless of type.
  check('lean keeps an error event', shouldCapture(CaptureTiers.LEAN, 'mystery:failure', { severity: 'ERROR' }) === true);
  check('lean keeps a warning event', shouldCapture(CaptureTiers.LEAN, 'bar:threshold:breached', {}) === true);

  // LEAN suppresses realtime_sync noise + projection noise.
  check('lean suppresses realtime_sync', shouldCapture(CaptureTiers.LEAN, 'order:updated', { source: 'realtime_sync' }) === false);
  check('lean suppresses notification:emitted', shouldCapture(CaptureTiers.LEAN, 'notification:emitted', {}) === false);

  // FULL captures everything, including the noise lean drops.
  check('full captures realtime_sync', shouldCapture(CaptureTiers.FULL, 'order:updated', { source: 'realtime_sync' }) === true);
  check('full captures projection noise', shouldCapture(CaptureTiers.FULL, 'table:projection:updated', {}) === true);
  check('full captures an arbitrary event', shouldCapture(CaptureTiers.FULL, 'some:random:thing', {}) === true);

  // Classification sanity.
  check('classify order:confirmed -> billing/INFO', (() => { const c = classifyEventType('order:confirmed', {}); return c.category === TelemetryCategory.BILLING && c.level === TelemetryLevel.INFO; })());
  check('classify stock:balance:updated -> stock', classifyEventType('stock:balance:updated', {}).category === TelemetryCategory.STOCK);
  check('classify error severity -> ERROR level', classifyEventType('thing', { severity: 'ERROR' }).level === TelemetryLevel.ERROR);
  check('classify payment:recorded -> billing', classifyEventType('payment:recorded', {}).category === TelemetryCategory.BILLING);

  console.log(failures === 0 ? '\nTELEMETRY CAPTURE TIERS: PASS' : `\nTELEMETRY CAPTURE TIERS: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
