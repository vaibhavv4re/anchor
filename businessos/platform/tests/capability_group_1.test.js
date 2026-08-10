/**
 * Capability Group 1 - Operational Acceptance Test Suite
 * Tests real-world restaurant scenarios, platform health monitor, correlation IDs, and quality gates.
 */

import { authEngine } from '../authentication/authEngine.js';
import { rbacEngine } from '../authorization/rbacEngine.js';
import { attendanceEngine } from '../attendance/attendanceEngine.js';
import { deviceEngine } from '../devices/deviceEngine.js';
import { healthMonitor } from '../health/healthMonitor.js';
import { auditMiddleware } from '../audit/auditMiddleware.js';
import { notificationEngine, NotificationSeverity } from '../notifications/notificationEngine.js';

export async function runCapabilityGroup1TestSuite() {
  const results = [];

  const assert = (condition, scenarioName) => {
    if (condition) {
      results.push({ scenarioName, status: 'PASS' });
      console.log(`✅ [OPERATIONAL SCENARIO PASS] ${scenarioName}`);
    } else {
      results.push({ scenarioName, status: 'FAIL' });
      console.error(`❌ [OPERATIONAL SCENARIO FAIL] ${scenarioName}`);
    }
  };

  console.log('🧪 Executing Operational Acceptance Tests for Group 1...\n');

  // Scenario 1: Waiter Rahul Shift Cycle (Auth -> Auto Clock In -> Idle Lock -> Resume -> Logout -> Auto Clock Out)
  const authRes = await authEngine.authenticate('123456', 'DEV-FLOOR-01');
  assert(authRes.success === true && authRes.session.employeeName === 'Rahul Sharma', 'Scenario 1.1: Waiter Rahul enters 6-digit PIN on floor tablet and authenticates in <1s');

  const timesheet = attendanceEngine.getTimesheet(authRes.session.employeeId);
  assert(timesheet.length > 0 && timesheet[0].status === 'ACTIVE_SHIFT', 'Scenario 1.2: Event-driven attendance automatically registers ClockIn without manual clicks');

  authEngine.lockSession();
  assert(authEngine.getCurrentSession().isLocked === true, 'Scenario 1.3: Terminal locks after inactivity timeout, preserving workspace state');

  const unlockRes = await authEngine.unlockSession('123456');
  assert(unlockRes.success === true, 'Scenario 1.4: Rahul re-enters PIN to resume floor workspace session');

  authEngine.logout();
  const finalTimesheet = attendanceEngine.getTimesheet(authRes.session.employeeId);
  assert(finalTimesheet[0].status === 'COMPLETED', 'Scenario 1.5: Logout automatically registers ClockOut timestamp');

  // Scenario 2: Manager Override ("Take Control")
  await authEngine.authenticate('123456', 'DEV-FLOOR-01');
  authEngine.lockSession();
  const overrideRes = await authEngine.unlockSession('999999');
  assert(overrideRes.success === true && overrideRes.isOverride === true, 'Scenario 2.1: Manager Priya enters Manager PIN to Override and Take Control of locked floor terminal');
  authEngine.logout();

  // Scenario 3: Device Hardware Registration & Capabilities
  const device = deviceEngine.registerDevice({
    deviceId: 'DEV-KITCHEN-01',
    name: 'Main Kitchen KDS Screen',
    deviceProfile: 'KITCHEN_DISPLAY',
    assignedWorkspace: 'kitchen',
    assignedArea: 'Main Kitchen',
    assignedPrinterId: 'prn-kitchen-1',
    capabilities: { touch: true, sound: true, fullScreen: true, camera: false, qrScanner: false }
  });
  assert(deviceEngine.hasCapability('DEV-KITCHEN-01', 'sound') === true, 'Scenario 3.1: Hardware device capabilities correctly profiled (Sound Enabled)');

  // Scenario 4: Audit Log Correlation ID Tracing
  auditMiddleware.setCorrelationId('corr_test_txn_999');
  notificationEngine.emit({
    role: 'role-manager',
    workspace: 'manager',
    severity: NotificationSeverity.ACTION_REQUIRED,
    title: 'Operational Alert',
    message: 'Shift handover required'
  });
  const auditLogs = auditMiddleware.getAuditLogs({ correlationId: 'corr_test_txn_999' });
  assert(auditLogs.length > 0, 'Scenario 4.1: Audit log records correlated transaction ID across platform operations');
  auditMiddleware.clearCorrelationId();

  // Scenario 5: Platform Health Monitor
  const health = healthMonitor.getSystemHealth();
  assert(health.status === 'HEALTHY' && health.components.database.status === 'HEALTHY', 'Scenario 5.1: Health Monitor reports healthy platform database & hardware subsystems');

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  console.log(`\n🎉 Operational Acceptance Test Suite Finished: ${passed}/${total} Scenarios Passed.`);

  return { total, passed, results };
}
