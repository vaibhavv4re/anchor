export class AuditLogger {
  constructor(offlineStore) {
    this.offlineStore = offlineStore;
  }

  log(user, action, tenantId = null) {
    const now = new Date();
    const timeStr =
      now.getHours().toString().padStart(2, '0') +
      ':' +
      now.getMinutes().toString().padStart(2, '0');

    const item = {
      id: 'aud-' + Math.random().toString(36).substring(2, 7),
      tenantId,
      time: timeStr,
      user,
      action,
      correlationId: 'corr-' + Math.random().toString(36).substring(2, 7)
    };

    this.offlineStore.appendItem('audit_logs', item);

    return item;
  }
}
