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

        // Join Postgres Changes channel for all operational and financial tables
        const tablesToSubscribe = ['orders', 'table_sessions', 'bill_revisions', 'invoices', 'payments'];
        tablesToSubscribe.forEach(tbl => {
          this._sendWsMessage({
            topic: `realtime:public:${tbl}`,
            event: 'phx_join',
            payload: {
              config: {
                postgres_changes: [
                  { event: '*', schema: 'public', table: tbl }
                ]
              }
            },
            ref: String(this.refCounter++)
          });
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
        const headers = { 'apikey': this.anonKey, 'Authorization': `Bearer ${this.anonKey}` };

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

        // 6. Delta poll offline_journal (Reconciliation exceptions & audit entries)
        const journalResp = await fetch(`${this.baseUrl}/rest/v1/offline_journal?select=*&order=created_at.desc&limit=100`, { headers });
        if (journalResp.ok) {
          const cloudJournal = await journalResp.json();
          if (Array.isArray(cloudJournal)) {
            const journalHash = JSON.stringify(cloudJournal.map(j => `${j.job_id}_${j.sync_state}_${j.created_at || ''}`));
            if (journalHash !== this.lastJournalHash) {
              this.lastJournalHash = journalHash;
              this._syncCloudOfflineJournal(cloudJournal, tenantId);
            }
          }
        }
      } catch (_) {}
    }, 2000);
  }

  _syncCloudOfflineJournal(cloudJournal, tenantId) {
    offlineStore.setCollection('offline_journal', cloudJournal);
    this.eventBus.publish('reconciliation:exception:flagged', {});
    this.eventBus.publish('exception:resolved', {});
    this.eventBus.publish('data:changed', {});
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
    }

    if (!isFromBroadcast) {
      this.broadcastLocalMutation(table, eventType, newRecord);
    }

    return normalized;
  }
}
