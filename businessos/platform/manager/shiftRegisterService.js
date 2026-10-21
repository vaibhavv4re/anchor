/**
 * BusinessOS Platform - Shift Register Service (Manager Cockpit revamp)
 *
 * Minimal, honest persistence for the two things a real manager must capture
 * that the rest of the system never did: the opening cash float and the closing
 * physical cash count. Cash-drawer variance is derived from these rows, so it
 * can finally be non-zero instead of a hardcoded "Balanced".
 *
 * Storage: `offlineStore` collection `shift_registers` as the always-available
 * local cache, mirrored write-through to the Supabase `shift_registers` table
 * via the DataGateway (create/update) so a register opened on one screen is
 * visible on every other screen. When the cloud table is not yet provisioned or
 * the device is offline, DataGateway queues the write and the local path keeps
 * working unchanged (cache-first reads).
 *
 * Every mutation also writes an append-only trace through sessionAuditModel so
 * "who opened / counted / handed over" is auditable.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { sessionAuditModel } from '../session/sessionAuditModel.js';

const COLLECTION = 'shift_registers';

function readSession() {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    return JSON.parse(sessionStorage.getItem('ros_session') || '{}') || {};
  } catch (_) {
    return {};
  }
}

class ShiftRegisterService {
  _tenantId(tenantId = null) {
    if (tenantId) return tenantId;
    return readSession().tenantId || 'tenant_h0qc7wf';
  }

  _all(tenantId) {
    return offlineStore.getCollection(COLLECTION) || [];
  }

  _save(list) {
    offlineStore.setCollection(COLLECTION, list);
    platformEventBus.publish('shift:register:updated', { source: 'shiftRegister' });
  }

  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway;
    }
    return null;
  }

  // Fire-and-forget write-through. DataGateway owns offline queueing/retry, so
  // we never block the synchronous local path and never double-write a journal
  // row here (the gateway mirrors into offline_journal internally).
  _mirrorCreate(record) {
    const dg = this._getDataGateway();
    if (!dg || typeof dg.create !== 'function') return;
    Promise.resolve(dg.create(COLLECTION, record)).catch(e =>
      console.warn('[shiftRegisterService] cloud create mirror failed:', e.message));
  }

  _mirrorUpdate(record) {
    const dg = this._getDataGateway();
    if (!dg || typeof dg.update !== 'function' || !record || !record.id) return;
    Promise.resolve(dg.update(COLLECTION, record.id, record)).catch(e =>
      console.warn('[shiftRegisterService] cloud update mirror failed:', e.message));
  }

  /** The OPEN register for this tenant, or null if none has been opened. */
  getActiveRegister(tenantId = null) {
    const t = this._tenantId(tenantId);
    const open = this._all(t)
      .filter(r => r && (r.tenantId === t) && r.status === 'OPEN')
      .sort((a, b) => new Date(b.openedAt || 0) - new Date(a.openedAt || 0));
    return open[0] || null;
  }

  /** Most recent register (open or closed) — used for the handover snapshot. */
  getLatestRegister(tenantId = null) {
    const t = this._tenantId(tenantId);
    const rows = this._all(t)
      .filter(r => r && r.tenantId === t)
      .sort((a, b) => new Date(b.openedAt || 0) - new Date(a.openedAt || 0));
    return rows[0] || null;
  }

  openRegister({ tenantId = null, openingFloat = 0, openedBy = null } = {}) {
    const t = this._tenantId(tenantId);
    const s = readSession();
    const actor = openedBy || s.employeeName || s.employeeId || 'Manager';
    // Only one OPEN register at a time.
    if (this.getActiveRegister(t)) return this.getActiveRegister(t);

    const record = {
      id: 'shift_' + Math.random().toString(36).substring(2, 9),
      tenantId: t,
      status: 'OPEN',
      openingFloat: Math.round((parseFloat(openingFloat) || 0) * 100) / 100,
      openedAt: new Date().toISOString(),
      openedBy: actor,
      countedCash: null,
      countedAt: null,
      countedBy: null,
      handoverNotes: '',
      closedAt: null,
      closedBy: null
    };

    const list = this._all(t).slice();
    list.push(record);
    this._save(list);
    this._mirrorCreate(record);
    this._audit(record, 'SHIFT_OPEN', `Opening float ₹${record.openingFloat} registered`, actor, t);
    return record;
  }

  /** Record the physical cash counted in the drawer (drives variance). */
  recordCashCount({ tenantId = null, countedCash = 0, countedBy = null } = {}) {
    const t = this._tenantId(tenantId);
    const s = readSession();
    const actor = countedBy || s.employeeName || s.employeeId || 'Manager';
    const reg = this.getActiveRegister(t);
    if (!reg) return null;

    const value = Math.round((parseFloat(countedCash) || 0) * 100) / 100;
    const list = this._all(t).map(r =>
      r.id === reg.id ? { ...r, countedCash: value, countedAt: new Date().toISOString(), countedBy: actor } : r
    );
    this._save(list);
    const updated = list.find(r => r.id === reg.id);
    this._mirrorUpdate(updated);
    this._audit(reg, 'CASH_COUNT', `Physical cash counted ₹${value}`, actor, t);
    return updated;
  }

  /** Persist shift-handover notes onto the active register. */
  recordHandover({ tenantId = null, notes = '', by = null } = {}) {
    const t = this._tenantId(tenantId);
    const s = readSession();
    const actor = by || s.employeeName || s.employeeId || 'Manager';
    const reg = this.getActiveRegister(t);
    if (!reg) return null;

    const list = this._all(t).map(r =>
      r.id === reg.id ? { ...r, handoverNotes: notes, handoverAt: new Date().toISOString(), handoverBy: actor } : r
    );
    this._save(list);
    const updated = list.find(r => r.id === reg.id);
    this._mirrorUpdate(updated);
    this._audit(reg, 'SHIFT_HANDOVER', `Handover note: ${notes || '(none)'}`, actor, t);
    return updated;
  }

  closeRegister({ tenantId = null, countedCash = null, notes = '', closedBy = null } = {}) {
    const t = this._tenantId(tenantId);
    const s = readSession();
    const actor = closedBy || s.employeeName || s.employeeId || 'Manager';
    const reg = this.getActiveRegister(t);
    if (!reg) return null;

    const now = new Date().toISOString();
    const value = countedCash === null ? reg.countedCash : Math.round((parseFloat(countedCash) || 0) * 100) / 100;
    const list = this._all(t).map(r =>
      r.id === reg.id
        ? { ...r, status: 'CLOSED', countedCash: value, countedAt: value === null ? r.countedAt : now, closedAt: now, closedBy: actor, handoverNotes: notes || r.handoverNotes }
        : r
    );
    this._save(list);
    const updated = list.find(r => r.id === reg.id);
    this._mirrorUpdate(updated);
    this._audit(reg, 'SHIFT_CLOSE', 'Shift register closed', actor, t);
    return updated;
  }

  _audit(register, eventType, description, actorName, tenantId) {
    try {
      sessionAuditModel.logEvent({
        sessionId: `shift_register:${register.id}`,
        eventType,
        actorId: actorName,
        actorName,
        actorRole: 'MANAGER',
        description,
        metadata: { registerId: register.id },
        tenantId
      });
    } catch (_) {
      // Audit is best-effort; the register row is the source of truth.
    }
  }
}

export const shiftRegisterService = new ShiftRegisterService();
