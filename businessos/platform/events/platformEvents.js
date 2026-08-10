/**
 * BusinessOS Platform - Typed Event Bus & Registry
 * Provides decoupled pub/sub communication across all platform services and domain capabilities.
 */

export const PlatformEventTypes = Object.freeze({
  EMPLOYEE_AUTHENTICATED: 'platform:employee:authenticated',
  EMPLOYEE_LOGGED_OUT: 'platform:employee:logged_out',
  SESSION_LOCKED: 'platform:session:locked',
  SESSION_UNLOCKED: 'platform:session:unlocked',
  CONFIG_UPDATED: 'platform:config:updated',
  DEVICE_REGISTERED: 'platform:device:registered',
  NOTIFICATION_EMITTED: 'platform:notification:emitted',
  AUDIT_LOGGED: 'platform:audit:logged'
});

class PlatformEventBus {
  constructor() {
    this.subscribers = new Map();
  }

  /**
   * Subscribe to a typed platform event.
   * @param {string} eventType 
   * @param {Function} handler 
   * @returns {Function} Unsubscribe callback function
   */
  subscribe(eventType, handler) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    const handlers = this.subscribers.get(eventType);
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
    };
  }

  /**
   * Publish a typed event to all registered subscribers.
   * @param {string} eventType 
   * @param {Object} payload 
   */
  publish(eventType, payload = {}) {
    const envelope = {
      type: eventType,
      payload,
      timestamp: new Date().toISOString()
    };

    if (this.subscribers.has(eventType)) {
      const handlers = this.subscribers.get(eventType);
      for (const handler of handlers) {
        try {
          handler(envelope);
        } catch (err) {
          console.error(`[EventBus] Error in subscriber for ${eventType}:`, err);
        }
      }
    }

    // Publish to wildcard listeners
    if (this.subscribers.has('*')) {
      for (const handler of this.subscribers.get('*')) {
        try {
          handler(envelope);
        } catch (err) {
          console.error(`[EventBus] Error in wildcard subscriber:`, err);
        }
      }
    }
  }

  /**
   * Clear all subscribers (useful for testing).
   */
  reset() {
    this.subscribers.clear();
  }
}

export const platformEventBus = new PlatformEventBus();
