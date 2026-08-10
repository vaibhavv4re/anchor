/**
 * BusinessOS Platform - Decoupled Identity Model & Helper Utilities
 * Manages security credentials, SHA-256 PIN hashing, and identity lookup.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

class IdentityModel {
  /**
   * Find an identity matching the provided 6-digit PIN.
   * @param {string} pin 
   * @returns {Promise<Object|null>}
   */
  async findByPin(pin) {
    const hashed = await hashPin(pin);
    const identities = offlineStore.getCollection('identities') || [];
    return identities.find(id => id.pinHash === hashed && id.status === 'ACTIVE') || null;
  }

  /**
   * Create a new Identity credentials record.
   */
  async createIdentity(pin) {
    const pinHash = await hashPin(pin);
    const newIdentity = {
      id: 'id_' + Math.random().toString(36).substring(2, 9),
      pinHash,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };

    offlineStore.appendItem('identities', newIdentity);
    return newIdentity;
  }

  /**
   * Reset PIN for an existing identity.
   */
  async resetPin(identityId, newPin) {
    const pinHash = await hashPin(newPin);
    const identities = offlineStore.getCollection('identities') || [];
    const updated = identities.map(id => id.id === identityId ? { ...id, pinHash } : id);
    offlineStore.setCollection('identities', updated);
  }

  /**
   * Disable an identity.
   */
  disableIdentity(identityId) {
    const identities = offlineStore.getCollection('identities') || [];
    const updated = identities.map(id => id.id === identityId ? { ...id, status: 'DISABLED' } : id);
    offlineStore.setCollection('identities', updated);
  }
}

export const identityModel = new IdentityModel();
