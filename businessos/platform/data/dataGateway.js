import { SupabaseDataAdapter } from './adapters/supabaseDataAdapter.js';
import { OfflineDataAdapter } from './adapters/offlineDataAdapter.js';
import { offlineStore } from '../offline_store/offlineStore.js';

/**
 * DataGateway orchestration layer for RestaurantOS / BusinessOS platform.
 *
 * Implements Realtime/Cloud-First data access with resilient Offline LocalStore fallback.
 * Routes reads/writes dynamically based on connectivity state without coupling domain repositories to storage mechanics.
 */
export class DataGateway {
  constructor(config = {}) {
    if (config && config instanceof SupabaseDataAdapter) {
      this.cloudAdapter = config;
      this.localAdapter = new OfflineDataAdapter(offlineStore);
    } else {
      this.cloudAdapter = config.cloudAdapter || (config.supabaseClient ? new SupabaseDataAdapter(config.supabaseClient) : null);
      this.localAdapter = config.localAdapter || (config.offlineStore ? new OfflineDataAdapter(config.offlineStore) : new OfflineDataAdapter(offlineStore));
    }
    this.offlineJournal = config.offlineJournal || null;
    this.isOnline = config.isOnline !== undefined ? config.isOnline : true;
    this.listeners = new Map();

    if (config.realtime && typeof config.realtime.subscribe === 'function') {
      config.realtime.subscribe('*', (event) => this.handleRealtimeEvent(event));
    }
  }

  setOnlineState(online) {
    this.isOnline = !!online;
  }

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

  getCachedCollection(collection, tenantId = null) {
    return this.localAdapter ? this.localAdapter.getCollection(collection, tenantId) : [];
  }

  getCachedById(collection, id, tenantId = null) {
    const list = this.getCachedCollection(collection, tenantId);
    return list.find(item => item.id === id || item.uuid === id || item.itemCode === id || item.code === id || item.categoryCode === id || item.supplierCode === id || item.uomCode === id || item.locationCode === id || item.poNumber === id || item.grnNumber === id || item.transferNo === id || item.issueNo === id || item.adjustmentNo === id || item.countNo === id || item.tableCode === id || item.employeeCode === id || item.tenantId === id) || null;
  }

  async hydrateCollections(collections = ['tenants', 'identities', 'employees'], tenantId = null) {
    const results = {};
    for (const col of collections) {
      if (col !== 'roles') {
        results[col] = await this.getCollection(col, tenantId);
      }
    }
    return results;
  }

  async getCollection(collection, tenantId = null) {
    if (this.isOnline && this.cloudAdapter && collection !== 'roles') {
      try {
        const cloudData = await this.cloudAdapter.getCollection(collection, tenantId);
        if (Array.isArray(cloudData) && cloudData.length > 0) {
          if (this.localAdapter && typeof this.localAdapter.setCollection === 'function') {
            this.localAdapter.setCollection(collection, cloudData);
          }
          return cloudData;
        }
      } catch (e) {
        console.warn(`[DataGateway] Cloud fetch failed for "${collection}", falling back to local cache:`, e.message);
      }
    }
    return this.getCachedCollection(collection, tenantId);
  }

  async getById(collection, id, tenantId = null) {
    if (this.isOnline && this.cloudAdapter && collection !== 'roles') {
      try {
        const record = await this.cloudAdapter.getById(collection, id, tenantId);
        if (record) {
          if (this.localAdapter) {
            const existing = this.localAdapter.getById(collection, id);
            if (existing) this.localAdapter.update(collection, id, record);
            else this.localAdapter.create(collection, record);
          }
          return record;
        }
      } catch (e) {
        console.warn(`[DataGateway] Cloud getById failed for "${collection}:${id}", falling back to local cache:`, e.message);
      }
    }
    return this.getCachedById(collection, id, tenantId);
  }

  async create(collection, record) {
    if (this.localAdapter) {
      this.localAdapter.create(collection, record);
    }
    if (this.isOnline && this.cloudAdapter && collection !== 'roles') {
      try {
        const cloudRecord = await this.cloudAdapter.create(collection, record);
        if (cloudRecord && this.localAdapter) {
          const id = cloudRecord.id || record.id;
          this.localAdapter.update(collection, id, cloudRecord);
        }
        return cloudRecord || record;
      } catch (e) {
        console.warn(`[DataGateway] Cloud create failed for "${collection}", queuing offline job:`, e.message);
        if (this.offlineJournal) {
          this.offlineJournal.recordMutation({
            tenantId: record.tenantId || 'GLOBAL',
            jobType: 'CREATE',
            entityName: collection,
            payload: record,
            actor: 'System'
          });
        }
      }
    }
    return record;
  }

  async update(collection, id, patch) {
    if (this.localAdapter) {
      this.localAdapter.update(collection, id, patch);
    }
    if (this.isOnline && this.cloudAdapter && collection !== 'roles') {
      try {
        const cloudRecord = await this.cloudAdapter.update(collection, id, patch);
        return cloudRecord || patch;
      } catch (e) {
        console.warn(`[DataGateway] Cloud update failed for "${collection}:${id}", queuing offline job:`, e.message);
        if (this.offlineJournal) {
          this.offlineJournal.recordMutation({
            tenantId: patch.tenantId || 'GLOBAL',
            jobType: 'UPDATE',
            entityName: collection,
            payload: { id, patch },
            actor: 'System'
          });
        }
      }
    }
    return patch;
  }

  async delete(collection, id) {
    if (this.localAdapter) {
      this.localAdapter.delete(collection, id);
    }
    if (this.isOnline && this.cloudAdapter && collection !== 'roles') {
      try {
        await this.cloudAdapter.delete(collection, id);
      } catch (e) {
        console.warn(`[DataGateway] Cloud delete failed for "${collection}:${id}", queuing offline job:`, e.message);
        if (this.offlineJournal) {
          this.offlineJournal.recordMutation({
            tenantId: 'GLOBAL',
            jobType: 'DELETE',
            entityName: collection,
            payload: { id },
            actor: 'System'
          });
        }
      }
    }
    return true;
  }

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

  notifySubscribers(collection, operation, record) {
    if (this.listeners.has(collection)) {
      this.listeners.get(collection).forEach(cb => {
        try {
          cb({ collection, operation, record });
        } catch (e) {
          console.error(`[DataGateway] Error in subscriber for "${collection}":`, e);
        }
      });
    }

    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(cb => {
        try {
          cb({ collection, operation, record });
        } catch (e) {
          console.error(`[DataGateway] Error in wildcard subscriber:`, e);
        }
      });
    }
  }

  getPendingJobs() {
    if (this.offlineJournal && typeof this.offlineJournal.getPendingJobs === 'function') {
      return this.offlineJournal.getPendingJobs();
    }
    return [];
  }
}
