import { SupabaseDataAdapter } from './adapters/supabaseDataAdapter.js';
import { OfflineDataAdapter } from './adapters/offlineDataAdapter.js';

/**
 * DataGateway orchestration layer for RestaurantOS / BusinessOS platform.
 *
 * Implements Realtime/Cloud-First data access with resilient Offline LocalStore fallback.
 * Routes reads/writes dynamically based on connectivity state without coupling domain repositories to storage mechanics.
 */
export class DataGateway {
  constructor(config = {}) {
    this.cloudAdapter = config.cloudAdapter || (config.supabaseClient ? new SupabaseDataAdapter(config.supabaseClient) : null);
    this.localAdapter = config.localAdapter || (config.offlineStore ? new OfflineDataAdapter(config.offlineStore) : null);
    this.offlineJournal = config.offlineJournal || null;
    this.isOnline = config.isOnline !== undefined ? config.isOnline : true;
    this.listeners = new Map();

    if (config.realtime && typeof config.realtime.subscribe === 'function') {
      config.realtime.subscribe('*', (event) => this.handleRealtimeEvent(event));
    }
  }

  /**
   * Toggles current online/offline connectivity state.
   * @param {boolean} online 
   */
  setOnlineState(online) {
    this.isOnline = !!online;
  }

  /**
   * Processes an incoming normalized realtime event from Supabase Realtime / EventBus.
   * Automatically invalidates/updates the local cache and notifies UI subscribers.
   * @param {Object} event { type: 'data:changed', collection, operation, record, oldRecord, source }
   */
  handleRealtimeEvent(event) {
    if (!event || !event.collection || !event.record) return;
    const { collection, operation, record } = event;

    if (this.localAdapter) {
      const id = record.id || record.uuid || record.itemCode || record.code || record.categoryCode || record.supplierCode || record.uomCode || record.locationCode || record.poNumber || record.grnNumber || record.transferNo || record.issueNo || record.adjustmentNo || record.countNo || record.tableCode || record.employeeCode || record.tenantId;
      if (operation === 'INSERT' || operation === 'UPDATE') {
        const existing = this.localAdapter.getById(collection, id);
        if (existing) {
          this.localAdapter.update(collection, id, record);
        } else {
          this.localAdapter.create(collection, record);
        }
      } else if (operation === 'DELETE') {
        this.localAdapter.delete(collection, id);
      }
    }

    this.notifySubscribers(collection, operation, record);
  }

  /**
   * Synchronous local cache read for immediate UI rendering.
   * @param {string} collection 
   * @param {string|null} tenantId 
   * @returns {Array}
   */
  getCachedCollection(collection, tenantId = null) {
    return this.localAdapter ? this.localAdapter.getCollection(collection, tenantId) : [];
  }

  /**
   * Synchronous local cache single entity lookup.
   * @param {string} collection 
   * @param {string} id 
   * @param {string|null} tenantId 
   * @returns {Object|null}
   */
  getCachedById(collection, id, tenantId = null) {
    const list = this.getCachedCollection(collection, tenantId);
    return list.find(item => item.id === id || item.uuid === id || item.itemCode === id || item.code === id || item.categoryCode === id || item.supplierCode === id || item.uomCode === id || item.locationCode === id || item.poNumber === id || item.grnNumber === id || item.transferNo === id || item.issueNo === id || item.adjustmentNo === id || item.countNo === id || item.tableCode === id || item.employeeCode === id || item.tenantId === id) || null;
  }

  /**
   * Hydrates local cache from cloud storage for requested collections.
   * @param {Array<string>} collections 
   * @param {string|null} tenantId 
   */
  async hydrateCollections(collections = ['tenants', 'identities', 'employees', 'roles'], tenantId = null) {
    const results = {};
    for (const col of collections) {
      results[col] = await this.getCollection(col, tenantId);
    }
    return results;
  }

  /**
   * Fetches collection data.
   * Online: attempts cloud fetch with local fallback + updates local cache.
   * Offline: reads from local store.
   */
  async getCollection(collection, tenantId = null) {
    if (this.isOnline && this.cloudAdapter) {
      try {
        const cloudData = await this.cloudAdapter.getCollection(collection, tenantId);
        if (Array.isArray(cloudData) && cloudData.length > 0) {
          if (this.localAdapter && typeof this.localAdapter.setCollection === 'function') {
            this.localAdapter.setCollection(collection, cloudData);
          }
          return cloudData;
        }
      } catch (e) {
        console.warn(`[DataGateway] Cloud fetch failed for "${collection}", falling back to local adapter`, e);
      }
    }
    return this.getCachedCollection(collection, tenantId);
  }

