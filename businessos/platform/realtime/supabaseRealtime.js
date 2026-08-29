/**
 * SupabaseRealtime Cloud & Multi-Device Transport for RestaurantOS / BusinessOS.
 *
 * Real-Time Architecture:
 * 1. Native Supabase Realtime WebSocket Connection (Phoenix Channel protocol).
 * 2. Cross-Tab & Cross-Window Instant Synchronization via Web BroadcastChannel (0ms latency).
 * 3. Resilient Cloud Delta Polling Fallback (every 2.0s) ensuring zero missed updates.
 * 4. Automatic ingestion into DataGateway & PlatformEventBus for instant UI updates without page refresh.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

export class SupabaseRealtime {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'https://orlcftjkhqypvqzcmfci.supabase.co';
    this.anonKey = config.anonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';
    this.eventBus = config.eventBus || platformEventBus;
    this.subscriptions = new Map();
    this.isConnected = false;
    this.ws = null;
    this.heartbeatTimer = null;
    this.pollTimer = null;
    this.broadcastChannel = null;
    this.lastOrdersHash = '';
    this.refCounter = 1;

    this._initBroadcastChannel();
    this._initWebSocket();
    this._initDeltaPolling();
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
   * 2. Native Supabase Realtime WebSocket Connection
   */
  _initWebSocket() {
    if (typeof WebSocket === 'undefined') return;

    try {
      const wsHost = this.baseUrl.replace(/^http/, 'ws');
      const wsUrl = `${wsHost}/realtime/v1/websocket?apikey=${this.anonKey}&vsn=1.0.0`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log('⚡ [SupabaseRealtime] WebSocket connected to Supabase Realtime Engine.');

        // Join Postgres Changes channel for 'orders'
        this._sendWsMessage({
          topic: 'realtime:public:orders',
          event: 'phx_join',
          payload: {
            config: {
              postgres_changes: [
                { event: '*', schema: 'public', table: 'orders' }
              ]
            }
          },
          ref: String(this.refCounter++)
        });

        // Start 25s Phoenix heartbeat
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this._sendWsMessage({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: 'hb'
            });
          }
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (!msg) return;

          // Check if message is a Postgres change event
          if (msg.event === 'postgres_changes' && msg.payload && msg.payload.data) {
            const { type, record, old_record, table } = msg.payload.data;
            const targetTable = table || (msg.topic ? msg.topic.split(':').pop() : 'orders');
            if (record) {
              this.handleIncomingPayload(targetTable, type || 'UPDATE', record, old_record);
            }
          }
        } catch (_) {}
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        // Attempt reconnection after 5 seconds
        setTimeout(() => this._initWebSocket(), 5000);
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch (err) {
      console.warn('[SupabaseRealtime] WebSocket connection notice:', err.message);
    }
  }

  _sendWsMessage(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * 3. Resilient High-Speed Cloud Delta Polling Fallback (every 2.0s)
   */
  _initDeltaPolling() {
    if (typeof window === 'undefined') return;

    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      try {
        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';

        // 1. Delta poll orders
        const resp = await fetch(`${this.baseUrl}/rest/v1/orders?select=*`, {
          headers: { 'apikey': this.anonKey, 'Authorization': `Bearer ${this.anonKey}` }
        });
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

        // 2. Delta poll bill revisions
        const revResp = await fetch(`${this.baseUrl}/rest/v1/bill_revisions?select=*`, {
          headers: { 'apikey': this.anonKey, 'Authorization': `Bearer ${this.anonKey}` }
        });
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
      } catch (_) {}
    }, 2000);
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

  handleIncomingPayload(table, eventType, newRecord, oldRecord = null, isFromBroadcast = false) {
    const normalized = this.normalizeEvent(table, eventType, newRecord, oldRecord);
    this.dispatchEvent(normalized);

    // If this is an orders record, sync it immediately
    if (table === 'orders' && newRecord) {
      this._syncCloudOrders([newRecord], newRecord.tenantId || newRecord.tenant_id);
    }

    if (!isFromBroadcast) {
      this.broadcastLocalMutation(table, eventType, newRecord);
    }

    return normalized;
  }
}
