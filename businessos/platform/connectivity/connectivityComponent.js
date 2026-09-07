/**
 * BusinessOS Platform - Connectivity UI Component & Drawer (Contract v1.0)
 *
 * Renders the persistent platform-wide connectivity banner, header status badge,
 * and detailed Connection Status inspection modal across all RestaurantOS workspaces.
 */

import { connectivityManager, NetworkStates, SyncStates, DataSources } from './connectivityManager.js';

export class ConnectivityComponent {
  constructor(options = {}) {
    this.connectivityManager = options.connectivityManager || connectivityManager;
    this.bannerEl = null;
    this.badgeEl = null;
    this.modalEl = null;
    this.isBannerDismissed = false;
    this.unsubscribe = null;
  }

  mount(headerMount, bannerMount) {
    if (!headerMount && !bannerMount) return;

    this.unsubscribe = this.connectivityManager.subscribe((diag) => {
      this.updateUI(diag, headerMount, bannerMount);
    });
  }

  destroy() {
    if (typeof this.unsubscribe === 'function') {
      this.unsubscribe();
    }
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
  }

  updateUI(diag, headerMount, bannerMount) {
    if (headerMount) {
      headerMount.innerHTML = this.renderBadgeHTML(diag);
      const badgeBtn = headerMount.querySelector('.connectivity-badge-btn');
      if (badgeBtn) {
        badgeBtn.addEventListener('click', () => this.openStatusModal(diag));
      }
    }

    if (bannerMount) {
      if (diag.networkState === NetworkStates.OFFLINE) {
        if (!this.isBannerDismissed) {
          bannerMount.style.display = 'block';
          const subtitle = diag.pendingSyncCount > 0
            ? 'RestaurantOS is offline. Your changes are saved locally and will synchronize when the connection is restored.'
            : "RestaurantOS is offline. You're viewing the latest data available on this device.";

          bannerMount.innerHTML = `
            <div class="connectivity-banner banner-offline" style="background:#7f1d1d; color:#fee2e2; padding:10px 20px; border-bottom:1px solid #991b1b; font-family:sans-serif; box-shadow:0 2px 8px rgba(0,0,0,0.3);">
              <div style="display:flex; align-items:center; justify-content:space-between; max-width:1400px; margin:0 auto; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <span style="font-size:1.25rem;">🔴</span>
                  <div>
                    <strong style="font-size:0.95rem; color:#ffffff;">You're offline</strong>
                    <div style="font-size:0.85rem; color:#fca5a5; margin-top:2px;">
                      ${subtitle}
                    </div>
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                  <button class="btn-inspect-connectivity" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); color:#ffffff; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:0.8rem; font-weight:600; transition:all 0.2s;">
                    🔍 Inspect Details
                  </button>
                  <button class="btn-dismiss-banner" style="background:none; border:none; color:#fca5a5; font-size:1.25rem; cursor:pointer; padding:0 6px;" title="Dismiss banner">✕</button>
                </div>
              </div>
            </div>
          `;

          const inspectBtn = bannerMount.querySelector('.btn-inspect-connectivity');
          if (inspectBtn) {
            inspectBtn.addEventListener('click', () => this.openStatusModal(diag));
          }

          const dismissBtn = bannerMount.querySelector('.btn-dismiss-banner');
          if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
              this.isBannerDismissed = true;
              bannerMount.style.display = 'none';
            });
          }
        }
      } else if (diag.syncState === SyncStates.SYNCING) {
        this.isBannerDismissed = false;
        bannerMount.style.display = 'block';
        bannerMount.innerHTML = `
          <div class="connectivity-banner banner-syncing" style="background:#78350f; color:#fef3c7; padding:10px 20px; border-bottom:1px solid #92400e; font-family:sans-serif;">
            <div style="display:flex; align-items:center; justify-content:space-between; max-width:1400px; margin:0 auto; flex-wrap:wrap; gap:10px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:1.25rem; display:inline-block; animation:spin 1s linear infinite;">🟡</span>
                <div>
                  <strong style="font-size:0.95rem; color:#ffffff;">Reconnecting & Synchronizing...</strong>
                  <div style="font-size:0.85rem; color:#fde68a; margin-top:2px;">
                    Connection restored. Synchronizing pending changes with RestaurantOS...
                  </div>
                </div>
              </div>
              <button class="btn-inspect-connectivity" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); color:#ffffff; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:0.8rem; font-weight:600;">
                🔍 Inspect Details
              </button>
            </div>
          </div>
        `;
        const inspectBtn = bannerMount.querySelector('.btn-inspect-connectivity');
        if (inspectBtn) {
          inspectBtn.addEventListener('click', () => this.openStatusModal(diag));
        }
      } else if (diag.syncState === SyncStates.SYNC_ATTENTION) {
        this.isBannerDismissed = false;
        bannerMount.style.display = 'block';
        bannerMount.innerHTML = `
          <div class="connectivity-banner banner-attention" style="background:#991b1b; color:#fee2e2; padding:10px 20px; border-bottom:1px solid #b91c1c; font-family:sans-serif;">
            <div style="display:flex; align-items:center; justify-content:space-between; max-width:1400px; margin:0 auto; flex-wrap:wrap; gap:10px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:1.25rem;">🔴</span>
                <div>
                  <strong style="font-size:0.95rem; color:#ffffff;">Sync attention required</strong>
                  <div style="font-size:0.85rem; color:#fca5a5; margin-top:2px;">
                    Some offline changes could not be synchronized with RestaurantOS.
                  </div>
                </div>
              </div>
              <button class="btn-inspect-connectivity" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); color:#ffffff; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:0.8rem; font-weight:600;">
                🔍 Inspect Details
              </button>
            </div>
          </div>
        `;
        const inspectBtn = bannerMount.querySelector('.btn-inspect-connectivity');
        if (inspectBtn) {
          inspectBtn.addEventListener('click', () => this.openStatusModal(diag));
        }
      } else {
        // ONLINE & IDLE
        this.isBannerDismissed = false;
        bannerMount.style.display = 'none';
        bannerMount.innerHTML = '';
      }
    }
  }

  renderBadgeHTML(diag) {
    let badgeStyle = 'background:rgba(16, 185, 129, 0.15); color:#10b981; border:1px solid rgba(16, 185, 129, 0.3);';
    let label = '🟢 Online';

    if (diag.networkState === NetworkStates.OFFLINE) {
      badgeStyle = 'background:rgba(239, 68, 68, 0.2); color:#f87171; border:1px solid rgba(239, 68, 68, 0.4);';
      if (diag.pendingSyncCount > 0) {
        label = `🔴 Offline · ${diag.pendingSyncCount} pending ${diag.pendingSyncCount === 1 ? 'change' : 'changes'}`;
      } else {
        label = '🔴 Offline · Local Data';
      }
    } else if (diag.syncState === SyncStates.SYNCING) {
      badgeStyle = 'background:rgba(245, 158, 11, 0.2); color:#fbbf24; border:1px solid rgba(245, 158, 11, 0.4);';
      label = '🟡 Syncing...';
    } else if (diag.syncState === SyncStates.SYNC_ATTENTION) {
      badgeStyle = 'background:rgba(239, 68, 68, 0.25); color:#fca5a5; border:1px solid #ef4444;';
      label = `🔴 Sync Attention (${diag.pendingSyncCount})`;
    }

    return `
      <button class="connectivity-badge-btn" style="${badgeStyle} padding:6px 12px; border-radius:20px; font-weight:600; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.2s;" title="Click to view Connection Status">
        ${label}
      </button>
    `;
  }

  openStatusModal(diag = null) {
    const currentDiag = diag || this.connectivityManager.getDiagnostics();
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }

    const formattedTime = currentDiag.lastCloudSyncTimestamp
      ? new Date(currentDiag.lastCloudSyncTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : 'Not yet synchronized in this session';

    let statusBadge = '<span style="background:#064e3b; color:#34d399; padding:4px 10px; border-radius:12px; font-weight:700; font-size:0.85rem;">🟢 ONLINE</span>';
    let dataSrcLabel = 'SUPABASE';
    let dataSrcSub = 'Cloud Authoritative';
    let syncStatusText = 'All changes synchronized';
    let whatNextText = 'All operational reads and writes are interacting live with Supabase cloud. Changes are instantly persisted across devices.';

    if (currentDiag.networkState === NetworkStates.OFFLINE) {
      statusBadge = '<span style="background:#7f1d1d; color:#fca5a5; padding:4px 10px; border-radius:12px; font-weight:700; font-size:0.85rem;">🔴 OFFLINE</span>';
      dataSrcLabel = 'LOCAL_CACHE';
      dataSrcSub = 'Offline Snapshot';
      syncStatusText = currentDiag.pendingSyncCount > 0 ? `${currentDiag.pendingSyncCount} changes queued for sync` : 'No pending offline changes';
      whatNextText = currentDiag.pendingSyncCount > 0
        ? 'Changes saved offline will be synchronized when the connection is restored.'
        : 'You are viewing locally cached data on this device. Create operations will be queued locally until reconnected.';
    } else if (currentDiag.syncState === SyncStates.SYNCING) {
      statusBadge = '<span style="background:#78350f; color:#fde68a; padding:4px 10px; border-radius:12px; font-weight:700; font-size:0.85rem;">🟡 RECONNECTING</span>';
      dataSrcLabel = 'SUPABASE / Transition';
      dataSrcSub = 'Synchronizing Domain Collections';
      syncStatusText = 'Synchronizing in progress...';
      whatNextText = 'Network connection has been restored. DataGateway is refreshing domain collections and flushing legitimate offline sync queues to Supabase.';
    } else if (currentDiag.syncState === SyncStates.SYNC_ATTENTION) {
      statusBadge = '<span style="background:#7f1d1d; color:#fca5a5; padding:4px 10px; border-radius:12px; font-weight:700; font-size:0.85rem;">🔴 ATTENTION</span>';
      dataSrcLabel = 'SUPABASE';
      dataSrcSub = 'Sync Discrepancy Detected';
      syncStatusText = `${currentDiag.pendingSyncCount} sync items require attention`;
      whatNextText = 'One or more offline journal operations could not be applied automatically. Inspect offline journal for details.';
    }

    const isSyncDisabled = currentDiag.networkState === NetworkStates.OFFLINE;

    this.modalEl = document.createElement('div');
    this.modalEl.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(4px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;';
    this.modalEl.innerHTML = `
      <div style="background:#1e293b; color:#f8fafc; border:1px solid #334155; border-radius:12px; width:100%; max-width:520px; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5); font-family:sans-serif;">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding-bottom:14px; margin-bottom:18px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:1.5rem;">📡</span>
            <div>
              <h3 style="margin:0; font-size:1.15rem; font-weight:700; color:#f8fafc;">Connection Status</h3>
              <div style="font-size:0.8rem; color:#94a3b8; margin-top:2px;">BusinessOS Platform Data Gateway & Realtime Sync</div>
            </div>
          </div>
          <button class="btn-close-modal" style="background:none; border:none; color:#94a3b8; font-size:1.4rem; cursor:pointer; padding:4px 8px;">✕</button>
        </div>

        <!-- Details Grid -->
        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:12px 16px; border-radius:8px; border:1px solid #1e293b;">
            <span style="font-size:0.875rem; color:#94a3b8;">Connection Status</span>
            ${statusBadge}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:12px 16px; border-radius:8px; border:1px solid #1e293b;">
            <span style="font-size:0.875rem; color:#94a3b8;">Data Source</span>
            <div style="text-align:right;">
              <div style="font-size:0.875rem; font-weight:700; color:#f1f5f9;">${dataSrcLabel}</div>
              <div style="font-size:0.75rem; color:#94a3b8;">${dataSrcSub}</div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:12px 16px; border-radius:8px; border:1px solid #1e293b;">
            <span style="font-size:0.875rem; color:#94a3b8;">Last Cloud Sync</span>
            <span style="font-size:0.875rem; font-weight:600; color:#f1f5f9;">${formattedTime}</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:12px 16px; border-radius:8px; border:1px solid #1e293b;">
            <span style="font-size:0.875rem; color:#94a3b8;">Pending Offline Changes</span>
            <span style="font-size:0.875rem; font-weight:700; color:${currentDiag.pendingSyncCount > 0 ? '#fbbf24' : '#34d399'};">
              ${currentDiag.pendingSyncCount}
            </span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:12px 16px; border-radius:8px; border:1px solid #1e293b;">
            <span style="font-size:0.875rem; color:#94a3b8;">Sync Status</span>
            <span style="font-size:0.875rem; font-weight:600; color:#38bdf8;">${syncStatusText}</span>
          </div>
        </div>

        <!-- Operational Info Box -->
        <div style="background:rgba(59, 130, 246, 0.1); border:1px solid rgba(59, 130, 246, 0.3); border-radius:8px; padding:14px; margin-bottom:20px;">
          <div style="font-size:0.8rem; font-weight:700; color:#60a5fa; text-transform:uppercase; margin-bottom:4px;">WHAT HAPPENS NEXT</div>
          <div style="font-size:0.85rem; color:#dbeafe; line-height:1.4;">
            ${whatNextText}
          </div>
        </div>

        <!-- Footer Actions -->
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <button class="btn-force-sync" ${isSyncDisabled ? 'disabled title="Sync Now is unavailable while offline"' : ''} style="background:${isSyncDisabled ? '#475569' : '#2563eb'}; color:${isSyncDisabled ? '#94a3b8' : '#ffffff'}; border:none; padding:10px 18px; border-radius:6px; font-weight:600; font-size:0.875rem; cursor:${isSyncDisabled ? 'not-allowed' : 'pointer'}; display:flex; align-items:center; gap:8px;">
            ↻ Sync Now
          </button>
          <button class="btn-close-modal-footer" style="background:#334155; color:#f8fafc; border:none; padding:10px 18px; border-radius:6px; font-weight:600; font-size:0.875rem; cursor:pointer;">
            Close
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);

    const closeBtns = this.modalEl.querySelectorAll('.btn-close-modal, .btn-close-modal-footer');
    closeBtns.forEach(b => b.addEventListener('click', () => {
      if (this.modalEl && this.modalEl.parentNode) {
        this.modalEl.parentNode.removeChild(this.modalEl);
      }
    }));

    const forceSyncBtn = this.modalEl.querySelector('.btn-force-sync');
    if (forceSyncBtn && !isSyncDisabled) {
      forceSyncBtn.addEventListener('click', async () => {
        forceSyncBtn.disabled = true;
        forceSyncBtn.innerHTML = '↻ Syncing...';
        this.connectivityManager.notifySyncStart();

        if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
          const dg = window.__APP__.platform.dataGateway;
          try {
            await dg.hydrateCollections([
              'inventory', 'suppliers', 'purchase_orders', 'goods_receipt_notes',
              'inventory_categories', 'inventory_uoms', 'orders', 'table_sessions',
              'bill_revisions', 'invoices', 'payments'
            ], currentDiag.tenantId);
            this.connectivityManager.notifySyncComplete({ success: true, timestamp: new Date().toISOString() });
          } catch (err) {
            this.connectivityManager.notifySyncComplete({ success: false });
          }
        } else {
          setTimeout(() => {
            this.connectivityManager.notifySyncComplete({ success: true, timestamp: new Date().toISOString() });
          }, 800);
        }

        setTimeout(() => {
          if (this.modalEl && this.modalEl.parentNode) {
            this.openStatusModal();
          }
        }, 500);
      });
    }
  }
}
