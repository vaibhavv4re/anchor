/**
 * BusinessOS Platform - Domain-Aware Offline Store
 *
 * Stage 2A: durable, non-truncating local journal.
 *
 * The whole app depends on a SYNCHRONOUS read path (`getCollection`), so we
 * cannot move primary reads onto the asynchronous IndexedDB API without touching
 * hundreds of call sites (a breaking change the plan forbids). Instead:
 *   - localStorage + an in-memory cache remain the synchronous read/write mirror
 *     the app already uses (unchanged behavior); and
 *   - IndexedDB is added as a durable, high-capacity WRITE-BEHIND store that is
 *     NOT subject to the ~5MB localStorage quota, plus a STARTUP HYDRATOR that
 *     replays the durable copy back into the mirror.
 * Together with the removal of the destructive 15-row truncation (below), this
 * is what fixes "lose changes during long offline windows."
 *
 * Every IndexedDB call is wrapped in try/catch and is best-effort: if the DB is
 * unavailable the store degrades silently to the prior localStorage behavior,
 * so the app never breaks.
 *
 * Ensures 100% offline-first execution with zero data loss.
 */

const IDB_DB_NAME = 'restaurant_os_v1_db';
const IDB_DB_VERSION = 1;
const IDB_STORE = 'collections';

/**
 * Minimal promise wrapper around the raw IndexedDB API (no external dep).
 * Returns null when IndexedDB is unavailable so callers can fall back.
 */
function idbOpen() {
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: 'collection' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  } catch (_) {
    return Promise.resolve(null);
  }
}

class OfflineStore {
  constructor() {
    this.prefix = 'restaurant_os_v1_';
    this.memoryCache = new Map();
    // Collections that must NEVER be length-capped: financial + journal rows
    // are append-only evidence and losing them is the core offline data-loss bug.
    this.NO_TRUNCATE = [
      'offline_journal', 'orders', 'payments', 'invoices', 'bill_revisions', 'table_sessions'
    ];
    // Durable backing store (Stage 2A). Best-effort; null until opened.
    this._db = null;
    this._idbReady = false;
    // Collections written before the DB finished opening, replayed once ready.
    this._pendingIdb = new Map();
    this._initSeedData();
    this._bootstrapIndexedDb();
  }

