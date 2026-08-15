import { TableRepository } from '../businessos/platform/repositories/tableRepository.js';
import { StaffRepository } from '../businessos/platform/repositories/staffRepository.js';
import { TenantRepository } from '../businessos/platform/repositories/tenantRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('====================================================');
console.log('GROUP D (RESTAURANT OPS & ASSETS) INTEGRATION TEST');
console.log('====================================================\n');

try {
  const mockOfflineStore = {
    collections: {
      tables_master: [],
      employees: [],
      tenants: [
        { id: 'ros-tenant-master', tenantId: 'ros-tenant-master', identity: { businessName: 'Anchor Bistro' }, status: 'ACTIVE' }
      ]
    },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  const realtime = new SupabaseRealtime();
  const gateway = new DataGateway({
    offlineStore: mockOfflineStore,
    realtime,
    isOnline: true
  });

  const tblRepo = new TableRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const staffRepo = new StaffRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const tenantRepo = new TenantRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });

  const session = { employeeName: 'Restaurant GM', tenantId: 'ros-tenant-master' };

  console.log('1. TABLE REPOSITORY CREATION & STATE TRANSITION');
  const tbl = tblRepo.create({
    tableCode: 'TBL-12',
    tableName: 'Patio Table 12',
    capacity: 6,
    tableStatus: 'VACANT'
  }, session);

  tblRepo.update(tbl.id, { tableStatus: 'OCCUPIED' }, session);
  const reReadTbl = tblRepo.getByTableCode('TBL-12', 'ros-tenant-master');
  const d1Passed = reReadTbl && reReadTbl.tableStatus === 'OCCUPIED' && !(reReadTbl instanceof Promise);
  console.log(`  ${d1Passed ? '✓' : '✗'} Table created & updated synchronously ("${reReadTbl?.tableCode}", Status: ${reReadTbl?.tableStatus})`);

  console.log('\n2. STAFF REPOSITORY ACCOUNT MANAGEMENT');
  const emp = staffRepo.create({
    employeeCode: 'EMP-501',
    name: 'Chef Gordon',
    role: 'Head Chef',
    pin: '1234'
  }, session);

  const reReadEmp = staffRepo.getByEmployeeCode('EMP-501', 'ros-tenant-master');
  const d2Passed = reReadEmp && reReadEmp.name === 'Chef Gordon' && !(reReadEmp instanceof Promise);
  console.log(`  ${d2Passed ? '✓' : '✗'} Staff account created synchronously ("${reReadEmp?.name}", Role: ${reReadEmp?.role})`);

  console.log('\n3. TENANT REPOSITORY PROFILE & SECTION UPDATE');
  const updatedTenant = tenantRepo.updateSection('ros-tenant-master', 'identity', { businessName: 'Anchor Fine Dining' }, session);
  const reReadTenant = tenantRepo.getById('ros-tenant-master');
  const d3Passed = updatedTenant && reReadTenant.identity.businessName === 'Anchor Fine Dining' && !(updatedTenant instanceof Promise);
  console.log(`  ${d3Passed ? '✓' : '✗'} Business tenant profile section updated ("${reReadTenant?.identity?.businessName}")`);

  console.log('\n4. REALTIME EVENT DISPATCH ACROSS RESTAURANT OPS');
  realtime.handleIncomingPayload('tables_master', 'UPDATE', {
    id: tbl.id,
    tableCode: 'TBL-12',
    tableStatus: 'CLEANING',
    tenantId: 'ros-tenant-master'
  });

  const rtTbl = tblRepo.getByTableCode('TBL-12', 'ros-tenant-master');
  const d4Passed = rtTbl && rtTbl.tableStatus === 'CLEANING';
  console.log(`  ${d4Passed ? '✓' : '✗'} Realtime event updated table cache ("${rtTbl?.tableStatus}")`);

  console.log('\n====================================================');
  if (d1Passed && d2Passed && d3Passed && d4Passed) {
    console.log('GROUP D ACCEPTANCE RESULT: PASS (All Restaurant Ops Repositories Integrated & Validated)');
  } else {
    console.log('GROUP D ACCEPTANCE RESULT: FAIL (Integration error)');
  }
  console.log('====================================================');

} catch (err) {
  console.error('FATAL ERROR DURING GROUP D INTEGRATION TEST:', err);
  process.exit(1);
}
