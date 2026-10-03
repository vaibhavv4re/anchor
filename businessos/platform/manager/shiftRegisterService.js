/**
 * BusinessOS Platform - Shift Register Service (Manager Cockpit revamp)
 *
 * Minimal, honest persistence for the two things a real manager must capture
 * that the rest of the system never did: the opening cash float and the closing
 * physical cash count. Cash-drawer variance is derived from these rows, so it
 * can finally be non-zero instead of a hardcoded "Balanced".
 *
 * Storage: device-local `offlineStore` collection `shift_registers`. There is no
 * Supabase table for this yet, so the Manager views label the panel as local and
 * it is NOT part of the realtime set. This is a deliberate, flagged boundary —
 * provisioning `shift_registers` in the cloud is a follow-up, not a silent gap.
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
    this._audit(reg, 'CASH_COUNT', `Physical cash counted ₹${value}`, actor, t);
    return list.find(r => r.id === reg.id);
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
    this._audit(reg, 'SHIFT_HANDOVER', `Handover note: ${notes || '(none)'}`, actor, t);
    return list.find(r => r.id === reg.id);
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
    this._audit(reg, 'SHIFT_CLOSE', 'Shift register closed', actor, t);
    return list.find(r => r.id === reg.id);
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
