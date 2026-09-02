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
    this.processedOperations = new Set();

    if (config.realtime && typeof config.realtime.subscribe === 'function') {
      config.realtime.subscribe('*', (event) => this.handleRealtimeEvent(event));
    }
  }

  setOnlineState(online) {
    this.isOnline = !!online;
  }

  isOperationProcessed(operationId) {
    if (!operationId) return false;
    return this.processedOperations.has(operationId);
  }

  markOperationProcessed(operationId) {
    if (!operationId) return;
    this.processedOperations.add(operationId);
  }

  handleRealtimeEvent(event) {
    if (!event || !event.collection || !event.record) return;
    const { collection, operation, record } = event;

    if (this.localAdapter) {
      const id = record.id || record.sessionId || record.revisionId || record.paymentId || record.invoiceNumber || record.uuid || record.itemCode || record.code || record.categoryCode || record.supplierCode || record.uomCode || record.locationCode || record.poNumber || record.grnNumber || record.transferNo || record.issueNo || record.adjustmentNo || record.countNo || record.tableCode || record.employeeCode || record.tenantId;
      if (operation === 'INSERT' || operation === 'UPDATE') {
        const existing = this.localAdapter.getById(collection, id);
        if (existing) {
          // Version & Timestamp Out-of-Order Guard
          const recordVersion = parseInt(record.version || record.revisionNumber || record.revision_number) || 0;
          const existingVersion = parseInt(existing.version || existing.revisionNumber || existing.revision_number) || 0;
          const recordTime = new Date(record.updatedAt || record.updated_at || record.createdAt || 0).getTime();
          const existingTime = new Date(existing.updatedAt || existing.updated_at || existing.createdAt || 0).getTime();

          if (recordVersion > 0 && existingVersion > 0 && recordVersion < existingVersion) {
            return; // Ignore older version
          }
          if (recordTime > 0 && existingTime > 0 && recordTime < existingTime) {
            return; // Ignore older timestamp
          }

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
    return list.find(item => item.id === id || item.sessionId === id || item.revisionId === id || item.paymentId === id || item.invoiceNumber === id || item.uuid === id || item.itemCode === id || item.code === id || item.categoryCode === id || item.supplierCode === id || item.uomCode === id || item.locationCode === id || item.poNumber === id || item.grnNumber === id || item.transferNo === id || item.issueNo === id || item.adjustmentNo === id || item.countNo === id || item.tableCode === id || item.employeeCode === id || item.tenantId === id) || null;
  }

  async hydrateCollections(collections = ['tenants', 'identities', 'employees', 'table_sessions', 'orders', 'bill_revisions', 'invoices', 'payments', 'session_audit_logs', 'offline_journal'], tenantId = null) {
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

  async setCollection(collection, data = []) {
    if (this.localAdapter && typeof this.localAdapter.setCollection === 'function') {
      this.localAdapter.setCollection(collection, data);
    }
    if (this.isOnline && this.cloudAdapter && collection !== 'roles') {
      try {
        if (typeof this.cloudAdapter.setCollection === 'function') {
          await this.cloudAdapter.setCollection(collection, data);
        } else if (Array.isArray(data)) {
          for (const item of data) {
            await this.cloudAdapter.create(collection, item);
          }
        }
      } catch (e) {
        console.warn(`[DataGateway] Cloud setCollection sync warning for "${collection}":`, e.message);
      }
    }
    return data;
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
