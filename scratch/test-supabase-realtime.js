import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('========================================');
console.log('SUPABASE REALTIME TRANSPORT SMOKE TEST');
console.log('========================================\n');

try {
  // Simple Mock Event Bus
  const busEvents = [];
  const mockEventBus = {
    emit(type, payload) {
      busEvents.push({ type, payload });
    }
  };

  const realtime = new SupabaseRealtime({ eventBus: mockEventBus });

  console.log('Test A: EVENT NORMALIZATION (INSERT)');
  const rawInsertRecord = { id: 'kot-101', kotNumber: 'KOT-2026-001', tableNo: 'T-04', items: [{ name: 'Butter Chicken' }] };
  const normalizedInsert = realtime.normalizeEvent('kots', 'INSERT', rawInsertRecord, null);

  const testAPassed = normalizedInsert.type === 'data:changed' &&
                      normalizedInsert.collection === 'kots' &&
                      normalizedInsert.operation === 'INSERT' &&
                      normalizedInsert.source === 'supabase' &&
                      normalizedInsert.record.id === 'kot-101';
  console.log(`  ${testAPassed ? '✓' : '✗'} Normalized event matches shape (type: "${normalizedInsert.type}", collection: "${normalizedInsert.collection}")`);

  console.log('\nTest B: EVENT BUS DELIVERY');
  const subscriberReceived = [];
  realtime.subscribe('kots', (event) => {
    subscriberReceived.push(event);
  });

  realtime.handleIncomingPayload('kots', 'INSERT', rawInsertRecord);
  const testBPassed = busEvents.length === 1 &&
                      busEvents[0].type === 'data:changed' &&
                      subscriberReceived.length === 1 &&
                      subscriberReceived[0].record.kotNumber === 'KOT-2026-001';
  console.log(`  ${testBPassed ? '✓' : '✗'} Event bus & subscriber received normalized payload (${subscriberReceived.length} received)`);

  console.log('\nTest C: UPDATE HANDLING');
  const oldUpdateRecord = { id: 'kot-101', status: 'PENDING' };
  const newUpdateRecord = { id: 'kot-101', status: 'PREPARING' };
  const normalizedUpdate = realtime.handleIncomingPayload('kots', 'UPDATE', newUpdateRecord, oldUpdateRecord);

  const testCPassed = normalizedUpdate.operation === 'UPDATE' &&
                      normalizedUpdate.record.status === 'PREPARING' &&
                      normalizedUpdate.oldRecord.status === 'PENDING' &&
                      busEvents.length === 2;
  console.log(`  ${testCPassed ? '✓' : '✗'} Update payload preserved record & oldRecord (status: ${normalizedUpdate.oldRecord.status} → ${normalizedUpdate.record.status})`);

  console.log('\nTest D: DELETE HANDLING');
  const deletedRecord = { id: 'kot-101', status: 'CANCELLED' };
  const normalizedDelete = realtime.handleIncomingPayload('kots', 'DELETE', deletedRecord, null);

  const testDPassed = normalizedDelete.operation === 'DELETE' &&
                      normalizedDelete.record.id === 'kot-101' &&
                      busEvents.length === 3;
  console.log(`  ${testDPassed ? '✓' : '✗'} Delete payload preserved operation & record`);

  console.log('\n========================================');
  if (testAPassed && testBPassed && testCPassed && testDPassed) {
    console.log('RESULT: PASS (Supabase Realtime Transport & Event Bus Integration Verified)');
  } else {
    console.log('RESULT: FAIL (Realtime transport or event bus issue)');
  }
  console.log('========================================');

} catch (err) {
  console.error('FATAL ERROR DURING REALTIME SMOKE TEST:', err);
  process.exit(1);
}
