/**
 * BusinessOS Platform - Device Management Engine
 * Manages device profiles, hardware capabilities, assigned workspace defaults, floor areas, and printer routing.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';

class DeviceEngine {
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
    const devices = offlineStore.getCollection('devices') || [];
    const existingIndex = devices.findIndex(d => d.id === deviceId);

    const deviceRecord = {
      id: deviceId,
      name,
      deviceProfile,
      assignedWorkspace,
      assignedArea,
      assignedPrinterId,
      capabilities,
      allowedRoles,
      registeredAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      devices[existingIndex] = deviceRecord;
      offlineStore.setCollection('devices', devices);
    } else {
      offlineStore.appendItem('devices', deviceRecord);
    }

    platformEventBus.publish(PlatformEventTypes.DEVICE_REGISTERED, deviceRecord);

    return deviceRecord;
  }

  getDevice(deviceId) {
    const devices = offlineStore.getCollection('devices') || [];
    return devices.find(d => d.id === deviceId) || null;
  }

  hasCapability(deviceId, capabilityName) {
    const device = this.getDevice(deviceId);
    if (!device || !device.capabilities) return false;
    return !!device.capabilities[capabilityName];
  }

  getAllDevices() {
    return offlineStore.getCollection('devices') || [];
  }
}

export const deviceEngine = new DeviceEngine();
