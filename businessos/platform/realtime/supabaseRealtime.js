/**
 * SupabaseRealtime Cloud & Multi-Device Transport for RestaurantOS / BusinessOS.
 *
 * Real-Time Architecture (post Phase 4 rewrite):
 * 1. Official supabase-js v2 Realtime channels as PRIMARY delivery (<1s latency).
 *    Authenticated JWT is injected via the accessToken callback in the factory,
 *    so subscribers pass forced tenant RLS without re-subscribe.
 * 2. Cross-Tab & Cross-Window Instant Sync via BroadcastChannel (0ms, same device).
 * 3. REST delta-polling as FALLBACK insurance (10s interval) — only activated
 *    when the realtime channel has not reached 'joined' state within 5s.
 * 4. Automatic ingestion into DataGateway & PlatformEventBus.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { runtimeConfig } from '../cloud/runtimeConfig.js';
import { getSupabaseClient, destroySupabaseClient } from './supabaseClientFactory.js';

const REALTIME_TABLES = ['orders', 'table_sessions', 'bill_revisions', 'invoices', 'payments', 'stock_balances', 'cancellation_requests', 'prepared_item_holds'];
const CHANNEL_JOIN_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 10000; // 10s fallback; realtime primary is <1s

export class SupabaseRealtime {
  constructor(config = {}) {
    this.config = config;
    this.eventBus = config.eventBus || platformEventBus;
    this.subscriptions = new Map();
    this.isConnected = false;
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.broadcastChannel = null;
    this.lastOrdersHash = '';
    this.lastStockBalancesHash = '';

    // supabase-js channel references
    this._rtChannels = [];
    this._rtClient = null;

    this._initNetworkListeners();
    this._initBroadcastChannel();
    this._initSupabaseRealtime();
  }

  get baseUrl() {
    return this.config.baseUrl || runtimeConfig.getSupabaseUrl();
  }

  get anonKey() {
    return this.config.anonKey || runtimeConfig.getAnonKey();
  }

  _initNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', async () => {
      console.log('🌐 [SupabaseRealtime] Network restored (ONLINE). Re-enabling cloud sync & delta polling...');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
        const dg = window.__APP__.platform.dataGateway;
        dg.setOnlineState(true);
        try {
          await dg.hydrateCollections([
            'inventory', 'suppliers', 'purchase_orders', 'goods_receipt_notes',
            'inventory_categories', 'inventory_uoms', 'orders', 'table_sessions',
            'bill_revisions', 'invoices', 'payments',
            'cancellation_requests', 'prepared_item_holds', 'disposition_policies'
          ], 'tenant_h0qc7wf');
          console.log('☁️ [SupabaseRealtime] Full cloud refresh completed on reconnect.');
        } catch (e) {
          console.warn('⚠️ [SupabaseRealtime] Cloud refresh warning on reconnect:', e.message);
        }
      }
      this._initSupabaseRealtime();
    });

    window.addEventListener('offline', () => {
      console.log('📡 [SupabaseRealtime] Network disconnected (OFFLINE). Pausing realtime & delta polling...');
      if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
        window.__APP__.platform.dataGateway.setOnlineState(false);
      }
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this._removeAllChannels();
      this.isConnected = false;
    });
  }

  setEventBus(eventBus) {
    this.eventBus = eventBus;
  }

  /**
   * 1. Cross-Tab & Cross-Window Instant Real-Time Channel
   */
  _initBroadcastChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('anchor_restaurantos_realtime');
        this.broadcastChannel.onmessage = (event) => {
          if (!event.data) return;
          const { type, table, operation, record } = event.data;

          if (type === 'CLOUD_MUTATION' && table && record) {
            this.handleIncomingPayload(table, operation || 'UPDATE', record, null, true);
          } else if (type === 'TICKET_ITEM_UPDATE' && record) {
            this._ingestTicketUpdate(record);
          }
        };
      } catch (err) {
        console.warn('[SupabaseRealtime] BroadcastChannel init notice:', err.message);
      }
    }
  }

  /**
   * Broadcasts a local mutation to all other open tabs in the browser.
   */
  broadcastLocalMutation(table, operation, record) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'CLOUD_MUTATION',
          table,
          operation,
          record,
          timestamp: Date.now()
        });
      } catch (_) {}
    }
  }

  /**
   * 2. Official supabase-js Realtime channels (Phase 4 PRIMARY delivery).
   *
   * Flow:
   *   - Get (or create) the singleton supabase-js client via the CDN factory.
   *   - Subscribe one channel per operational table, filtered by tenant_id so
   *     RLS is honored server-side.
   *   - On each postgres_changes event, route through handleIncomingPayload for
   *     ingestion + cross-tab BroadcastChannel.
   *   - Start the delta-poll fallback ONLY if NO channel reaches 'joined' state
   *     within CHANNEL_JOIN_TIMEOUT_MS.
   *
   * On `auth:session_started`, the accessToken callback inside the factory
   * transparently picks up the JWT from runtimeConfig on the next WS reconnect,
   * so no manual tear-down/resubscribe cycle is needed.
   */
  async _initSupabaseRealtime() {
    // Offline guard.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[SupabaseRealtime] Offline — supabase-js realtime skipped.');
      this.isConnected = false;
      return;
    }

    // Remove any prior channels (reconnect path).
    this._removeAllChannels();

    const client = await getSupabaseClient();
    if (!client) {
      // CDN unreachable or module not loaded — fall back to delta polling.
      console.warn('[SupabaseRealtime] supabase-js unavailable — enabling delta poll at POLL_INTERVAL_MS.');
      this._startPollFallback();
      return;
    }

    this._rtClient = client;

    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || 'tenant_h0qc7wf';

    let anyJoined = false;
    const joinTimeout = setTimeout(() => {
      if (!anyJoined) {
        console.warn('[SupabaseRealtime] No channel joined within timeout — enabling poll fallback.');
        this._startPollFallback();
      }
    }, CHANNEL_JOIN_TIMEOUT_MS);

    for (const table of REALTIME_TABLES) {
      const channel = client.channel(`rt:${table}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table, filter: `tenant_id=eq.${tenantId}` },
          (payload) => {
            const record = payload.new || payload.old;
            if (record) {
              this.handleIncomingPayload(table, payload.eventType || 'UPDATE', payload.new, payload.old);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            anyJoined = true;
            this.isConnected = true;
            clearTimeout(joinTimeout);
            if (this.pollTimer) {
              // Realtime is live; stop the fallback poller.
              clearInterval(this.pollTimer);
              this.pollTimer = null;
              console.log('🛑 [SupabaseRealtime] Channel live — fallback poller stopped.');
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            this.isConnected = false;
            if (!this.pollTimer) {
              this._startPollFallback();
            }
          }
        });

      this._rtChannels.push(channel);
    }

    if (this.isConnected) {
      console.log('⚡ [SupabaseRealtime] supabase-js channels subscribed (primary realtime).');
    }
  }

  /**
   * Starts the REST delta-poll fallback at the slower 10s safety-net interval.
   * Only runs when realtime is confirmed unavailable or degraded.
   */
  _startPollFallback() {
    if (this.pollTimer) return;
    this._initDeltaPolling();
  }

  /**
   * Gracefully removes all supabase-js channels (called on offline / reconnect).
   */
  _removeAllChannels() {
    if (!this._rtClient) return;
    for (const ch of this._rtChannels) {
      try { this._rtClient.removeChannel(ch); } catch (_) {}
    }
    this._rtChannels = [];
    this.isConnected = false;
  }

  /**
   * 3. REST Cloud Delta Polling FALLBACK (10s, only when realtime unavailable).
   *    Now secondary safety-net after Phase 4; realtime channels deliver <1s.
   */
  _initDeltaPolling() {
    if (typeof window === 'undefined') return;

    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return; // Skip polling tick when offline
      }
      try {
        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';
        const headers = runtimeConfig.getAuthHeaders({ 'Content-Type': 'application/json' });

        // 1. Delta poll orders
        const resp = await fetch(`${this.baseUrl}/rest/v1/orders?select=*`, { headers });
        if (resp.ok) {
          const cloudOrders = await resp.json();
          if (Array.isArray(cloudOrders)) {
            const hash = JSON.stringify(cloudOrders.map(o => `${o.id}_${o.order_status || o.status}_${o.updated_at || ''}_${JSON.stringify(o.data?.tickets || [])}`));
            if (hash !== this.lastOrdersHash) {
              this.lastOrdersHash = hash;
              this._syncCloudOrders(cloudOrders, tenantId);
            }
          }
        }

        // 2. Delta poll table_sessions
        const sessResp = await fetch(`${this.baseUrl}/rest/v1/table_sessions?select=*`, { headers });
        if (sessResp.ok) {
          const cloudSessions = await sessResp.json();
          if (Array.isArray(cloudSessions)) {
            const sessHash = JSON.stringify(cloudSessions.map(s => `${s.id}_${s.status}_${s.updated_at || ''}`));
            if (sessHash !== this.lastSessionsHash) {
              this.lastSessionsHash = sessHash;
              this._syncCloudTableSessions(cloudSessions, tenantId);
            }
          }
        }

        // 3. Delta poll bill revisions
        const revResp = await fetch(`${this.baseUrl}/rest/v1/bill_revisions?select=*`, { headers });
        if (revResp.ok) {
          const cloudRevisions = await revResp.json();
          if (Array.isArray(cloudRevisions)) {
            const revHash = JSON.stringify(cloudRevisions.map(r => `${r.id}_${r.revision_status || r.revisionStatus}_${r.updated_at || ''}`));
            if (revHash !== this.lastRevisionsHash) {
              this.lastRevisionsHash = revHash;
              this._syncCloudBillRevisions(cloudRevisions, tenantId);
            }
          }
        }

        // 4. Delta poll invoices
        const invResp = await fetch(`${this.baseUrl}/rest/v1/invoices?select=*`, { headers });
        if (invResp.ok) {
          const cloudInvoices = await invResp.json();
          if (Array.isArray(cloudInvoices)) {
            const invHash = JSON.stringify(cloudInvoices.map(i => `${i.id}_${i.status}_${i.updated_at || ''}`));
            if (invHash !== this.lastInvoicesHash) {
              this.lastInvoicesHash = invHash;
              this._syncCloudInvoices(cloudInvoices, tenantId);
            }
          }
        }

        // 5. Delta poll payments
        const payResp = await fetch(`${this.baseUrl}/rest/v1/payments?select=*`, { headers });
        if (payResp.ok) {
          const cloudPayments = await payResp.json();
          if (Array.isArray(cloudPayments)) {
            const payHash = JSON.stringify(cloudPayments.map(p => `${p.id}_${p.status}_${p.created_at || ''}`));
            if (payHash !== this.lastPaymentsHash) {
              this.lastPaymentsHash = payHash;
              this._syncCloudPayments(cloudPayments, tenantId);
            }
          }
        }

        // NOTE: offline_journal is a DEVICE-LOCAL retry queue, not shared cloud
        // state. It must never be fetched and written back over the local store
        // (this is the same clobber already removed from bootstrap.js HYDRATE_SET
        // and dataGateway.getCollection). Doing here every poll tick deleted
        // QUEUED/PENDING/ERROR jobs for orders, table_sessions, KOTs, bill_revisions,
        // invoices and payments, so failed writes silently disappeared on refresh
        // or from another browser. See Persistence/Realtime repair plan Phase 1.

        // 6. Delta poll stock_balances (Safety-net recovery for missed realtime events)
        const sbResp = await fetch(`${this.baseUrl}/rest/v1/stock_balances?select=*`, { headers });
        if (sbResp.ok) {
          const cloudBalances = await sbResp.json();
          if (Array.isArray(cloudBalances)) {
            const sbHash = JSON.stringify(cloudBalances.map(b => `${b.id}_${b.quantity}_${b.updated_at || ''}`));
            if (sbHash !== this.lastStockBalancesHash) {
              this.lastStockBalancesHash = sbHash;
              this._syncCloudStockBalances(cloudBalances, tenantId);
            }
          }
        }
      } catch (_) {}
    }, POLL_INTERVAL_MS);
  }

  /**
   * Ingests updated stock balances into DataGateway localAdapter & offlineStore,
   * then fires a single platform notification. Zero UI delta calculations.
   */
  _syncCloudStockBalances(cloudBalances, tenantId) {
    const localBals = offlineStore.getCollection('stock_balances', tenantId) || [];
    const balMap = new Map();
    localBals.forEach(b => {
      const key = `${b.itemCode || b.item_code}_${b.locationCode || b.location_code}`;
      balMap.set(key, b);
    });

    let hasChanges = false;
    cloudBalances.forEach(raw => {
      const p = (raw && raw.data) ? { ...raw.data, ...raw } : { ...raw };
      if (!p.id) p.id = raw.id;
      const iCode = p.itemCode || p.item_code || raw.item_code;
      const lCode = p.locationCode || p.location_code || raw.location_code;
      const key = `${iCode}_${lCode}`;
      const qty = parseFloat(raw.quantity !== undefined ? raw.quantity : (p.quantity || 0));

      const existing = balMap.get(key);
      const prevQty = existing ? parseFloat(existing.quantity !== undefined ? existing.quantity : (existing.data?.quantity || 0)) : null;

      if (!existing || prevQty !== qty) {
        hasChanges = true;
        const updated = {
          ...(existing || {}),
          ...p,
          id: p.id || raw.id,
          tenantId: tenantId || p.tenantId || raw.tenant_id,
          tenant_id: tenantId || p.tenant_id || raw.tenant_id,
          itemCode: iCode,
          item_code: iCode,
          locationCode: lCode,
          location_code: lCode,
          quantity: qty,
          currentStock: qty,
          unitCost: parseFloat(p.unitCost || raw.unit_cost || 0),
          unit_cost: parseFloat(p.unitCost || raw.unit_cost || 0),
          valuation: parseFloat((qty * parseFloat(p.unitCost || raw.unit_cost || 0)).toFixed(2)),
          updatedAt: raw.updated_at || new Date().toISOString(),
          updated_at: raw.updated_at || new Date().toISOString()
        };
        balMap.set(key, updated);
      }
    });

    if (hasChanges) {
      const updatedList = Array.from(balMap.values());
      offlineStore.setCollection('stock_balances', updatedList);

      if (typeof window !== 'undefined' && window.__APP__?.platform?.dataGateway?.localAdapter?.setCollection) {
        window.__APP__.platform.dataGateway.localAdapter.setCollection('stock_balances', updatedList);
      }

      this.eventBus.publish('stock:balance:updated', { source: 'realtime_sync' });
    }
  }

  /**
   * Ingests updated orders from Supabase into local memory and fires platform events.
   */
  _syncCloudOrders(cloudOrders, tenantId) {
    const localOrders = offlineStore.getCollection('orders', tenantId) || [];
    const localTickets = offlineStore.getCollection('tickets', tenantId) || [];

    const orderMap = new Map();
    localOrders.forEach(o => orderMap.set(o.id || o.orderId, o));

    let hasChanges = false;

    cloudOrders.forEach(raw => {
      const p = (raw && raw.data) ? { ...raw.data, ...raw } : { ...raw };
      if (!p.id) p.id = raw.id;
      if (!p.orderId) p.orderId = raw.id;
      if (raw.order_number) p.orderNumber = raw.order_number;
      if (raw.table_code) p.tableCode = raw.table_code;
      if (raw.session_id) p.sessionId = raw.session_id;
      if (raw.order_status) p.orderStatus = raw.order_status;
      if (raw.data?.tickets) p.tickets = raw.data.tickets;

      const existing = orderMap.get(p.id);
      const isNew = !existing;
      const isUpdated = existing && JSON.stringify(existing) !== JSON.stringify(p);

      if (isNew || isUpdated) {
        hasChanges = true;
        orderMap.set(p.id, p);

        // Update embedded tickets
        const tickets = Array.isArray(p.tickets) ? p.tickets : (p.data?.tickets || []);
        tickets.forEach(t => {
          const tIdx = localTickets.findIndex(lt => (lt.ticketId || lt.id) === (t.ticketId || t.id));
          if (tIdx >= 0) {
            localTickets[tIdx] = { ...localTickets[tIdx], ...t };
          } else {
            localTickets.push(t);
          }
        });
      }
    });

    if (hasChanges) {
      offlineStore.setCollection('orders', Array.from(orderMap.values()));
      offlineStore.setCollection('tickets', localTickets);

      // Publish real-time events to platformEventBus
      platformEventBus.publish('ticket:status_changed', { source: 'realtime_sync' });
      platformEventBus.publish('ticket:item_status_changed', { source: 'realtime_sync' });
      platformEventBus.publish('order:confirmed', { source: 'realtime_sync' });
      platformEventBus.publish('session:projection:updated', { source: 'realtime_sync' });
    }
  }

  /**
   * Ingests updated bill revisions from Supabase cloud into local memory and fires platform events.
   */
  _syncCloudBillRevisions(cloudRevisions, tenantId) {
    const localRevisions = offlineStore.getCollection('bill_revisions') || [];
    const revMap = new Map();
    localRevisions.forEach(r => revMap.set(r.id || r.revisionId, r));

    let hasChanges = false;
    cloudRevisions.forEach(raw => {
      const p = (raw && raw.data) ? { ...raw.data, ...raw } : { ...raw };
      if (!p.id) p.id = raw.id;
      if (!p.revisionId) p.revisionId = raw.id;
      if (raw.session_id) p.sessionId = raw.session_id;
      if (raw.bill_number) p.billNumber = raw.bill_number;
      if (raw.revision_number) p.revisionNumber = raw.revision_number;
      if (raw.grand_total) p.grandTotal = raw.grand_total;
      if (raw.revision_status) p.revisionStatus = raw.revision_status;

      const existing = revMap.get(p.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(p)) {
        hasChanges = true;
        revMap.set(p.id, p);
      }
    });

    if (hasChanges) {
      offlineStore.setCollection('bill_revisions', Array.from(revMap.values()));
      platformEventBus.publish('bill:revision:created', { source: 'realtime_sync' });
      platformEventBus.publish('session:milestone:changed', { source: 'realtime_sync' });
      platformEventBus.publish('session:projection:updated', { source: 'realtime_sync' });
    }
  }

  _ingestTicketUpdate(ticketRecord) {
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || 'tenant_h0qc7wf';
    const localTickets = offlineStore.getCollection('tickets', tenantId) || [];
    const tIdx = localTickets.findIndex(t => (t.ticketId || t.id) === (ticketRecord.ticketId || ticketRecord.id));

    if (tIdx >= 0) {
      localTickets[tIdx] = { ...localTickets[tIdx], ...ticketRecord };
    } else {
      localTickets.push(ticketRecord);
    }
    offlineStore.setCollection('tickets', localTickets);

    platformEventBus.publish('ticket:status_changed', { ticketId: ticketRecord.ticketId || ticketRecord.id, ticket: ticketRecord });
    platformEventBus.publish('ticket:item_status_changed', { ticketId: ticketRecord.ticketId || ticketRecord.id, ticket: ticketRecord });
    platformEventBus.publish('session:projection:updated', { sessionId: ticketRecord.sessionId });
  }

  /**
   * Normalizes raw Supabase payload into standardized Platform Event Bus shape.
   */
  normalizeEvent(collection, eventType, record, oldRecord = null) {
    return {
      type: 'data:changed',
      collection: collection || 'orders',
      operation: eventType || 'INSERT',
      record: record || {},
      oldRecord: oldRecord || null,
      timestamp: new Date().toISOString(),
      source: 'supabase'
    };
  }

  /**
   * Dispatches normalized event to event bus and table-specific listeners.
   */
  dispatchEvent(normalizedEvent) {
    if (!normalizedEvent) return;

    if (this.eventBus) {
      if (typeof this.eventBus.publish === 'function') {
        this.eventBus.publish(normalizedEvent.type, normalizedEvent);
      }
    }

    const callbacks = this.subscriptions.get(normalizedEvent.collection);
    if (callbacks) {
      callbacks.forEach(cb => {
        try { cb(normalizedEvent); } catch (e) { console.error(`[SupabaseRealtime] Callback error for ${normalizedEvent.collection}:`, e); }
      });
    }

    const wildcardCallbacks = this.subscriptions.get('*');
    if (wildcardCallbacks) {
      wildcardCallbacks.forEach(cb => {
        try { cb(normalizedEvent); } catch (e) { console.error('[SupabaseRealtime] Callback error for *:', e); }
      });
    }
  }

  subscribe(collection = 'orders', callback) {
    if (!this.subscriptions.has(collection)) {
      this.subscriptions.set(collection, new Set());
    }
    this.subscriptions.get(collection).add(callback);

    return () => {
      if (this.subscriptions.has(collection)) {
        this.subscriptions.get(collection).delete(callback);
      }
    };
  }

  /**
   * Ingests updated table sessions from Supabase cloud into local memory and fires platform events.
   */
  _syncCloudTableSessions(cloudSessions, tenantId) {
    const localSessions = offlineStore.getCollection('table_sessions') || [];
    const sessMap = new Map();
    localSessions.forEach(s => sessMap.set(s.id || s.sessionId, s));

    let hasChanges = false;
    cloudSessions.forEach(raw => {
      const p = (raw && raw.data) ? { ...raw.data, ...raw } : { ...raw };
      if (!p.id) p.id = raw.id;
      if (!p.sessionId) p.sessionId = raw.id;
      if (raw.table_number) p.tableNumber = parseInt(raw.table_number);
      if (raw.table_code) p.tableCode = raw.table_code;
      if (raw.assigned_waiter_id) p.assignedWaiterId = raw.assigned_waiter_id;
      if (raw.guest_count) p.guestCount = parseInt(raw.guest_count);
      if (raw.status) p.status = raw.status;

      const existing = sessMap.get(p.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(p)) {
        const pVer = parseInt(p.version) || 0;
        const eVer = parseInt(existing?.version) || 0;
        if (pVer > 0 && eVer > 0 && pVer < eVer) return;

        hasChanges = true;
        sessMap.set(p.id, p);
      }
    });

    if (hasChanges) {
      offlineStore.setCollection('table_sessions', Array.from(sessMap.values()));
      platformEventBus.publish('session:milestone:changed', { source: 'realtime_sync' });
      platformEventBus.publish('session:projection:updated', { source: 'realtime_sync' });
      platformEventBus.publish('table:state:changed', { source: 'realtime_sync' });
    }
  }

  /**
   * Ingests updated tax invoices from Supabase cloud into local memory and fires platform events.
   */
  _syncCloudInvoices(cloudInvoices, tenantId) {
    const localInvoices = offlineStore.getCollection('invoices') || [];
    const invMap = new Map();
    localInvoices.forEach(i => invMap.set(i.id || i.invoiceNumber, i));

    let hasChanges = false;
    cloudInvoices.forEach(raw => {
      const p = (raw && raw.data) ? { ...raw.data, ...raw } : { ...raw };
      if (!p.id) p.id = raw.id;
      if (raw.session_id) p.sessionId = raw.session_id;
      if (raw.invoice_number) p.invoiceNumber = raw.invoice_number;
      if (raw.bill_number) p.billNumber = raw.bill_number;
      if (raw.grand_total) p.grandTotal = parseFloat(raw.grand_total);
      if (raw.status) p.status = raw.status;

      const existing = invMap.get(p.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(p)) {
        hasChanges = true;
        invMap.set(p.id, p);
      }
    });

    if (hasChanges) {
      offlineStore.setCollection('invoices', Array.from(invMap.values()));
      platformEventBus.publish('invoice:issued', { source: 'realtime_sync' });
      platformEventBus.publish('session:projection:updated', { source: 'realtime_sync' });
    }
  }

  /** Cancellation workflow: merge cloud cancellation_requests rows into local store. */
  _syncCloudCancellationRequests(cloudRequests, tenantId) {
    const localRequests = offlineStore.getCollection('cancellation_requests') || [];
    const reqMap = new Map();
    localRequests.forEach(r => reqMap.set(r.id, r));

    let hasChanges = false;
    cloudRequests.forEach(raw => {
      const p = (raw && raw.data) ? { ...raw.data, ...raw } : { ...raw };
      if (!p.id) p.id = raw.id;
      if (raw.tenant_id) p.tenantId = raw.tenant_id;
      if (raw.session_id) p.sessionId = raw.session_id;
      if (raw.order_id) p.orderId = raw.order_id;
      if (raw.order_line_id) p.orderLineId = raw.order_line_id;
      if (raw.ticket_id) p.ticketId = raw.ticket_id;
      if (raw.station) p.station = raw.station;
      if (raw.item_code) p.itemCode = raw.item_code;
      if (raw.item_name) p.itemName = raw.item_name;
      if (raw.quantity !== undefined && raw.quantity !== null) p.quantity = parseFloat(raw.quantity);
      if (raw.status) p.status = raw.status;
      if (raw.reason_code) p.reasonCode = raw.reason_code;
      if (raw.decided_by) p.decidedBy = raw.decided_by;
      if (raw.decided_at) p.decidedAt = raw.decided_at;

      const existing = reqMap.get(p.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(p)) {
        hasChanges = true;
        reqMap.set(p.id, p);
      }
    });

    if (hasChanges) {
      offlineStore.setCollection('cancellation_requests', Array.from(reqMap.values()));
      platformEventBus.publish('cancellation:synced', { source: 'realtime_sync', tenantId });
    }
  }

  /** Cancellation workflow: merge cloud prepared_item_holds rows into local store. */
  _syncCloudPreparedItemHolds(cloudHolds, tenantId) {
    const localHolds = offlineStore.getCollection('prepared_item_holds') || [];
    const holdMap = new Map();
    localHolds.forEach(h => holdMap.set(h.id, h));

    let hasChanges = false;
    cloudHolds.forEach(raw => {
      const p = (raw && raw.data) ? { ...raw.data, ...raw } : { ...raw };
      if (!p.id) p.id = raw.id;
      if (raw.tenant_id) p.tenantId = raw.tenant_id;
      if (raw.source_session_id) p.sourceSessionId = raw.source_session_id;
      if (raw.source_order_id) p.sourceOrderId = raw.source_order_id;
      if (raw.source_order_line_id) p.sourceOrderLineId = raw.source_order_line_id;
      if (raw.source_ticket_id) p.sourceTicketId = raw.source_ticket_id;
      if (raw.source_request_id) p.sourceRequestId = raw.source_request_id;
      if (raw.station) p.station = raw.station;
      if (raw.item_code) p.itemCode = raw.item_code;
      if (raw.item_name) p.itemName = raw.item_name;
      if (raw.quantity !== undefined && raw.quantity !== null) p.quantity = parseFloat(raw.quantity);
      if (raw.status) p.status = raw.status;
      if (raw.consumed_cost !== undefined && raw.consumed_cost !== null) p.consumedCost = parseFloat(raw.consumed_cost);
      if (raw.waste_amount !== undefined && raw.waste_amount !== null) p.wasteAmount = parseFloat(raw.waste_amount);
      if (raw.hold_created_at) p.holdCreatedAt = raw.hold_created_at;
      if (raw.hold_expires_at) p.holdExpiresAt = raw.hold_expires_at;
      if (raw.lineage) p.lineage = raw.lineage;

      const existing = holdMap.get(p.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(p)) {
        hasChanges = true;
        holdMap.set(p.id, p);
      }
    });

    if (hasChanges) {
      offlineStore.setCollection('prepared_item_holds', Array.from(holdMap.values()));
      platformEventBus.publish('hold:synced', { source: 'realtime_sync', tenantId });
    }
  }

  /**
   * Ingests updated payments from Supabase cloud into local memory and fires platform events.
   */
  _syncCloudPayments(cloudPayments, tenantId) {
    const localPayments = offlineStore.getCollection('payments') || [];
    const payMap = new Map();
    localPayments.forEach(p => payMap.set(p.id || p.paymentId, p));

    let hasChanges = false;
    cloudPayments.forEach(raw => {
      const p = (raw && raw.data) ? { ...raw.data, ...raw } : { ...raw };
      if (!p.id) p.id = raw.id;
      if (!p.paymentId) p.paymentId = raw.id;
      if (raw.session_id) p.sessionId = raw.session_id;
      if (raw.bill_number) p.billNumber = raw.bill_number;
      if (raw.invoice_number) p.invoiceNumber = raw.invoice_number;
      if (raw.amount) p.amount = parseFloat(raw.amount);
      if (raw.payment_method) p.paymentMethod = raw.payment_method;
      if (raw.status) p.status = raw.status;

      const existing = payMap.get(p.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(p)) {
        hasChanges = true;
        payMap.set(p.id, p);
      }
    });

    if (hasChanges) {
      offlineStore.setCollection('payments', Array.from(payMap.values()));
      platformEventBus.publish('payment:recorded', { source: 'realtime_sync' });
      platformEventBus.publish('session:milestone:changed', { source: 'realtime_sync' });
      platformEventBus.publish('session:projection:updated', { source: 'realtime_sync' });
    }
  }

  handleIncomingPayload(table, eventType, newRecord, oldRecord = null, isFromBroadcast = false) {
    const normalized = this.normalizeEvent(table, eventType, newRecord, oldRecord);
    this.dispatchEvent(normalized);

    const tId = newRecord ? (newRecord.tenantId || newRecord.tenant_id) : null;
    if (table === 'orders' && newRecord) {
      this._syncCloudOrders([newRecord], tId);
    } else if (table === 'table_sessions' && newRecord) {
      this._syncCloudTableSessions([newRecord], tId);
    } else if (table === 'bill_revisions' && newRecord) {
      this._syncCloudBillRevisions([newRecord], tId);
    } else if (table === 'invoices' && newRecord) {
      this._syncCloudInvoices([newRecord], tId);
    } else if (table === 'payments' && newRecord) {
      this._syncCloudPayments([newRecord], tId);
    } else if (table === 'stock_balances' && newRecord) {
      this._syncCloudStockBalances([newRecord], tId);
    } else if (table === 'cancellation_requests' && newRecord) {
      this._syncCloudCancellationRequests([newRecord], tId);
    } else if (table === 'prepared_item_holds' && newRecord) {
      this._syncCloudPreparedItemHolds([newRecord], tId);
    }

    if (!isFromBroadcast) {
      this.broadcastLocalMutation(table, eventType, newRecord);
    }

    return normalized;
  }
}
