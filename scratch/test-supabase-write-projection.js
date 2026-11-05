/**
 * Phase 6 - Supabase write projection for the cloud-synced tables.
 *
 * Guards the Phase 4 defect the engines introduced: they write BOTH snake_case
 * columns and camelCase conveniences, but formatRecordForTable/formatPatchForTable
 * must project a POST/PATCH down to the table's real columns (everything else folded
 * into the `data` JSONB). If an unknown key leaks through, PostgREST returns 400
 * (PGRST204) and the write is silently queued offline forever - cross-device sync
 * breaks. The live REST layer cannot be exercised here, so this asserts the mapper
 * output is a strict subset of each table's physical columns.
 */
import { formatRecordForTable, formatPatchForTable } from '../businessos/platform/cloud/supabaseClient.js';

// Physical columns exactly as created in supabase/production_hardening.sql and the
// existing devices schema. Any key not in these sets would 400 at PostgREST.
const TABLE_COLUMNS = {
  attendance: ['id', 'tenant_id', 'employee_id', 'employee_name', 'workspace', 'device_id', 'clock_in_time', 'clock_out_time', 'duration_ms', 'status', 'data', 'created_at', 'updated_at'],
  system_config: ['id', 'tenant_id', 'section', 'data', 'created_at', 'updated_at'],
  devices: ['id', 'tenant_id', 'device_name', 'device_type', 'ip_address', 'status', 'data', 'created_at', 'updated_at'],
  roles: ['id', 'name', 'workspace', 'tenant_scoped', 'permissions', 'data', 'created_at', 'updated_at']
};

const camelKeys = (obj) => Object.keys(obj).filter((k) => /[a-z][A-Z]/.test(k));

function main() {
  let failures = 0;
  const check = (label, cond) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`);
    if (!cond) failures++;
  };

  // Engine-shaped records (mix of snake + camel) must project to snake columns only.
  const attendanceRec = {
    id: 'att_1', tenant_id: 'tenant_x', tenantId: 'tenant_x',
    employee_id: 'E1', employeeId: 'E1', employee_name: 'N', employeeName: 'N',
    workspace: 'waiter', device_id: 'D1',
    clock_in_time: '2026-01-01T09:00:00Z', clockOutTime: null, clock_out_time: null,
    duration_ms: null, status: 'ACTIVE_SHIFT'
  };
  const cfgRec = { id: 'cfg_t_system', tenant_id: 'tenant_x', tenantId: 'tenant_x', section: 'system', values: { a: 1 }, data: { values: { a: 1 } } };
  const devRec = { id: 'DEV-1', tenant_id: 'tenant_x', tenantId: 'tenant_x', name: 'Tab', deviceProfile: 'TABLET', assignedWorkspace: 'bar', capabilities: { touch: true }, allowedRoles: ['*'], registeredAt: 'x' };
  const roleRec = { id: 'role-ca', name: 'CA', workspace: 'ca', tenantScoped: true, permissions: ['ca.view'] };

  const createCases = { attendance: attendanceRec, system_config: cfgRec, devices: devRec, roles: roleRec };
  for (const [table, rec] of Object.entries(createCases)) {
    const out = formatRecordForTable(table, { payload: rec, tenantId: 'tenant_x' });
    const bad = Object.keys(out).filter((k) => !TABLE_COLUMNS[table].includes(k));
    check(`create ${table}: no unknown columns (${bad.join(',') || 'clean'})`, bad.length === 0);
    check(`create ${table}: no camelCase keys leaked (${camelKeys(out).join(',') || 'clean'})`, camelKeys(out).length === 0);
    check(`create ${table}: keeps a data JSONB for the round-trip`, out.data && typeof out.data === 'object');
  }

  // PATCH (clock-out / config save / device re-register) must also project cleanly.
  const patchCases = {
    attendance: { clock_out_time: '2026-01-01T17:00:00Z', clockOutTime: '2026-01-01T17:00:00Z', duration_ms: 100, durationMs: 100, status: 'COMPLETED' },
    system_config: { section: 'system', values: { a: 2 }, data: { values: { a: 2 } } },
    devices: { id: 'DEV-1', name: 'Tab v2', deviceProfile: 'TABLET', capabilities: { touch: true } },
    roles: { name: 'CA Auditor', permissions: ['ca.view', 'reports.view'] }
  };
  for (const [table, patch] of Object.entries(patchCases)) {
    const out = formatPatchForTable(table, patch);
    const bad = Object.keys(out).filter((k) => !TABLE_COLUMNS[table].includes(k));
    check(`patch ${table}: no unknown columns (${bad.join(',') || 'clean'})`, bad.length === 0);
  }

  // system_config round-trip: values must survive under data.values.
  const cfgOut = formatRecordForTable('system_config', { payload: cfgRec, tenantId: 'tenant_x' });
  check('system_config stores section values under data.values', cfgOut.data && cfgOut.data.values && cfgOut.data.values.a === 1);

  console.log(failures === 0 ? '\nSUPABASE WRITE PROJECTION: PASS' : `\nSUPABASE WRITE PROJECTION: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
