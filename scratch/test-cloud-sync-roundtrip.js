/**
 * Phase 6 - Cloud-sync round-trip through the DataGateway (plan Test Plan:
 * "config/attendance/devices cloud round-trip").
 *
 * Guards the offlineStore-only root cause: attendance, devices and system config
 * must be written through the shared DataGateway (so they sync across devices),
 * not straight into the per-device offlineStore. A stub gateway records every
 * create/update so we can assert the collection, row shape and tenant stamping.
 */
import { attendanceEngine } from '../businessos/platform/attendance/attendanceEngine.js';
import { deviceEngine } from '../businessos/platform/devices/deviceEngine.js';

function makeStubGateway(initialCache = {}) {
  const cache = { ...initialCache };
  const calls = [];
  return {
    calls,
    cache,
    create(collection, record) { calls.push({ op: 'create', collection, record }); (cache[collection] = cache[collection] || []).push(record); return Promise.resolve(record); },
    update(collection, id, patch) {
      calls.push({ op: 'update', collection, id, patch });
      cache[collection] = (cache[collection] || []).map((r) => (r.id === id ? { ...r, ...patch } : r));
      return Promise.resolve(patch);
    },
    getCollection(collection) { return Promise.resolve(cache[collection] || []); },
    getCachedCollection(collection) { return cache[collection] || []; }
  };
}

async function main() {
  let failures = 0;
  const check = (label, cond) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`);
    if (!cond) failures++;
  };

  // ---- Attendance: clock-in/out go through the gateway (cloud-backed) ----
  const attGw = makeStubGateway();
  attendanceEngine.dataGateway = attGw;

  await attendanceEngine.handleAutoClockIn({
    employeeId: 'EMP-42', employeeName: 'Test Server', workspace: 'waiter',
    deviceId: 'DEV-1', tenantId: 'tenant_x', timestamp: '2026-01-01T09:00:00.000Z'
  });
  const clockIn = attGw.calls.find((c) => c.op === 'create' && c.collection === 'attendance');
  check('clock-in writes an attendance row through the gateway', !!clockIn);
  check('clock-in row is tenant-stamped', !!clockIn && clockIn.record.tenant_id === 'tenant_x');
  check('clock-in row carries snake + camel employee id', !!clockIn && clockIn.record.employee_id === 'EMP-42' && clockIn.record.employeeId === 'EMP-42');
  check('clock-in row status is ACTIVE_SHIFT', !!clockIn && clockIn.record.status === 'ACTIVE_SHIFT');
  check('clock-in row has NO plaintext PIN/credential', !!clockIn && !('pin' in clockIn.record));

  const sheet = attendanceEngine.getTimesheet('EMP-42');
  check('getTimesheet reads back through the gateway cache', Array.isArray(sheet) && sheet.length === 1);

  await attendanceEngine.handleAutoClockOut({
    employeeId: 'EMP-42', tenantId: 'tenant_x',
    timestamp: '2026-01-01T17:00:00.000Z', shiftDurationMs: 8 * 3600 * 1000
  });
  const clockOut = attGw.calls.find((c) => c.op === 'update' && c.collection === 'attendance');
  check('clock-out updates the attendance row through the gateway', !!clockOut);
  check('clock-out patch closes the shift (COMPLETED)', !!clockOut && clockOut.patch.status === 'COMPLETED');

  // ---- Devices: register/update go through the gateway ----
  const devGw = makeStubGateway();
  deviceEngine.dataGateway = devGw;

  deviceEngine.registerDevice({ deviceId: 'DEV-77', name: 'Bar Tablet', assignedWorkspace: 'bar', assignedArea: 'Bar' });
  const devCreate = devGw.calls.find((c) => c.op === 'create' && c.collection === 'devices');
  check('registerDevice writes a devices row through the gateway', !!devCreate);
  check('device row is tenant-stamped', !!devCreate && typeof devCreate.record.tenant_id === 'string' && devCreate.record.tenant_id.length > 0);
  check('device row carries workspace + id', !!devCreate && devCreate.record.id === 'DEV-77' && devCreate.record.assigned_workspace === 'bar');

  deviceEngine.registerDevice({ deviceId: 'DEV-77', name: 'Bar Tablet v2', assignedWorkspace: 'bar' });
  const devUpdate = devGw.calls.find((c) => c.op === 'update' && c.collection === 'devices');
  check('re-registering an existing device issues an update', !!devUpdate && devUpdate.id === 'DEV-77');

  // ---- System config: saveSection upserts system_config via the gateway ----
  // systemConfigStore reads the gateway off window.__APP__.platform in the app.
  const cfgGw = makeStubGateway();
  globalThis.window = { __APP__: { platform: { dataGateway: cfgGw } } };
  const { saveSection, getSection } = await import('../businessos/platform/config/systemConfigStore.js');

  await saveSection('system', { idleTimeoutMinutes: { waiter: 5, kitchen: 0 } });
  const cfgWrite = cfgGw.calls.find((c) => c.collection === 'system_config');
  check('saveSection upserts a system_config row through the gateway', !!cfgWrite);
  check('system_config row records the section', !!cfgWrite && cfgWrite.record.section === 'system');
  check('system_config row stores values as JSON (not per-device offline only)', !!cfgWrite && cfgWrite.record.values && cfgWrite.record.values.idleTimeoutMinutes.waiter === 5);

  const sysSection = getSection('system');
  check('getSection reads the saved values back', !!sysSection && sysSection.idleTimeoutMinutes && sysSection.idleTimeoutMinutes.kitchen === 0);

  console.log(failures === 0 ? '\nCLOUD-SYNC ROUND-TRIP: PASS' : `\nCLOUD-SYNC ROUND-TRIP: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
