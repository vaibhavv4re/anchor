/**
 * BusinessOS Platform - Notification Infrastructure
 * Classified notification routing by Role, Workspace, and Severity.
 */

import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';
import { offlineStore } from '../offline_store/offlineStore.js';

export const NotificationSeverity = Object.freeze({
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
  CRITICAL: 'CRITICAL'
});

class NotificationEngine {
  /**
   * Emit a classified notification.
   */
  emit({ role = '*', workspace = '*', severity = NotificationSeverity.INFO, title, message, payload = {} }) {
    const notification = {
      id: 'notif_' + Math.random().toString(36).substring(2, 9),
      role,
      workspace,
      severity,
      title,
      message,
      payload,
      read: false,
      timestamp: new Date().toISOString()
    };

    offlineStore.appendItem('notifications', notification);
    platformEventBus.publish(PlatformEventTypes.NOTIFICATION_EMITTED, notification);

    return notification;
  }

  getNotificationsFor(workspace, roleId) {
    const list = offlineStore.getCollection('notifications') || [];
    return list.filter(n => 
      !n.read &&
      (n.workspace === '*' || n.workspace === workspace) &&
      (n.role === '*' || n.role === roleId)
    );
  }

  markRead(notificationId) {
    const list = offlineStore.getCollection('notifications') || [];
    const updated = list.map(n => n.id === notificationId ? { ...n, read: true } : n);
    offlineStore.setCollection('notifications', updated);
  }
}

export const notificationEngine = new NotificationEngine();
