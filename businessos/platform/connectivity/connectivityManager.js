/**
 * BusinessOS Platform - Unified Connectivity & Sync Manager (Contract v1.0)
 *
 * Single-source-of-truth connectivity engine for RestaurantOS.
 * Manages distinct Network State, Sync State, and Data Source dimensions:
 *
 * NETWORK STATE: ONLINE | OFFLINE
 * SYNC STATE: IDLE | SYNCING | SYNC_ATTENTION
 * DATA SOURCE: SUPABASE | LOCAL_CACHE
 */

import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { runtimeConfig } from '../cloud/runtimeConfig.js';

export const NetworkStates = Object.freeze({
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE'
});

export const SyncStates = Object.freeze({
  IDLE: 'IDLE',
  SYNCING: 'SYNCING',
  SYNC_ATTENTION: 'SYNC_ATTENTION'
});

export const DataSources = Object.freeze({
  SUPABASE: 'SUPABASE',
  LOCAL_CACHE: 'LOCAL_CACHE'
});

// Backward compatibility aliases
export const ConnectivityStates = Object.freeze({
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  SYNCING: 'SYNCING',
  SYNC_ATTENTION: 'SYNC_ATTENTION'
});

export class ConnectivityManager {
  constructor(config = {}) {
    this.eventBus = config.eventBus || platformEventBus;
    const initialOnline = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') ? navigator.onLine : true;

    this.networkState = initialOnline ? NetworkStates.ONLINE : NetworkStates.OFFLINE;
    this.syncState = SyncStates.IDLE;
    this.dataSource = initialOnline ? DataSources.SUPABASE : DataSources.LOCAL_CACHE;

    this.lastCloudSyncTimestamp = null;
    this.pendingSyncCount = 0;
    this.subscribers = new Set();

    // Stage 2C: navigator.onLine is only a hint (true whenever the NIC is up,
    // even if Supabase is unreachable). A real reachability probe drives the
    // effective online state so the gateway stops serving stale cache in the
    // "online-but-broken" window.
    this._reachable = initialOnline;
    this._probeTimer = null;
    this._probeUrl = null;
    this.PROBE_INTERVAL_MS = 15000;
    this.PROBE_TIMEOUT_MS = 6000;
    // Stage 2C NON-BREAKING GATE: a single probe miss (fast CORS/timeout blip)
    // must NEVER blank the app, so OFFLINE is only declared after this many
    // *consecutive* misses while the OS still reports an interface. A lone
    // success resets the counter and restores ONLINE immediately.
    this._probeFailures = 0;
    this.PROBE_OFFLINE_THRESHOLD = 3;

    this._initNetworkListeners();
    this._startReachabilityProbe();
  }