  /**
   * Fetches single entity by ID.
   */
  async getById(collection, id, tenantId = null) {
    const list = await this.getCollection(collection, tenantId);
    return list.find(item => item.id === id || item.uuid === id || item.itemCode === id || item.code === id || item.categoryCode === id || item.supplierCode === id || item.uomCode === id || item.locationCode === id || item.poNumber === id || item.grnNumber === id || item.transferNo === id || item.issueNo === id || item.adjustmentNo === id || item.countNo === id || item.tableCode === id || item.employeeCode === id || item.tenantId === id) || null;
  }

  /**
   * Creates an entity.
   * Online: updates local cache immediately + upserts to cloud asynchronously.
   * Offline: appends to local store + enqueues sync job.
   */
  async create(collection, data, session = null) {
    const tenantId = session ? session.tenantId : (data.tenantId || '');
    let localResult = null;
    if (this.localAdapter) {
      localResult = this.localAdapter.create(collection, data, session);
    }

    this.notifySubscribers(collection, 'CREATE', localResult || data);

    if (this.isOnline && this.cloudAdapter) {
      try {
        await this.cloudAdapter.create(collection, data, session);
      } catch (e) {
        console.warn(`[DataGateway] Cloud create failed for "${collection}", queued locally`, e);
        if (this.offlineJournal && typeof this.offlineJournal.createSyncJob === 'function') {
          this.offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, collection, { commandType: `CREATE_${collection.toUpperCase()}`, eventType: `${collection}Created`, ...data }, session);
        }
      }
    } else if (this.offlineJournal && typeof this.offlineJournal.createSyncJob === 'function') {
      this.offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, collection, { commandType: `CREATE_${collection.toUpperCase()}`, eventType: `${collection}Created`, ...data }, session);
    }

    return localResult || data;
  }

  /**
   * Updates an entity patch.
   */
  async update(collection, id, patch, session = null) {
    const tenantId = session ? session.tenantId : '';
    let localResult = null;
    if (this.localAdapter) {
      localResult = this.localAdapter.update(collection, id, patch, session);
    }

    this.notifySubscribers(collection, 'UPDATE', localResult || patch);

    if (this.isOnline && this.cloudAdapter) {
      try {
        await this.cloudAdapter.update(collection, id, patch, session);
      } catch (e) {
        console.warn(`[DataGateway] Cloud update failed for "${collection}", queued locally`, e);
        if (this.offlineJournal && typeof this.offlineJournal.createSyncJob === 'function') {
          this.offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, collection, { commandType: `UPDATE_${collection.toUpperCase()}`, eventType: `${collection}Updated`, id, patch }, session);
        }
      }
    } else if (this.offlineJournal && typeof this.offlineJournal.createSyncJob === 'function') {
      this.offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, collection, { commandType: `UPDATE_${collection.toUpperCase()}`, eventType: `${collection}Updated`, id, patch }, session);
    }

    return localResult || patch;
  }

  /**
   * Deletes an entity by ID.
   */
  async delete(collection, id, session = null) {
    const tenantId = session ? session.tenantId : '';
    if (this.localAdapter) {
      this.localAdapter.delete(collection, id);
    }

    this.notifySubscribers(collection, 'DELETE', { id });

    if (this.isOnline && this.cloudAdapter) {
      try {
        await this.cloudAdapter.delete(collection, id);
      } catch (e) {
        console.warn(`[DataGateway] Cloud delete failed for "${collection}", queued locally`, e);
      }
    }
    return true;
  }

  /**
   * Subscribes to collection change events.
   * @param {string} collection 
   * @param {Function} callback 
   * @returns {Function} unsubscribe function
   */
  subscribe(collection, callback) {
    if (!this.listeners.has(collection)) {
      this.listeners.set(collection, new Set());
    }
    this.listeners.get(collection).add(callback);

    return () => {
      if (this.listeners.has(collection)) {
        this.listeners.get(collection).delete(callback);
      }
    };
  }

  notifySubscribers(collection, operation, data) {
    if (this.listeners.has(collection)) {
      this.listeners.get(collection).forEach(cb => {
        try {
          cb({ collection, operation, data });
        } catch (err) {
          console.error(`[DataGateway] Error in subscriber for ${collection}:`, err);
        }
      });
    }

    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(cb => {
        try {
          cb({ collection, operation, data });
        } catch (err) {
          console.error(`[DataGateway] Error in wildcard subscriber:`, err);
        }
      });
    }
  }
}
