/**
 * SupabaseRealtime Cloud Transport for RestaurantOS / BusinessOS platform.
 *
 * Listens for realtime database changes from Supabase (e.g. 'kots', 'orders', 'stock_balances')
 * and normalizes incoming mutations into standardized Platform Event Bus payloads.
 */
export class SupabaseRealtime {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'https://orlcftjkhqypvqzcmfci.supabase.co';
    this.anonKey = config.anonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';
    this.eventBus = config.eventBus || null;
    this.subscriptions = new Map();
    this.isConnected = false;
  }

  /**
   * Binds an event bus listener or custom callback for normalized realtime events.
   * @param {Object|Function} eventBus 
   */
  setEventBus(eventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Normalizes raw Supabase payload into standardized Platform Event Bus shape.
   */
  normalizeEvent(collection, eventType, record, oldRecord = null) {
    return {
      type: 'data:changed',
      collection: collection || 'kots',
      operation: eventType || 'INSERT',
      record: record || {},
      oldRecord: oldRecord || null,
      timestamp: new Date().toISOString(),
      source: 'supabase'
    };
  }

  /**
   * Dispatches normalized event to event bus or custom handler.
   */
  dispatchEvent(normalizedEvent) {
    if (!normalizedEvent) return;

    if (this.eventBus) {
      if (typeof this.eventBus.publish === 'function') {
        this.eventBus.publish(normalizedEvent.type, normalizedEvent);
      } else if (typeof this.eventBus.emit === 'function') {
        this.eventBus.emit(normalizedEvent.type, normalizedEvent);
      } else if (typeof this.eventBus === 'function') {
        this.eventBus(normalizedEvent);
      }
    }

    // Call table-specific subscription callbacks if any
    const callbacks = this.subscriptions.get(normalizedEvent.collection);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(normalizedEvent);
        } catch (e) {
          console.error(`[SupabaseRealtime] Callback error for ${normalizedEvent.collection}:`, e);
        }
      });
    }

    // Call wildcard '*' subscription callbacks
    const wildcardCallbacks = this.subscriptions.get('*');
    if (wildcardCallbacks) {
      wildcardCallbacks.forEach(cb => {
        try {
          cb(normalizedEvent);
        } catch (e) {
          console.error('[SupabaseRealtime] Callback error for *:', e);
        }
      });
    }
  }

  /**
   * Subscribes to realtime change events for a specific database collection (e.g. 'kots' or '*').
   * @param {string} collection Table name or '*'
   * @param {Function} callback Handler for normalized events
   * @returns {Function} Unsubscribe handler
   */
  subscribe(collection = 'kots', callback) {
    if (!this.subscriptions.has(collection)) {
      this.subscriptions.set(collection, new Set());
    }
    this.subscriptions.get(collection).add(callback);

    // Return unsubscribe procedure
    return () => {
      if (this.subscriptions.has(collection)) {
        this.subscriptions.get(collection).delete(callback);
      }
    };
  }

  /**
   * Simulates/Ingests a incoming Supabase change payload (used by WebSockets / SSE / Polling transport).
   */
  handleIncomingPayload(table, eventType, newRecord, oldRecord = null) {
    const normalized = this.normalizeEvent(table, eventType, newRecord, oldRecord);
    this.dispatchEvent(normalized);
    return normalized;
  }
}
