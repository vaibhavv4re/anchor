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

    this._initNetworkListeners();
  }

  _initNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      console.log('🌐 [ConnectivityManager] Network ONLINE detected by browser.');
      this.notifyOnline();
    });

    window.addEventListener('offline', () => {
      console.log('📡 [ConnectivityManager] Network OFFLINE detected by browser.');
      this.notifyOffline();
    });
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
    const pendingCount = pendingJournal.filter(j => j.sync_state === 'PENDING' || j.syncState === 'PENDING').length || this.pendingSyncCount;

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
