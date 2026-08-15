/**
 * Offline mutation journal.
 *
 * Preserves the existing PD-032 six-state lifecycle:
 * LOCAL_ONLY, QUEUED, SYNCING, SYNCED, CONFLICT, ERROR.
 *
 * This module intentionally remains storage-oriented for now.
 * The later realtime-first refactor will introduce the cloud
 * transport layer without changing this journal's responsibility.
 */
export class OfflineJournal {
  constructor(offlineStore, getDeviceId) {
    this.offlineStore = offlineStore;
    this.getDeviceId = getDeviceId;
  }

  createSyncJob(jobType, tenantId, entityName, payload, session) {
    const job = {
      jobId: 'job-' + Math.random().toString(36).substring(2, 9),
      jobType,
      tenantId,
      entityName,
      payload,
      deviceId: this.getDeviceId(),
      version: payload.version || 1,
      timestamp: new Date().toISOString(),
      actor: session ? session.employeeName : 'System Worker',
      correlationId:
        payload.correlationId ||
        ('corr-' + Math.random().toString(36).substring(2, 7)),
      syncState: 'QUEUED'
    };

    this.offlineStore.appendItem('offline_journal', job);

    window.dispatchEvent(new CustomEvent('ros_sync_updated'));

    return job;
  }

  getJobs(tenantId = null) {
    return this.offlineStore.getCollection('offline_journal', tenantId) || [];
  }

  getPendingJobs(tenantId = null) {
    const jobs = this.getJobs(tenantId);
    return jobs.filter(j => j.syncState === 'QUEUED');
  }

  updateJobState(jobId, syncState, patch = {}) {
    this.offlineStore.updateItem(
      'offline_journal',
      'jobId',
      jobId,
      { syncState, ...patch }
    );

    window.dispatchEvent(new CustomEvent('ros_sync_updated'));
  }
}
