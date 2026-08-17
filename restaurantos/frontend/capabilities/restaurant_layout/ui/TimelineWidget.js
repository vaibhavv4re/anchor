/**
 * Capability Group 2 - Platform-Wide Operational Timeline Widget
 * Renders a chronological operational ledger of all restaurant business events.
 */

import { timelineLedger } from '../../../../../businessos/platform/timeline/timelineLedger.js';

export class TimelineWidget {
  constructor() {
    this.container = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.cssText = 'padding:var(--space-md); max-height:420px; overflow-y:auto; background:var(--bg-surface-1);';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const entries = timelineLedger.getTimelineEntries(30);

    const items = (Array.isArray(entries) && entries.length) ? entries.map(e => {
      const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const title = e.title || e.event_type || e.action || 'System Audit Event';
      const actor = e.actorName || e.user || e.actor || 'System Engine';
      const type = e.type || 'AUDIT';

      return `
        <div style="display:flex; gap:var(--space-md); padding:var(--space-xs) 0; border-bottom:1px solid var(--border-subtle);">
          <div style="font-size:0.75rem; color:var(--accent-primary); font-weight:600; width:55px;">${time}</div>
          <div style="flex:1; font-size:0.875rem;">
            <div style="font-weight:600;">${title}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${actor} • ${type}</div>
          </div>
        </div>
      `;
    }).join('') : `<div style="color:var(--text-muted); font-size:0.875rem; text-align:center; padding:var(--space-md);">No timeline activity logged yet today.</div>`;

    this.container.innerHTML = `
      <div style="font-size:0.875rem; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:var(--space-sm);">
        📜 Operational Timeline Ledger
      </div>
      <div>
        ${items}
      </div>
    `;
  }
}
