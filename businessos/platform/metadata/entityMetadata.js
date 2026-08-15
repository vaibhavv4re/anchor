/**
 * Device identity used for entity metadata and synchronization.
 *
 * Preserves the existing RestaurantOS device ID behavior.
 */
export function getDeviceId() {
  if (typeof localStorage === 'undefined') {
    return 'dev-node-test';
  }
  let devId = localStorage.getItem('ros_device_id');

  if (!devId) {
    devId = 'dev-' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('ros_device_id', devId);
  }

  return devId;
}

/**
 * Attaches the standardized entity metadata defined by PD-032.
 *
 * This preserves the current metadata contract while moving it
 * out of the monolithic bundle.
 */
export function attachStandardMetadata(obj, tenantId, session) {
  const now = new Date().toISOString();

  return {
    ...obj,
    tenantId,
    version: obj.version || 1,
    deviceId: getDeviceId(),
    createdBy: session ? session.employeeName : 'System Worker',
    modifiedBy: session ? session.employeeName : 'System Worker',
    correlationId: 'corr-' + Math.random().toString(36).substring(2, 7),
    createdAt: now,
    modifiedAt: now,
    syncState: 'QUEUED',
    cloudVersion: null,
    deletedAt: null
  };
}
