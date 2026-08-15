import { TableRepository } from '../businessos/platform/repositories/tableRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('==============================================');
console.log('TABLE REPOSITORY DATA GATEWAY TEST');
console.log('==============================================\n');

try {
  const mockOfflineStore = {
    collections: { tables_master: [] },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  const realtime = new SupabaseRealtime();
  const gateway = new DataGateway({
    offlineStore: mockOfflineStore,
    realtime
  });

  const tblRepo = new TableRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore
  });

  const session = { employeeName: 'Floor Captain', tenantId: 'ros-tenant-master' };

  console.log('Test 1: SYNCHRONOUS create()');
  const createdTable = tblRepo.create({
    tableCode: 'TBL-01',
    tableName: 'Table 01 (Main Hall)',
    capacity: 4,
    diningArea: 'Main Dining Hall',
    tableStatus: 'VACANT'
  }, session);

  const test1Passed = createdTable && createdTable.tableCode === 'TBL-01' && !(createdTable instanceof Promise);
  console.log(`  ${test1Passed ? '✓' : '✗'} Created table asset synchronously ("${createdTable?.tableCode}", Capacity: ${createdTable?.capacity})`);

  console.log('\nTest 2: SYNCHRONOUS update() (VACANT -> OCCUPIED)');
  const updatedTable = tblRepo.update(createdTable.id, { tableStatus: 'OCCUPIED', activeOrderId: 'ORD-1001' }, session);
  const test2Passed = updatedTable && updatedTable.tableStatus === 'OCCUPIED' && !(updatedTable instanceof Promise);
  console.log(`  ${test2Passed ? '✓' : '✗'} Updated table status synchronously ("${updatedTable?.tableStatus}")`);

  console.log('\nTest 3: REALTIME CLOUD UPDATE INVALIDATION');
  const realtimeUpdate = {
    id: createdTable.id,
    tableCode: 'TBL-01',
    tableStatus: 'BILLING',
    activeOrderId: 'ORD-1001',
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('tables_master', 'UPDATE', realtimeUpdate);
  const reReadTable = tblRepo.getByTableCode('TBL-01', 'ros-tenant-master');
  const test3Passed = reReadTable && reReadTable.tableStatus === 'BILLING' && !(reReadTable instanceof Promise);
  console.log(`  ${test3Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated table status ("${reReadTable?.tableStatus}")`);

  console.log('\n==============================================');
  if (test1Passed && test2Passed && test3Passed) {
    console.log('RESULT: PASS (TableRepository DataGateway Migration Verified)');
  } else {
    console.log('RESULT: FAIL (TableRepository DataGateway issue)');
  }
  console.log('==============================================');

} catch (err) {
  console.error('FATAL ERROR DURING TABLE GATEWAY TEST:', err);
  process.exit(1);
}
