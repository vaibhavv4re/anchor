import { AuthEngine } from '../businessos/platform/authentication/authEngine.js';

// Mock localStorage for Node environment test
const mockStorage = {};
global.window = {
  localStorage: {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; }
  }
};

async function testSessionPersistence() {
  console.log('🧪 TEST: Session Persistence & Seamless Browser Refresh (No PIN prompt unless Locked)\n');

  // 1. First AuthEngine instance (initial login)
  const engine1 = new AuthEngine();
  console.log('1️⃣ Initializing AuthEngine #1... Active Session:', engine1.getCurrentSession() ? 'ACTIVE' : 'NULL');

  const authRes = await engine1.authenticate('333333'); // Kirtan
  console.log('2️⃣ Logged in Kirtan (333333):', authRes.success ? 'SUCCESS ✓' : 'FAILED ❌');
  console.log('   - Employee:', authRes.session.employeeName, '| Role:', authRes.session.roleId, '| Workspace:', authRes.session.workspace);
  console.log('   - LocalStorage Token:', global.window.localStorage.getItem('anchor_active_session') ? 'SAVED ✓' : 'FAILED ❌');

  // 2. Simulate Page Refresh by instantiating AuthEngine #2
  console.log('\n3️⃣ Simulating Page Refresh (instantiating fresh AuthEngine)...');
  const engine2 = new AuthEngine();
  const restoredSession = engine2.getCurrentSession();

  console.log('4️⃣ Session Recovery Status:', restoredSession ? 'RESTORED AUTOMATICALLY ✓' : 'FAILED (Prompting PIN) ❌');
  if (restoredSession) {
    console.log('   - Restored User:', restoredSession.employeeName);
    console.log('   - Restored Workspace:', restoredSession.workspace);
  }

  // 3. User clicks Lock Screen
  console.log('\n5️⃣ User Clicks "🔒 Lock"...');
  engine2.lockSession();
  console.log('   - Session after lock:', engine2.getCurrentSession() ? 'ACTIVE' : 'NULL (LOCKED) ✓');

  // 4. Simulate Page Refresh AFTER Lock
  console.log('\n6️⃣ Simulating Page Refresh after Lock...');
  const engine3 = new AuthEngine();
  const postLockSession = engine3.getCurrentSession();
  console.log('7️⃣ Post-Lock Session Status:', postLockSession ? 'FAILED ❌' : 'NULL (PIN Pad Shown) ✓');

  if (restoredSession && restoredSession.employeeName === 'Kirtan' && !postLockSession) {
    console.log('\n====================================================================');
    console.log('SESSION PERSISTENCE & REFRESH TEST: 100% PASS ✓');
    console.log('====================================================================');
  } else {
    console.error('❌ Session persistence test failed');
    process.exit(1);
  }
}

testSessionPersistence().catch(console.error);