  _initNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      console.log('🌐 [ConnectivityManager] Network ONLINE hint; probing reachability.');
      // Do not jump straight to ONLINE - confirm with a probe first.
      this._runProbe();
    });

    window.addEventListener('offline', () => {
      console.log('📡 [ConnectivityManager] Network OFFLINE hint.');
      // OS says no interface: trust it immediately (fast offline).
      this._reachable = false;
      this.notifyOffline();
    });
  }

  /**
   * Stage 2C: begin the periodic reachability probe (browser-only, idempotent).
   * @param {number} intervalMs
   */
  _startReachabilityProbe(intervalMs = this.PROBE_INTERVAL_MS) {
    if (typeof window === 'undefined' || typeof setInterval !== 'function') return;
    if (this._probeTimer) return;
    // Fire one probe shortly after boot, then on a fixed cadence.
    this._runProbe();
    this._probeTimer = setInterval(() => this._runProbe(), intervalMs);
  }

  stopReachabilityProbe() {
    if (this._probeTimer && typeof clearInterval === 'function') {
      clearInterval(this._probeTimer);
      this._probeTimer = null;
    }
  }

  /**
   * Perform one lightweight reachability probe. Any HTTP response (even 401/404)
   * proves the server is reachable; only a thrown network error / timeout counts
   * as a miss. We probe the SAME REST path shape the app's reads already use
   * (a tiny `identities` select), so the probe can never report itself "more
   * broken" than a real data read - a false-negative here previously blanked the
   * whole app. navigator.onLine===false is still trusted instantly as a fast
   * offline path.
   */
  async _runProbe() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this._probeFailures = 0;
      this._applyProbeResult(false);
      return;
    }
    try {
      const rest = runtimeConfig.getRestUrl().replace(/\/+$/, '');
      const url = `${rest}/identities?select=id&limit=1`;
      const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), this.PROBE_TIMEOUT_MS) : null;
      const resp = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: runtimeConfig.getAuthHeaders({ Accept: 'application/json' }),
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      // Received an HTTP response => reachable.
      this._probeFailures = 0;
      this._applyProbeResult(true, resp && resp.status);
    } catch (_) {
      // OS still reports an interface: do not blank the app on a transient miss.
      // Only degrade to OFFLINE after sustained consecutive misses.
      this._probeFailures = (this._probeFailures || 0) + 1;
      if (this._probeFailures >= this.PROBE_OFFLINE_THRESHOLD) {
        this._applyProbeResult(false);
      } else {
        console.warn(`[ConnectivityManager] Probe miss ${this._probeFailures}/${this.PROBE_OFFLINE_THRESHOLD}; staying ${this.networkState}.`);
      }
    }
  }

  /**
   * Apply the probe verdict, only notifying on a state transition to avoid
   * redundant listeners/flushes.
   * @param {boolean} reachable
   */
  _applyProbeResult(reachable, status = null) {
    this._reachable = reachable;
    if (reachable && this.networkState !== NetworkStates.ONLINE) {
      console.log('✅ [ConnectivityManager] Reachability restored.');
      this.notifyOnline();
    } else if (!reachable && this.networkState !== NetworkStates.OFFLINE) {
      console.warn(`⚠️ [ConnectivityManager] Supabase unreachable${status ? ' (status ' + status + ')' : ''}; switching to OFFLINE.`);
      this.notifyOffline();
    } else {
      // No transition: keep listeners informed of the current diagnostics.
      this._notifyListeners();
    }
  }

  get isOnline() {
    return this.networkState === NetworkStates.ONLINE;
  }

  getState() {
    return {
      networkState: this.networkState,
      syncState: this.syncState,
      dataSource: this.dataSource
    };
  }

  getDiagnostics() {
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || 'tenant_h0qc7wf';
    const pendingJournal = offlineStore.getCollection('offline_journal') || [];
    // Authoritative retryable count: QUEUED (awaiting first send), PENDING
    // (mid-flight) and ERROR (backed-off, will retry) are all "pending" to the
    // operator. Counting only PENDING under-reported the backlog, so a stuck
    // write looked "Online" with nothing queued - exactly the silent failure we
    // must avoid. Mirrors DataGateway.getSyncStatus().pending.
    const isRetryable = j => {
      const s = j.syncState || j.sync_state || 'QUEUED';
      return s === 'QUEUED' || s === 'PENDING' || s === 'ERROR';
    };
    const pendingCount = pendingJournal.filter(isRetryable).length || this.pendingSyncCount;

    return {
      networkState: this.networkState,
      syncState: this.syncState,
      dataSource: this.dataSource,
      isOnline: this.isOnline,
      lastCloudSyncTimestamp: this.lastCloudSyncTimestamp,
      pendingSyncCount: pendingCount,
      tenantId,
      updatedAt: new Date().toISOString()
    };
  }

  notifyOffline() {
    this.networkState = NetworkStates.OFFLINE;
    this.syncState = SyncStates.IDLE;
    this.dataSource = DataSources.LOCAL_CACHE;
    this._notifyListeners();
  }

  notifyOnline() {
    const wasOffline = this.networkState === NetworkStates.OFFLINE;
    this.networkState = NetworkStates.ONLINE;
    this.dataSource = DataSources.SUPABASE;
    if (wasOffline) {
      this.syncState = SyncStates.SYNCING;
    }
    this._notifyListeners();
  }

  setOnlineState(isOnline) {
    if (isOnline) this.notifyOnline();
    else this.notifyOffline();
  }

  notifySyncStart() {
    if (this.networkState === NetworkStates.ONLINE) {
      this.syncState = SyncStates.SYNCING;
      this._notifyListeners(PlatformEventTypes.SYNC_STATUS_CHANGED);
    }
  }

  notifySyncComplete(opts = {}) {
    const { success = true, timestamp = null, pendingCount = 0 } = opts;

    if (this.networkState === NetworkStates.OFFLINE) {
      this.syncState = SyncStates.IDLE;
      this.dataSource = DataSources.LOCAL_CACHE;
    } else if (success) {
      this.syncState = SyncStates.IDLE;
      this.dataSource = DataSources.SUPABASE;
      if (timestamp) {
        this.lastCloudSyncTimestamp = timestamp;
      }
    } else {
      this.syncState = SyncStates.SYNC_ATTENTION;
      this.dataSource = DataSources.SUPABASE;
    }

    this.pendingSyncCount = pendingCount;
    this._notifyListeners();
  }

  notifySyncError(err = null) {
    this.syncState = SyncStates.SYNC_ATTENTION;
    this._notifyListeners(PlatformEventTypes.SYNC_STATUS_CHANGED);
  }

  setPendingSyncCount(count) {
    this.pendingSyncCount = Math.max(0, count);
    this._notifyListeners();
  }

  subscribe(listener) {
    if (typeof listener === 'function') {
      this.subscribers.add(listener);
      listener(this.getDiagnostics());
    }
    return () => {
      this.subscribers.delete(listener);
    };
  }

  _notifyListeners(specificEventType = null) {
    const diagnostics = this.getDiagnostics();
    for (const listener of this.subscribers) {
      try {
        listener(diagnostics);
      } catch (err) {
        console.error('[ConnectivityManager] Error in listener:', err);
      }
    }

    if (this.eventBus && typeof this.eventBus.publish === 'function') {
      const eventType = specificEventType || PlatformEventTypes.CONNECTIVITY_CHANGED;
      this.eventBus.publish(eventType, diagnostics);
    }
  }
}

export const connectivityManager = new ConnectivityManager();
