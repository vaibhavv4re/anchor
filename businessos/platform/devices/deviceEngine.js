/**
 * BusinessOS Platform - Device Management Engine
 * Manages device profiles, hardware capabilities, assigned workspace defaults, floor areas, and printer routing.
 *
 * Phase 4: devices are cloud-backed through the DataGateway (the existing `devices`
 * table, anon-readable + hydrated on boot) so a terminal registered on one screen
 * is known to every other screen. The DataGateway keeps the offlineStore 'devices'
 * mirror in sync and queues an offline job if the cloud write fails.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';

const DEFAULT_TENANT = 'tenant_h0qc7wf';

class DeviceEngine {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
  }

  _gateway() {
    if (this.dataGateway) return this.dataGateway;
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      this.dataGateway = window.__APP__.platform.dataGateway || null;
    }
    return this.dataGateway;
  }

  _tenantId() {
    if (typeof sessionStorage !== 'undefined') {
      try { return (JSON.parse(sessionStorage.getItem('ros_session') || '{}').tenantId) || DEFAULT_TENANT; } catch { /* ignore */ }
    }
    return DEFAULT_TENANT;
  }

  /**
   * Register a new tablet or hardware device with hardware capability profiling.
   */
  registerDevice({
    deviceId,
    name,
    deviceProfile = 'TABLET',
    assignedWorkspace,
    assignedArea,
    assignedPrinterId,
    capabilities = { touch: true, sound: true, fullScreen: true, camera: false, qrScanner: false },
    allowedRoles = ['*']
  }) {
    const tenantId = this._tenantId();
    const existing = this.getDevice(deviceId);

    const deviceRecord = {
      id: deviceId,
      tenant_id: tenantId,
      tenantId,
      name,
      deviceProfile,
      device_profile: deviceProfile,
      assignedWorkspace,
      assigned_workspace: assignedWorkspace,
      assignedArea,
      assigned_area: assignedArea,
      assignedPrinterId,
      assigned_printer_id: assignedPrinterId,
      capabilities,
      allowedRoles,
      registeredAt: new Date().toISOString()
    };

    const gw = this._gateway();
    if (gw && typeof gw.create === 'function') {
      if (existing) gw.update('devices', deviceId, deviceRecord);
      else gw.create('devices', deviceRecord);
    } else if (existing) {
      const devices = offlineStore.getCollection('devices') || [];
      const idx = devices.findIndex(d => d.id === deviceId);
      devices[idx] = deviceRecord;
      offlineStore.setCollection('devices', devices);
    } else {
      offlineStore.appendItem('devices', deviceRecord);
    }

    platformEventBus.publish(PlatformEventTypes.DEVICE_REGISTERED, deviceRecord);

    return deviceRecord;
  }

  getDevice(deviceId) {
    const gw = this._gateway();
    const devices = (gw && typeof gw.getCachedCollection === 'function')
      ? (gw.getCachedCollection('devices') || [])
      : (offlineStore.getCollection('devices') || []);
    return devices.find(d => d.id === deviceId) || null;
  }

  hasCapability(deviceId, capabilityName) {
    const device = this.getDevice(deviceId);
    if (!device || !device.capabilities) return false;
    return !!device.capabilities[capabilityName];
  }

  getAllDevices() {
    const gw = this._gateway();
    if (gw && typeof gw.getCachedCollection === 'function') {
      const cloud = gw.getCachedCollection('devices') || [];
      if (cloud.length > 0) return cloud;
    }
    return offlineStore.getCollection('devices') || [];
  }
}

export const deviceEngine = new DeviceEngine();
