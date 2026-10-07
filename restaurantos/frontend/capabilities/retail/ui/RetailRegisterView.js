/**
 * RestaurantOS Capability - Retail Cash Register & End-of-Day (Retail Phase 3)
 *
 * Thin RETAIL-01 wrapper over the shared `CashRegisterPanel` so the Retail
 * workspace and the Cashier workspace run the exact same till lifecycle
 * (open → verify float → live drawer → unsettled gate → close with variance).
 * The panel owns all presentation + wiring; this view only supplies the retail
 * register context and preserves the `render(container, session)` / `destroy()`
 * contract the RetailWorkspaceView expects for its cached section views.
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { cashRegisterModel } from '../../../../../businessos/platform/retail/cashRegisterModel.js';
import { cashBoxService } from '../../../../../businessos/platform/cashbox/cashBoxService.js';
import { CashRegisterPanel } from '../../common/ui/CashRegisterPanel.js';

const REGISTER = 'RETAIL-01';
const BUSINESS_UNIT = 'RETAIL';

export class RetailRegisterView {
  constructor(deps = {}) {
    this.deps = deps;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';
    this.panel = null;
  }

  render(container, session = null) {
    this.container = container;
    this.session = session || {};
    this.tenantId = this.session.tenantId || this.session.tenant_id || 'tenant_h0qc7wf';

    if (this.panel && typeof this.panel.destroy === 'function') {
      try { this.panel.destroy(); } catch (_) {}
    }

    this.panel = new CashRegisterPanel({
      platformEventBus: this.platformEventBus,
      cashRegisterModel: this.deps.cashRegisterModel || cashRegisterModel,
      cashBoxService: this.deps.cashBoxService || cashBoxService,
      businessUnit: BUSINESS_UNIT,
      registerId: REGISTER,
      tenantId: this.tenantId,
      session: this.session,
      labels: {
        title: '💵 Cash Register',
        subtitle: 'Every POS sale and refund already lands here automatically. This is the till: open it, manage cash, and reconcile at end-of-day.'
      }
    });

    this.panel.render(container, this.session);
    return container;
  }

  update() { if (this.panel) this.panel.update(); }

  destroy() {
    if (this.panel && typeof this.panel.destroy === 'function') {
      try { this.panel.destroy(); } catch (_) {}
    }
    this.panel = null;
  }
}
