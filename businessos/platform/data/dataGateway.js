import { SupabaseDataAdapter } from './adapters/supabaseDataAdapter.js';
import { OfflineDataAdapter } from './adapters/offlineDataAdapter.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { connectivityManager } from '../connectivity/connectivityManager.js';
import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';
import { reportNonFatal } from '../observability/errorReporter.js';

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

    // Stage 2B: flush concurrency guard + periodic retry timer. Reconnect alone
    // is not enough (a job that fails once in ERROR was previously never retried);
    // a slow periodic sweep re-drives QUEUED/PENDING/ERROR with backoff.
    this._flushInFlight = false;
    this._flushTimer = null;
    this.MAX_JOB_ATTEMPTS = 8;
    this.FLUSH_INTERVAL_MS = 30000;

    if (config.realtime && typeof config.realtime.subscribe === 'function') {
      config.realtime.subscribe('*', (event) => this.handleRealtimeEvent(event));
    }
    this.enablePeriodicSync();

    // Stage 2C: follow the connectivity manager's reachability probe. The probe
    // is authoritative, so update this.isOnline DIRECTLY (never re-enter
    // setOnlineState -> connectivityManager, which would loop). Flush on the
    // OFFLINE->ONLINE transition so a recovered link drains the journal at once.
    if (platformEventBus && typeof platformEventBus.subscribe === 'function') {
      this._wasOnlineBeforeProbe = this.isOnline;
      platformEventBus.subscribe(PlatformEventTypes.CONNECTIVITY_CHANGED, (diag) => {
        const nowOnline = !!(diag && diag.networkState === 'ONLINE');
        const cameBack = nowOnline && !this._wasOnlineBeforeProbe;
        this.isOnline = nowOnline;
        this._wasOnlineBeforeProbe = nowOnline;
        if (cameBack) this.flushOfflineQueue().catch(() => {});
      });
    }
  }

  /**
   * Stage 2B: start the periodic offline-queue sweep. Browser-only and idempotent.
   * @param {number} intervalMs
   */
  enablePeriodicSync(intervalMs = this.FLUSH_INTERVAL_MS) {
    if (typeof window === 'undefined' || typeof setInterval !== 'function') return;
    if (this._flushTimer) return;
    this._flushTimer = setInterval(() => {
      if (this.isOnline && this.cloudAdapter) {
        this.flushOfflineQueue().catch(() => {});
      }
    }, intervalMs);
  }

  stopPeriodicSync() {
    if (this._flushTimer && typeof clearInterval === 'function') {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
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
        jobId: 'job-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9)),
        jobType,
        tenantId: tId,
        entityName: collection,
        payload,
        syncState: 'QUEUED',
        attempts: 0,
        timestamp: new Date().toISOString()
      };
      // Stage 2B: append (push) rather than unshift so array order matches creation
      // order; flush additionally sorts by timestamp and operation rank.
      list.push(job);
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
    // Concurrency guard: the periodic timer and reconnect/hydrate can overlap.
    if (this._flushInFlight) return { flushed: 0, failed: 0, skipped: 'IN_FLIGHT' };
    this._flushInFlight = true;

    // Field accessors tolerate both camelCase and snake_case journal shapes.
    const _state = j => j.syncState || j.sync_state || 'QUEUED';
    const _type = j => j.jobType || j.job_type || 'CREATE';
    const _ent = j => j.entityName || j.entity_name;
    const _pay = j => j.payload || {};
    const _ts = j => j.timestamp || j.created_at || j.createdAt || null;
    const _corr = j => j.correlationId || j.correlation_id || null;
    const _rowId = j => { const p = _pay(j); return p.id || (p.patch && p.patch.id) || p.jobId || p.job_id || null; };

    try {
      const journal = offlineStore.getCollection('offline_journal') || [];
      // Stage 2B: retry QUEUED, PENDING *and* ERROR (ERROR was previously dropped).
      const nowMs = Date.now();
      const pendingJobs = journal.filter(j => {
        const s = _state(j);
        if (s !== 'QUEUED' && s !== 'PENDING' && s !== 'ERROR') return false;
        // Exponential-backoff gate: honor nextRetryAt scheduled by a prior failure.
        if (j.nextRetryAt) {
          const nr = new Date(j.nextRetryAt).getTime();
          if (nr && nr > nowMs) return false;
        }
        return true;
      });

      if (pendingJobs.length === 0) {
        if (connectivityManager && typeof connectivityManager.setPendingSyncCount === 'function') {
          connectivityManager.setPendingSyncCount(journal.filter(j => ['QUEUED','PENDING','ERROR'].includes(_state(j))).length);
        }
        return { flushed: 0, failed: 0 };
      }

      // Order: timestamp ascending, then CREATE < UPDATE < DELETE per row so a
      // create always lands before its own update/delete.
      const rank = t => (t === 'CREATE' ? 0 : (t === 'UPDATE' ? 1 : 2));
      pendingJobs.sort((a, b) => {
        const ta = _ts(a) ? new Date(_ts(a)).getTime() : 0;
        const tb = _ts(b) ? new Date(_ts(b)).getTime() : 0;
        if (ta !== tb) return ta - tb;
        if (_ent(a) !== _ent(b)) return String(_ent(a)).localeCompare(String(_ent(b)));
        const ra = rank(_type(a)), rb = rank(_type(b));
        if (ra !== rb) return ra - rb;
        return String(_rowId(a)).localeCompare(String(_rowId(b)));
      });

      console.log(`[DataGateway] Flushing ${pendingJobs.length} queued/pending/error offline mutations to Supabase...`);
      let flushed = 0;
      let failed = 0;
      // Idempotency: one successful send per correlation id per cycle.
      const sentCorrelations = new Set();

      for (const job of pendingJobs) {
        const cid = _corr(job);
        if (cid && sentCorrelations.has(cid)) {
          job.syncState = 'SYNCED';
          job.syncedAt = new Date().toISOString();
          continue;
        }
        try {
          await this._flushJobWithRetry(job);
          job.syncState = 'SYNCED';
          job.syncedAt = new Date().toISOString();
          job.lastError = null;
          job.nextRetryAt = null;
          flushed++;
          if (cid) sentCorrelations.add(cid);
        } catch (err) {
          failed++;
          if (err && err.conflict) {
            // Stage 3: stale local write vs newer cloud row. Server-wins; flag for
            // manager exception. No backoff retry (retrying cannot fix a conflict).
            job.syncState = 'CONFLICT';
            job.lastError = 'VERSION_CONFLICT';
            job.nextRetryAt = null;
            if (platformEventBus && typeof platformEventBus.publish === 'function') {
              platformEventBus.publish('sync:conflict', {
                jobId: job.jobId,
                entityName: _ent(job),
                recordId: _rowId(job),
                tenantId: job.tenantId || job.tenant_id || null,
                cloudRecord: err.cloudRecord || null,
                resolution: 'SERVER_WINS'
              });
            }
            console.warn(`[DataGateway] VERSION_CONFLICT on job ${job.jobId} for ${_ent(job)}:${_rowId(job)}; server copy retained.`);
            continue;
          }
          job.attempts = (parseInt(job.attempts, 10) || 0) + 1;
          job.lastError = err && err.message ? err.message : String(err);
          // Persist cross-cycle exponential backoff (cap 5 min).
          const backoff = Math.min(300000, 1000 * Math.pow(2, job.attempts));
          job.nextRetryAt = new Date(Date.now() + backoff).toISOString();
          // On exhaustion escalate UPDATE failures to CONFLICT (surfaced, not dropped).
          job.syncState = (job.attempts >= this.MAX_JOB_ATTEMPTS && _type(job) === 'UPDATE')
            ? 'CONFLICT'
            : 'ERROR';
          console.warn(`[DataGateway] Offline job ${job.jobId} (${_type(job)} ${_ent(job)}) attempt ${job.attempts} failed; will retry. ${job.lastError}`);
          // Stage 4: surface the escalation to observability once attempts are
          // exhausted (still queued/retrying otherwise stays console-only).
          if (job.attempts >= this.MAX_JOB_ATTEMPTS) {
            reportNonFatal(new Error(`Offline job ${job.syncState}: ${job.lastError}`), {
              scope: 'dataGateway.flushOfflineQueue',
              jobId: job.jobId,
              entityName: _ent(job),
              recordId: _rowId(job),
              attempts: job.attempts,
              fingerprint: `sync-${job.syncState}`
            });
          }
        }
      }

      offlineStore.setCollection('offline_journal', journal);

      const remaining = journal.filter(j => ['QUEUED', 'PENDING', 'ERROR', 'CONFLICT'].includes(_state(j))).length;
      if (connectivityManager && typeof connectivityManager.setPendingSyncCount === 'function') {
        connectivityManager.setPendingSyncCount(remaining);
      }
      if (failed > 0 && connectivityManager && typeof connectivityManager.notifySyncError === 'function') {
        connectivityManager.notifySyncError(`Failed to flush ${failed} offline operations (retrying with backoff).`);
      }

      return { flushed, failed };
    } finally {
      this._flushInFlight = false;
    }
  }

  /**
   * Execute a single journal job with in-cycle exponential-backoff retries for
   * transient failures. Auth is carried automatically because the cloud adapter
   * builds headers from runtimeConfig.getAuthHeaders (session JWT when logged in).
   * @param {Object} job
   * @param {number} maxInCycle attempts within this flush cycle (default 3)
   */
  async _flushJobWithRetry(job, maxInCycle = 3) {
    const _type = job.jobType || job.job_type || 'CREATE';
    const _ent = job.entityName || job.entity_name;
    const payload = job.payload || {};
    let lastErr = null;

    // Stage 3 (version conflict): before replaying an UPDATE, compare the local
    // base version against the current cloud version. If the cloud row is newer,
    // another device already advanced it -> this write is stale. Server-wins: mark
    // CONFLICT (surfaced for a manager exception) instead of overwriting. Reuses
    // the same version semantics as the handleRealtimeEvent out-of-order guard.
    if (_type === 'UPDATE' && this.cloudAdapter && typeof this.cloudAdapter.getById === 'function') {
      const id = payload.id || (payload.patch && payload.patch.id);
      const patch = payload.patch || payload;
      const localVersion = this._extractVersion(patch);
      if (id && localVersion !== null) {
        try {
          const cloud = await this.cloudAdapter.getById(_ent, id, job.tenantId || job.tenant_id || null);
          const cloudVersion = this._extractVersion(cloud);
          if (cloudVersion !== null && cloudVersion > localVersion) {
            const conflict = new Error('VERSION_CONFLICT');
            conflict.conflict = true;
            conflict.cloudRecord = cloud;
            throw conflict;
          }
        } catch (err) {
          if (err && err.conflict) throw err;
          // getById failure is non-fatal here; fall through to the write attempt.
        }
      }
    }

    for (let attempt = 1; attempt <= maxInCycle; attempt++) {
      try {
        if (_type === 'CREATE') {
          await this.cloudAdapter.create(_ent, payload);
        } else if (_type === 'UPDATE') {
          const id = payload.id || (payload.patch && payload.patch.id);
          const patch = payload.patch || payload;
          await this.cloudAdapter.update(_ent, id, patch);
        } else if (_type === 'DELETE') {
          await this.cloudAdapter.delete(_ent, payload.id);
        } else {
          // Unknown job type: treat as create-shaped passthrough.
          await this.cloudAdapter.create(_ent, payload);
        }
        return;
      } catch (err) {
        lastErr = err;
        // Non-transient (4xx validation / RLS rejection): stop retrying immediately.
        const status = err && (err.status || err.statusCode);
        if (status && status >= 400 && status < 500 && status !== 429) break;
        if (attempt < maxInCycle) {
          const delay = Math.min(5000, 200 * Math.pow(2, attempt));
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastErr || new Error('FLUSH_JOB_FAILED');
  }

  /**
   * Extract a numeric version from a record for conflict comparison. Mirrors the
   * field precedence already used by the handleRealtimeEvent out-of-order guard.
   * @param {Object} record
   * @returns {number|null}
   */
  _extractVersion(record) {
    if (!record || typeof record !== 'object') return null;
    const raw = record.version !== undefined ? record.version
      : (record.data && record.data.version !== undefined ? record.data.version : null);
    if (raw === null || raw === undefined || raw === '') return null;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
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

  /**
   * Stage 3 (safe hydrate): ids in `collection` that still have an unflushed
   * offline_journal job. Reads/refreshes must not overwrite these local edits.
   * @param {string} collection
   * @returns {Set<string>}
   */
  _pendingProtectedIds(collection) {
    const ids = new Set();
    const journal = offlineStore.getCollection('offline_journal') || [];
    const _state = j => j.syncState || j.sync_state || 'QUEUED';
    const _ent = j => j.entityName || j.entity_name;
    journal.forEach(j => {
      if (_ent(j) !== collection) return;
      if (!['QUEUED', 'PENDING', 'ERROR', 'CONFLICT'].includes(_state(j))) return;
      const p = j.payload || {};
      const id = p.id || (p.patch && p.patch.id) || p.sessionId || p.session_id || p.revisionId || p.paymentId || p.invoiceNumber;
      if (id) ids.add(id);
    });
    return ids;
  }

  /**
   * Merge a freshly-fetched cloud list with the local cache, but let any local
   * row whose id has a pending/failed journal job win over its cloud counterpart.
   * @param {string} collection
   * @param {Array} cloudData
   * @param {string|null} tenantId
   * @returns {Array}
   */
  _mergePreservingPending(collection, cloudData, tenantId = null) {
    if (!Array.isArray(cloudData)) return cloudData;
    const protectedIds = this._pendingProtectedIds(collection);
    if (protectedIds.size === 0) return cloudData;

    const localList = this.getCachedCollection(collection, tenantId) || [];
    const _rid = r => r && (r.id || r.sessionId || r.session_id || r.revisionId || r.paymentId || r.invoiceNumber);
    const protectedLocals = localList.filter(r => protectedIds.has(_rid(r)));
    if (protectedLocals.length === 0) return cloudData;

    const merged = cloudData.slice();
    protectedLocals.forEach(pr => {
      const rid = _rid(pr);
      const idx = merged.findIndex(c => _rid(c) === rid);
      if (idx >= 0) merged[idx] = { ...merged[idx], ...pr };
      else merged.unshift(pr);
    });
    return merged;
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

  /**
   * Stage 2C NON-BREAKING read safety net. The reachability probe drives
   * this.isOnline for the badge and for WRITE queueing, but a READ must never be
   * hidden behind a probe false-negative (that blanked every workspace once RLS
   * deferred hydration was added). So we optimistically attempt the cloud read
   * whenever the browser reports an interface, falling back to the local cache
   * only when the read itself fails. Genuine offline (navigator.onLine===false)
   * is still honored via this.isOnline.
   * @returns {boolean}
   */
  _shouldAttemptCloudRead() {
    if (this.isOnline) return true;
    return (typeof navigator !== 'undefined' && navigator.onLine === true);
  }

  async getCollection(collection, tenantId = null) {
    if (this._shouldAttemptCloudRead() && this.cloudAdapter && collection !== 'roles') {
      try {
        const res = await this.cloudAdapter.getCollection(collection, tenantId);
        const isSuccess = (res && typeof res === 'object' && res.success === true) || Array.isArray(res);
        const cloudData = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : null);

        if (isSuccess && cloudData !== null) {
          // Stage 3 (safe hydrate): do not clobber local rows that still have an
          // unflushed (QUEUED/PENDING/ERROR/CONFLICT) journal job. Those edits are
          // authoritative-until-synced, so the local copy wins over cloud for the
          // same entity+id, preventing silent loss of pending changes on refresh.
          const mergedData = this._mergePreservingPending(collection, cloudData, tenantId);
          if (this.localAdapter && typeof this.localAdapter.setCollection === 'function') {
            this.localAdapter.setCollection(collection, mergedData);
          }
          if (connectivityManager && typeof connectivityManager.notifySyncComplete === 'function') {
            connectivityManager.notifySyncComplete({
              success: true,
              timestamp: new Date().toISOString()
            });
          }
          console.log(`[DataGateway] collection=${collection} tenant=${tenantId || 'GLOBAL'} mode=ONLINE adapter=SUPABASE rows=${mergedData.length} cacheUsed=false`);
          return mergedData;
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
