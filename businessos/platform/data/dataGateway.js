import { SupabaseDataAdapter } from './adapters/supabaseDataAdapter.js';
import { OfflineDataAdapter } from './adapters/offlineDataAdapter.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { connectivityManager } from '../connectivity/connectivityManager.js';
import { platformEventBus } from '../events/platformEvents.js';

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

  async setOnlineState(online) {
    const wasOffline = !this.isOnline;
    this.isOnline = !!online;
    if (connectivityManager && typeof connectivityManager.setOnlineState === 'function') {
      connectivityManager.setOnlineState(this.isOnline);
    }
    if (this.isOnline && wasOffline) {
      await this.flushOfflineQueue();
    }
  }

  _recordOfflineMutation(jobType, collection, payload, tenantId = 'tenant_h0qc7wf') {
    const tId = tenantId || (payload && payload.tenantId) || 'tenant_h0qc7wf';
    let job = null;

    if (this.offlineJournal && typeof this.offlineJournal.createSyncJob === 'function') {
      job = this.offlineJournal.createSyncJob(jobType, tId, collection, payload, null);
    } else {
      const list = offlineStore.getCollection('offline_journal') || [];
      job = {
        jobId: 'job-' + Math.random().toString(36).substring(2, 9),
        jobType,
        tenantId: tId,
        entityName: collection,
        payload,
        syncState: 'QUEUED',
        timestamp: new Date().toISOString()
      };
      list.unshift(job);
      offlineStore.setCollection('offline_journal', list);
    }

    const pendingJobs = (offlineStore.getCollection('offline_journal') || [])
      .filter(j => j.syncState === 'QUEUED' || j.syncState === 'PENDING' || j.sync_state === 'PENDING');

    if (connectivityManager && typeof connectivityManager.setPendingSyncCount === 'function') {
      connectivityManager.setPendingSyncCount(pendingJobs.length);
    }

    return job;
  }

  async flushOfflineQueue() {
    if (!this.isOnline || !this.cloudAdapter) return { flushed: 0, failed: 0 };

    const journal = offlineStore.getCollection('offline_journal') || [];
    const pendingJobs = journal.filter(j => j.syncState === 'QUEUED' || j.syncState === 'PENDING' || j.sync_state === 'PENDING');

    if (pendingJobs.length === 0) {
      if (connectivityManager && typeof connectivityManager.setPendingSyncCount === 'function') {
        connectivityManager.setPendingSyncCount(0);
      }
      return { flushed: 0, failed: 0 };
    }

    console.log(`[DataGateway] Flushing ${pendingJobs.length} queued offline mutations to Supabase...`);
    let flushed = 0;
    let failed = 0;

    for (const job of pendingJobs) {
      try {
        const { jobType, entityName, payload } = job;
        if (jobType === 'CREATE') {
          await this.cloudAdapter.create(entityName, payload);
        } else if (jobType === 'UPDATE') {
          const id = payload.id || (payload.patch && payload.patch.id);
          const patch = payload.patch || payload;
          await this.cloudAdapter.update(entityName, id, patch);
        } else if (jobType === 'DELETE') {
          const id = payload.id;
          await this.cloudAdapter.delete(entityName, id);
        }
        job.syncState = 'SYNCED';
        job.syncedAt = new Date().toISOString();
        flushed++;
      } catch (err) {
        console.warn(`[DataGateway] Failed to flush offline job ${job.jobId} for ${job.entityName}:`, err.message);
        job.syncState = 'ERROR';
        job.lastError = err.message;
        failed++;
      }
    }

    offlineStore.setCollection('offline_journal', journal);

    const remainingPending = journal.filter(j => j.syncState === 'QUEUED' || j.syncState === 'PENDING' || j.sync_state === 'PENDING').length;
    if (connectivityManager) {
      connectivityManager.setPendingSyncCount(remainingPending);
      if (failed > 0) {
        connectivityManager.notifySyncError(`Failed to flush ${failed} offline operations.`);
      }
    }

    return { flushed, failed };
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

  /**
   * Authoritative projection boundary for stock_balances.
   * Directly synchronizes localAdapter cache and broadcasts a single update notification.
   */
  applyAuthoritativeStockBalance(tenantId, itemCode, locationCode, newBalance, extra = {}) {
    const qty = parseFloat(newBalance);
    const list = this.getCachedCollection('stock_balances', tenantId) || [];
    let updatedRecord = null;

    const idx = list.findIndex(b => {
      const tenantMatch = !tenantId || b.tenantId === tenantId || b.tenant_id === tenantId;
      const iMatch = (b.itemCode || b.item_code) === itemCode;
      const lMatch = (b.locationCode || b.location_code) === locationCode;
      return tenantMatch && iMatch && lMatch;
    });

    const now = new Date().toISOString();
    if (idx !== -1) {
      const cur = list[idx];
      const unitCost = parseFloat(cur.unitCost !== undefined ? cur.unitCost : (cur.unit_cost || 0));
      const valuation = parseFloat((qty * unitCost).toFixed(2));
      updatedRecord = {
        ...cur,
        quantity: qty,
        currentStock: qty,
        valuation,
        updatedAt: now,
        updated_at: now,
        data: {
          ...(cur.data || {}),
          quantity: qty,
          valuation,
          lastUpdatedAt: now
        },
        ...extra
      };
      list[idx] = updatedRecord;
    } else {
      updatedRecord = {
        id: `sb-${Date.now()}-${itemCode}`,
        tenantId,
        tenant_id: tenantId,
        itemCode,
        item_code: itemCode,
        locationCode,
        location_code: locationCode,
        quantity: qty,
        currentStock: qty,
        unitCost: extra.unitCost || 0,
        unit_cost: extra.unitCost || 0,
        valuation: 0,
        updatedAt: now,
        updated_at: now,
        data: {
          itemCode,
          locationCode,
          quantity: qty,
          tenantId
        },
        ...extra
      };
      list.push(updatedRecord);
    }

    if (this.localAdapter && typeof this.localAdapter.setCollection === 'function') {
      this.localAdapter.setCollection('stock_balances', list);
    }
    offlineStore.setCollection('stock_balances', list);

    // Single notification from DataGateway projection boundary
    this.notifySubscribers('stock_balances', 'UPDATE', updatedRecord);
    platformEventBus.publish('stock:balance:updated', {
      tenantId,
      itemCode,
      locationCode,
      newBalance: qty,
      record: updatedRecord,
      source: 'data_gateway'
    });

    return updatedRecord;
  }

  getCachedById(collection, id, tenantId = null) {
    const list = this.getCachedCollection(collection, tenantId);
    return list.find(item => item.id === id || item.sessionId === id || item.revisionId === id || item.paymentId === id || item.invoiceNumber === id || item.uuid === id || item.itemCode === id || item.code === id || item.categoryCode === id || item.supplierCode === id || item.uomCode === id || item.locationCode === id || item.poNumber === id || item.grnNumber === id || item.transferNo === id || item.issueNo === id || item.adjustmentNo === id || item.countNo === id || item.tableCode === id || item.employeeCode === id || item.tenantId === id) || null;
  }

  async hydrateCollections(collections = ['tenants', 'identities', 'employees', 'table_sessions', 'orders', 'bill_revisions', 'invoices', 'payments', 'session_audit_logs', 'offline_journal'], tenantId = null) {
    if (connectivityManager && typeof connectivityManager.notifySyncStart === 'function') {
      connectivityManager.notifySyncStart();
    }

    if (this.isOnline) {
      await this.flushOfflineQueue();
    }

    const results = {};
    let hasSuccess = false;
    for (const col of collections) {
      if (col !== 'roles') {
        const data = await this.getCollection(col, tenantId);
        results[col] = data;
        if (Array.isArray(data)) hasSuccess = true;
      }
    }
    if (connectivityManager && typeof connectivityManager.notifySyncComplete === 'function') {
      connectivityManager.notifySyncComplete({
        success: hasSuccess,
        timestamp: hasSuccess ? new Date().toISOString() : null
      });
    }
    return results;
  }

  async getCollection(collection, tenantId = null) {
    if (this.isOnline && this.cloudAdapter && collection !== 'roles') {
      try {
        const res = await this.cloudAdapter.getCollection(collection, tenantId);
        const isSuccess = (res && typeof res === 'object' && res.success === true) || Array.isArray(res);
        const cloudData = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : null);

        if (isSuccess && cloudData !== null) {
          if (this.localAdapter && typeof this.localAdapter.setCollection === 'function') {
            this.localAdapter.setCollection(collection, cloudData);
          }
          if (connectivityManager && typeof connectivityManager.notifySyncComplete === 'function') {
            connectivityManager.notifySyncComplete({
              success: true,
              timestamp: new Date().toISOString()
            });
          }
          console.log(`[DataGateway] collection=${collection} tenant=${tenantId || 'GLOBAL'} mode=ONLINE adapter=SUPABASE rows=${cloudData.length} cacheUsed=false`);
          return cloudData;
        }

        const errMsg = (res && res.error) ? res.error : 'Cloud adapter returned unsuccessful response';
        console.warn(`[DataGateway] collection=${collection} mode=ONLINE supabaseError="${errMsg}" fallback=OFFLINE`);
      } catch (e) {
        console.warn(`[DataGateway] collection=${collection} mode=ONLINE supabaseError="${e.message || e}" fallback=OFFLINE`);
      }
    }
    const cached = this.getCachedCollection(collection, tenantId);
    console.log(`[DataGateway] collection=${collection} tenant=${tenantId || 'GLOBAL'} mode=${this.isOnline ? 'ONLINE_FALLBACK' : 'OFFLINE'} adapter=LOCAL_CACHE rows=${cached.length}`);
    return cached;
  }

  async setCollection(collection, data = []) {
    if (this.localAdapter && typeof this.localAdapter.setCollection === 'function') {
      this.localAdapter.setCollection(collection, data);
      if (collection === 'supplier_catalogue') this.localAdapter.setCollection('supplier_catalog', data);
      if (collection === 'supplier_catalog') this.localAdapter.setCollection('supplier_catalogue', data);
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
        if (record !== undefined) {
          if (this.localAdapter) {
            if (record) {
              const existing = this.localAdapter.getById(collection, id);
              if (existing) this.localAdapter.update(collection, id, record);
              else this.localAdapter.create(collection, record);
            } else {
              this.localAdapter.delete(collection, id);
            }
          }
          console.log(`[DataGateway] collection=${collection}:${id} mode=ONLINE adapter=SUPABASE found=${!!record}`);
          return record;
        }
      } catch (e) {
        console.warn(`[DataGateway] collection=${collection}:${id} mode=ONLINE supabaseError="${e.message || e}" fallback=OFFLINE`);
      }
    }
    const cached = this.getCachedById(collection, id, tenantId);
    console.log(`[DataGateway] collection=${collection}:${id} mode=${this.isOnline ? 'ONLINE_FALLBACK' : 'OFFLINE'} adapter=LOCAL_CACHE found=${!!cached}`);
    return cached;
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
        this._recordOfflineMutation('CREATE', collection, record, record.tenantId);
      }
    } else if (collection !== 'roles') {
      console.log(`[DataGateway] collection=${collection} mode=OFFLINE queuing offline CREATE job`);
      this._recordOfflineMutation('CREATE', collection, record, record.tenantId);
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
        this._recordOfflineMutation('UPDATE', collection, { id, patch }, patch.tenantId);
      }
    } else if (collection !== 'roles') {
      console.log(`[DataGateway] collection=${collection}:${id} mode=OFFLINE queuing offline UPDATE job`);
      this._recordOfflineMutation('UPDATE', collection, { id, patch }, patch.tenantId);
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
        this._recordOfflineMutation('DELETE', collection, { id });
      }
    } else if (collection !== 'roles') {
      console.log(`[DataGateway] collection=${collection}:${id} mode=OFFLINE queuing offline DELETE job`);
      this._recordOfflineMutation('DELETE', collection, { id });
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

  async rpc(fnName, params = {}) {
    if (this.isOnline && this.cloudAdapter && typeof this.cloudAdapter.rpc === 'function') {
      return this.cloudAdapter.rpc(fnName, params);
    }
    return { success: false, error: 'RPC_UNAVAILABLE_OFFLINE' };
  }
}
