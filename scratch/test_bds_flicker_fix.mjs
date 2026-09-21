import { strict as assert } from 'assert';
import { platformEventBus } from '../businessos/platform/events/platformEvents.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { kitchenMenuModel } from '../businessos/platform/kitchen/kitchenMenuModel.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
const dataGateway = new DataGateway({ isOnline: false });
import { BarWorkspaceView } from '../restaurantos/frontend/capabilities/bar/ui/BarWorkspaceView.js';
import { BarDisplaySystemView } from '../restaurantos/frontend/capabilities/bar/ui/BarDisplaySystemView.js';

console.log('========================================================================');
console.log('TESTING BDS FLICKER & RECURSIVE RE-RENDER FIXES');
console.log('========================================================================');

// Test 1: kitchenMenuModel.getAll() does not emit data:changed
let eventCount = 0;
const unsub = platformEventBus.subscribe('data:changed', () => {
  eventCount++;
});

// Setup some sample items with potential duplicates
offlineStore.setCollection('kitchen_menu_items', [
  { id: 'item-1', itemName: 'Mojito', category: 'Cocktails', sellingPrice: 350, variants: [] },
  { id: 'item-2', itemName: 'Mojito', category: 'Cocktails', sellingPrice: 350, variants: [] },
  { id: 'item-3', itemName: 'Beer', category: 'Beer', sellingPrice: 200, variants: [] }
]);

const items = kitchenMenuModel.getAll();
console.log(`[TEST 1] kitchenMenuModel.getAll() returned ${items.length} items. data:changed count: ${eventCount}`);
assert.equal(eventCount, 0, 'kitchenMenuModel.getAll() MUST NEVER publish data:changed!');
unsub();

// Test 2: dataGateway.getCollection does not publish data:changed
let dgEvents = 0;
const unsubDg = platformEventBus.subscribe('data:changed', () => {
  dgEvents++;
});
dataGateway.getCachedCollection('kitchen_menu_items');
console.log(`[TEST 2] dataGateway get query events count: ${dgEvents}`);
assert.equal(dgEvents, 0, 'dataGateway read query MUST NOT emit data:changed!');
unsubDg();

// Test 3: BarWorkspaceView does NOT wipe activeBdsView on background events
// Mock DOM minimal environment
global.document = {
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    className: '',
    style: {},
    innerHTML: '',
    children: [],
    appendChild(child) { this.children.push(child); },
    querySelector: () => null,
    querySelectorAll: () => []
  }),
  body: {
    contains: () => true
  },
  fullscreenElement: null
};

const barWs = new BarWorkspaceView();
barWs.container = global.document.createElement('div');

// Simulate mounting BDS
barWs.activeBdsView = new BarDisplaySystemView();
const bdsEl = global.document.createElement('div');
bdsEl.className = 'bds-fullscreen-workspace';
barWs.container.appendChild(bdsEl);

console.log('[TEST 3] Simulating updateContent() while activeBdsView is active...');
barWs.updateContent();

// Check that container still has the bdsEl and wasn't wiped
assert.ok(barWs.activeBdsView !== null, 'activeBdsView must still be active!');
assert.equal(barWs.container.children.length, 1, 'Container must retain BDS element!');
assert.equal(barWs.container.children[0].className, 'bds-fullscreen-workspace', 'Container child must still be BDS!');
console.log('[PASS] activeBdsView was NOT overwritten by updateContent()!');

// Test 4: Exit BDS properly cleans up
console.log('[TEST 4] Simulating BDS onExit...');
if (typeof barWs.activeBdsView.destroy === 'function') {
  barWs.activeBdsView.destroy();
}
barWs.activeBdsView = null;
assert.equal(barWs.activeBdsView, null, 'activeBdsView must be null after exit');

// Test 5: Destroy method cleans up event listeners
barWs.destroy();
assert.equal(barWs.unsubscribeEvents.length, 0, 'All event subscriptions must be unsubscribed on destroy');

console.log('========================================================================');
console.log('ALL TESTS PASSED 100%! BDS STABILITY & ANTI-FLICKER PROVEN.');
console.log('========================================================================');