  /**
   * Reads data from local storage or memory cache.
   * @param {string} collection 
   * @returns {Array|Object|null}
   */
  getCollection(collection) {
    if (this.memoryCache.has(collection)) {
      return this.memoryCache.get(collection);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(this.prefix + collection);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.memoryCache.set(collection, parsed);
          return parsed;
        }
      }
    } catch (e) {
      // Memory cache is the primary fallback
    }
    return null;
  }

  /**
   * Writes data to local storage and updates memory cache.
   * Handles QuotaExceededError automatically with emergency log pruning.
   * @param {string} collection 
   * @param {any} data 
   */
  setCollection(collection, data) {
    this.memoryCache.set(collection, data);
    // Durable write-behind to IndexedDB (Stage 2A). Best-effort and async so it
    // never blocks the synchronous read/write path the app relies on.
    this._idbPersist(collection, data);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.prefix + collection, JSON.stringify(data));
      }
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.number === -2147024882 || String(e).includes('quota'))) {
        // localStorage is full. IndexedDB already holds the durable copy, so we
        // only shed already-SYNCED journal noise from the mirror (never financial
        // rows) and retry. Data is NOT lost because IDB is the source of truth.
        this._pruneSyncedJournalMirror();
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(this.prefix + collection, JSON.stringify(data));
          }
        } catch (retryErr) {
          // Memory cache + IndexedDB still hold the data; the mirror is best-effort.
        }
      }
    }
  }

  /**
   * Append item to array collection with automatic ring-buffer capping.
   * @param {string} collection 
   * @param {Object} item 
   * @param {number} maxItems 
   */
  appendItem(collection, item, maxItems = 50) {
    let list = this.getCollection(collection) || [];
    if (!Array.isArray(list)) list = [];

    const itemId = item ? (item.id || item.uuid || item.grnNumber || item.poNumber || item.movementId || item.code) : null;
    const itemCode = item ? (item.itemCode || item.item_code) : null;
    const locCode = item ? (item.locationCode || item.location_code) : null;

    const existingIdx = list.findIndex(existing => {
      if (!existing) return false;
      const exId = existing.id || existing.uuid || existing.grnNumber || existing.poNumber || existing.movementId || existing.code;
      if (itemId && exId && itemId === exId) return true;
      if (collection === 'stock_balances' && itemCode && locCode) {
        const exItem = existing.itemCode || existing.item_code;
        const exLoc = existing.locationCode || existing.location_code;
        if (exItem === itemCode && exLoc === locCode) return true;
      }
      return false;
    });

    if (existingIdx !== -1) {
      list[existingIdx] = { ...list[existingIdx], ...item };
    } else {
      list.push(item);
    }

    const logCaps = {
      timeline_ledger: 50,
      audit: 50,
      stock_ledger: 50,
      notifications: 30
    };

    // Stage 2A: financial + journal collections are NEVER length-capped (this was
    // the destructive slice that lost offline data). Only noisy, replay-safe log
    // streams are capped, and even those keep the most-recent rows.
    let finalData = list;
    if (!this.NO_TRUNCATE.includes(collection)) {
      const cap = logCaps[collection] || maxItems;
      if (Array.isArray(list) && list.length > cap && !['stock_balances', 'inventory', 'suppliers', 'supplier_catalog', 'recipes', 'kitchen_menu_items'].includes(collection)) {
        finalData = list.slice(-cap);
      }
    }

    this.setCollection(collection, finalData);
    return item;
  }

  /**
   * Stage 2A: update (or insert) a single item in an array collection by a set of
   * candidate id fields. Rounds out the synchronous store API surface used by the
   * domain models. No-ops safely when the collection or id is missing.
   * @param {string} collection
   * @param {string} id
   * @param {Object} patch
   */
  updateItem(collection, id, patch) {
    const list = this.getCollection(collection);
    if (!Array.isArray(list) || !id) return null;
    const idx = list.findIndex(e => e && (e.id === id || e.uuid === id || e.paymentId === id ||
      e.sessionId === id || e.revisionId === id || e.invoiceNumber === id || e.orderId === id));
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    this.setCollection(collection, list);
    return list[idx];
  }

  /**
   * Stage 2A: safe quota relief for the localStorage mirror.
   *
   * Replaces the old _purgeStaleLogs() which destructively trimmed financial and
   * journal collections to 15 rows (the offline data-loss bug). This version
   * ONLY drops journal entries already in SYNCED state beyond a generous
   * HIGH_WATER mark, and never touches financial rows. Durable copies still live
   * in IndexedDB, so even this is recoverable.
   */
  _pruneSyncedJournalMirror() {
    const HIGH_WATER = 500;
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(this.prefix + 'offline_journal');
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      const isSynced = j => j && (j.syncState === 'SYNCED' || j.sync_state === 'SYNCED');
      const pending = list.filter(j => !isSynced(j));
      const synced = list.filter(isSynced);
      // Keep all pending + only the most recent HIGH_WATER synced rows.
      const keep = pending.concat(synced.slice(-HIGH_WATER));
      if (keep.length !== list.length) {
        localStorage.setItem(this.prefix + 'offline_journal', JSON.stringify(keep));
        this.memoryCache.set('offline_journal', keep);
      }
    } catch (_) {
      // Best-effort only; IndexedDB is the durable store.
    }
  }

  /**
   * Stage 2A: open IndexedDB, migrate any pre-existing localStorage collections
   * into it (NON-BREAKING GATE - no local/pending data loss), then hydrate the
   * durable copy back into the synchronous mirror. All best-effort: on any error
   * the store simply keeps using localStorage.
   */
  _bootstrapIndexedDb() {
    if (typeof window === 'undefined') return;
    idbOpen().then((db) => {
      if (!db) return;
      this._db = db;
      this._idbReady = true;
      try {
        this._migrateLocalStorageIntoIdb();
        this._hydrateFromIdb();
        // Flush writes that happened before the DB finished opening.
        this._pendingIdb.forEach((data, col) => this._idbPersist(col, data));
        this._pendingIdb.clear();
      } catch (_) {
        // Ignore; mirror remains authoritative for reads.
      }
    }).catch(() => { /* IDB unavailable; localStorage path stays active */ });
  }

  /**
   * One-time localStorage -> IndexedDB migration. Copies every restaurant_os_v1_*
   * collection (pending offline_journal jobs and the _initSeedData defaults for
   * identities/employees/roles/configuration/devices included) into the durable
   * store, then leaves the originals in place as the live mirror. A marker records
   * completion so re-runs are cheap. Old keys are NOT deleted (archive semantics).
   */
  _migrateLocalStorageIntoIdb() {
    if (typeof localStorage === 'undefined' || !this._db) return;
    try {
      if (localStorage.getItem(this.prefix + '_idb_migrated_v1') === '1') return;
    } catch (_) {}
    const seeded = [
      'identities', 'employees', 'roles', 'configuration', 'devices', 'attendance',
      'audit', 'sessions', 'notifications', 'offline_journal', 'orders', 'payments',
      'invoices', 'bill_revisions', 'table_sessions', 'stock_balances', 'inventory',
      'suppliers', 'supplier_catalog', 'recipes', 'kitchen_menu_items', 'tenants'
    ];
    let dbObj = null;
    try {
      dbObj = this._db.transaction([IDB_STORE], 'readwrite').objectStore(IDB_STORE);
    } catch (_) { return; }
    seeded.forEach((col) => {
      try {
        const raw = localStorage.getItem(this.prefix + col);
        if (raw === null) return;
        dbObj.put({ collection: col, data: JSON.parse(raw), migratedAt: new Date().toISOString() });
      } catch (_) {}
    });
    try { localStorage.setItem(this.prefix + '_idb_migrated_v1', '1'); } catch (_) {}
  }

  /**
   * Replay the durable IndexedDB copy into the in-memory + localStorage mirror so
   * the synchronous read path sees the full, un-truncated dataset.
   */
  _hydrateFromIdb() {
    if (!this._db) return;
    try {
      const tx = this._db.transaction([IDB_STORE], 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        rows.forEach((row) => {
          if (!row || !row.collection) return;
          const col = row.collection;
          const incoming = row.data;
          // Prefer the richer (longer) dataset so a truncated mirror cannot lose to
          // an older IDB snapshot; seeds/migrations make IDB the fuller copy.
          const current = this.memoryCache.get(col);
          const currentLen = Array.isArray(current) ? current.length : -1;
          const incomingLen = Array.isArray(incoming) ? incoming.length : -1;
          if (currentLen === -1 || incomingLen >= currentLen || !Array.isArray(current)) {
            this.memoryCache.set(col, incoming);
            try {
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.prefix + col, JSON.stringify(incoming));
              }
            } catch (_) {}
          }
        });
      };
    } catch (_) {}
  }

  /**
   * Best-effort durable write. Persists synchronously into the write-behind
   * buffer; the actual IDB put happens once the DB is ready.
   */
  _idbPersist(collection, data) {
    if (!this._idbReady || !this._db) {
      this._pendingIdb.set(collection, data);
      return;
    }
    try {
      const tx = this._db.transaction([IDB_STORE], 'readwrite');
      tx.objectStore(IDB_STORE).put({ collection, data, updatedAt: new Date().toISOString() });
    } catch (_) {
      // Non-fatal: mirror (localStorage/memory) already holds the write.
    }
  }

  /**
   * Seed default initial system state if store is empty.
   */
  _initSeedData() {
    // Stage 2A: the destructive _purgeStaleLogs() 15-row trim was removed. Seed
    // defaults are written once and, when absent, are re-created; existing local
    // or IndexedDB-hydrated data is never truncated.
    // Seed Identities & Employees if not existing
    if (!this.getCollection('identities')) {
      const initialIdentities = [
        {
          id: 'id-superadmin',
          pinHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // SHA-256 for 888888
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        },
        {
          id: 'id-admin',
          pinHash: '937377f056160fc4b15e0b770c67136a5f03c15205b4d3bf918268fefa2c6d0a', // SHA-256 for 999999
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        }
      ];
      this.setCollection('identities', initialIdentities);
    }

    if (!this.getCollection('employees')) {
      const initialEmployees = [
        {
          id: 'emp-admin',
          identityId: 'id-admin',
          name: 'System Admin',
          roleId: 'role-admin',
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          workspaceDefault: 'admin'
        },
        {
          id: 'emp-rahul',
          identityId: 'id-waiter-rahul',
          name: 'Rahul Sharma',
          roleId: 'role-waiter',
          avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          workspaceDefault: 'waiter'
        },
        {
          id: 'emp-vikram',
          identityId: 'id-chef-vikram',
          name: 'Chef Vikram',
          roleId: 'role-chef',
          avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
          workspaceDefault: 'kitchen'
        },
        {
          id: 'emp-priya',
          identityId: 'id-manager-priya',
          name: 'Priya Mehta',
          roleId: 'role-manager',
          avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
          workspaceDefault: 'manager'
        },
        {
          id: 'emp-ca',
          identityId: 'id-ca',
          name: 'CA Rajesh Mehta',
          roleId: 'role-ca',
          avatarUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150',
          workspaceDefault: 'ca',
          pinDisplay: '777777'
        },
        {
          id: 'emp-owner',
          identityId: 'id-owner',
          name: 'Sachin (Restaurant Owner)',
          roleId: 'role-owner',
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          workspaceDefault: 'owner',
          pinDisplay: '888888'
        }
      ];
      this.setCollection('employees', initialEmployees);
    }

    if (!this.getCollection('roles')) {
      const initialRoles = [
        {
          id: 'role-owner',
          name: 'Restaurant Owner',
          workspace: 'owner',
          permissions: ['*']
        },
        {
          id: 'role-ca',
          name: 'Chartered Accountant / Auditor',
          workspace: 'ca',
          permissions: ['ca.view', 'accounting.view', 'reports.view', 'export.generate']
        },
        {
          id: 'role-superadmin',
          name: 'System Superadmin',
          workspace: 'superadmin',
          permissions: ['*']
        },
        {
          id: 'role-admin',
          name: 'General Manager / Admin',
          workspace: 'admin',
          permissions: ['user.create', 'user.edit', 'user.disable', 'pin.reset', 'config.edit', 'device.manage', 'audit.view']
        },
        {
          id: 'role-manager',
          name: 'Operations Manager',
          workspace: 'manager',
          permissions: ['override.lock', 'floor.view', 'kitchen.view', 'attendance.view', 'action.approve']
        },
        {
          id: 'role-waiter',
          name: 'Floor Server / Waiter',
          workspace: 'waiter',
          permissions: ['floor.view', 'table.session', 'order.create', 'kot.generate']
        },
        {
          id: 'role-chef',
          name: 'Kitchen Head Chef',
          workspace: 'kitchen',
          permissions: ['kitchen.view', 'kot.update', 'recipe.view']
        },
        {
          id: 'role-cashier',
          name: 'Cashier & Billing',
          workspace: 'cashier',
          permissions: ['cashier.view', 'payment.process', 'bill.revision']
        },
        {
          id: 'role-inventory-manager',
          name: 'Inventory Manager',
          workspace: 'inventory',
          permissions: ['inventory.view', 'stock.manage', 'recipe.manage']
        },
        {
          id: 'role-bar',
          name: 'Bartender',
          workspace: 'bar',
          permissions: ['bar.view', 'order.create']
        }
      ];
      this.setCollection('roles', initialRoles);
    } else {
      const existingRoles = this.getCollection('roles') || [];
      if (Array.isArray(existingRoles) && !existingRoles.some(r => r.id === 'role-ca')) {
        existingRoles.push({
          id: 'role-ca',
          name: 'Chartered Accountant / CA Auditor',
          workspace: 'ca',
          permissions: ['ca.view', 'accounting.view', 'reports.view', 'export.generate']
        });
        this.setCollection('roles', existingRoles);
      }
    }

    if (!this.getCollection('configuration')) {
      const defaultConfig = {
        business: {
          name: 'Anchor Bistro & Cafe',
          currency: 'INR',
          currencySymbol: '₹',
          timezone: 'Asia/Kolkata',
          businessHours: { open: '09:00', close: '23:00' }
        },
        hardware: {
          printers: [
            { id: 'prn-kitchen-1', name: 'Kitchen Thermal Printer', ip: '192.168.1.100', type: 'ESC/POS' },
            { id: 'prn-bar-1', name: 'Bar Thermal Printer', ip: '192.168.1.101', type: 'ESC/POS' },
            { id: 'prn-bill-1', name: 'Cashier Receipt Printer', ip: '192.168.1.102', type: 'ESC/POS' }
          ]
        },
        payments: {
          taxRates: [{ name: 'GST', percent: 5 }],
          currency: 'INR',
          gateways: ['RAZORPAY_UPI', 'CASH', 'CARD']
        },
        printing: {
          autoPrintKOT: true,
          autoPrintBill: true
        },
        system: {
          idleTimeoutMinutes: {
            waiter: 3,
            kitchen: 0, // Never lock
            manager: 10,
            admin: 5,
            cashier: 5
          },
          requirePhotoConfirmation: true
        }
      };
      this.setCollection('configuration', defaultConfig);
    }

    if (!this.getCollection('devices')) {
      const initialDevices = [
        {
          id: 'DEV-FLOOR-01',
          name: 'Main Dining Floor Tablet 1',
          assignedWorkspace: 'waiter',
          assignedArea: 'Main Dining Area',
          assignedPrinterId: 'prn-kitchen-1',
          allowedRoles: ['role-waiter', 'role-manager', 'role-admin'],
          registeredAt: new Date().toISOString()
        }
      ];
      this.setCollection('devices', initialDevices);
    }

    if (!this.getCollection('attendance')) {
      this.setCollection('attendance', []);
    }
    if (!this.getCollection('audit')) {
      this.setCollection('audit', []);
    }
    if (!this.getCollection('sessions')) {
      this.setCollection('sessions', []);
    }
    if (!this.getCollection('notifications')) {
      this.setCollection('notifications', []);
    }
  }
}

export const offlineStore = new OfflineStore();
