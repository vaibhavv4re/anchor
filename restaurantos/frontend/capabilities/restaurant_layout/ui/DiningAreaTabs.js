/**
 * Capability Group 2 - Dining Area Tabs Component
 * Tab bar for switching between dining zones (Main Hall, Outdoor Patio, VIP Lounge, Bar Counter).
 */

import { diningAreaModel } from '../../../../../businessos/platform/layout/diningAreaModel.js';

export class DiningAreaTabs {
  constructor({ activeAreaId, onSelectArea }) {
    this.activeAreaId = activeAreaId;
    this.onSelectArea = onSelectArea;
    this.container = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'dining-area-tabs flex gap-sm';
    this.container.style.cssText = 'border-bottom:1px solid var(--border-subtle); margin-bottom:var(--space-lg); padding-bottom:var(--space-xs);';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const areas = diningAreaModel.getAllAreas();

    this.container.innerHTML = areas.map(area => `
      <button class="area-tab ${area.id === this.activeAreaId ? 'active' : ''}" data-area-id="${area.id}">
        <span class="area-dot" style="background-color:${area.color};"></span>
        ${area.name}
      </button>
    `).join('') + `
      <style>
        .area-tab {
          padding: 8px 16px;
          border-radius: var(--radius-md);
          font-size: var(--font-size-sm);
          font-weight: 500;
          color: var(--text-muted);
          background-color: var(--bg-surface-1);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all var(--transition-fast);
        }
        .area-tab:hover, .area-tab.active {
          background-color: var(--bg-surface-2);
          color: var(--text-primary);
          border-color: var(--accent-primary);
        }
        .area-dot {
          width: 10px;
          height: 10px;
          border-radius: var(--radius-full);
          display: inline-block;
        }
      </style>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const tabs = this.container.querySelectorAll('.area-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const areaId = tab.dataset.areaId;
        this.activeAreaId = areaId;
        this.updateContent();
        if (this.onSelectArea) this.onSelectArea(areaId);
      });
    });
  }
}
