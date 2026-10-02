/**
 * Capability Group 5 - Official Tax Invoice Browser Print Modal
 * Generates an official GST Tax Invoice print preview populated dynamically from TenantModel config & InvoiceModel.
 * ZERO financial state mutation on preview (toggling/printing never consumes invoice
 * numbers or alters payments until the cashier actually issues a split, which is done
 * once via the injected onIssueSplit callback on the print action).
 */

import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';
import { billRevisionModel } from '../../../../../businessos/platform/billing/billRevisionModel.js';
import { invoiceModel } from '../../../../../businessos/platform/billing/invoiceModel.js';
import { paymentModel } from '../../../../../businessos/platform/billing/paymentModel.js';
import { tenantModel } from '../../../../../businessos/platform/tenant/tenantModel.js';
import { taxConfigurationModel } from '../../../../../businessos/platform/accounting/taxConfigurationModel.js';

export class TaxInvoicePrintModal {
  constructor({ sessionId, revisionIndex = null, onClose = null, onIssueSplit = null }) {
    this.sessionId = sessionId;
    this.revisionIndex = revisionIndex;
    this.onClose = onClose;
    // Cashier-provided callback: idempotently issues the Food/Bar split invoice
    // pair and returns { foodInvoice, barInvoice, combinedGrandTotal }.
    this.onIssueSplit = onIssueSplit;
    this.modalEl = null;
    this.splitMode = false;
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'lock-screen-overlay animate-fade-in';
    this.modalEl.style.zIndex = '999999';
    this.modalEl.style.display = 'flex';
    this.modalEl.style.alignItems = 'center';
    this.modalEl.style.justifyContent = 'center';

    // Pre-select split when the tenant configured it as their default workflow.
    try {
      const barCfg = taxConfigurationModel.getBarBillingConfig();
      this.splitMode = !!(barCfg && barCfg.splitByDefault);
    } catch (_) { this.splitMode = false; }

    this.modalEl.innerHTML = `
      <div class="card animate-fade-in printable-invoice-card" style="max-width:560px; width:92%; max-height:92vh; display:flex; flex-direction:column; padding:0; overflow:hidden; background:#ffffff; color:#000000; border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.4);">

        <!-- PRINT/ACTION HEADER BAR -->
        <div style="background:#1e293b; color:#ffffff; padding:12px 20px; display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:700; font-size:0.9rem; display:flex; align-items:center; gap:8px;">
            <span>🖨️</span> Invoice Print Preview
          </div>
          <div style="display:flex; gap:10px;">
            <button id="btn-do-browser-print" class="btn-primary" style="padding:6px 14px; font-weight:700; font-size:0.85rem; background:#10b981; color:#000; border:none; cursor:pointer;">
              🖨️ Print Now
            </button>
            <button id="btn-close-print-modal" class="btn-secondary" style="padding:6px 12px; font-weight:700; font-size:0.85rem; background:#334155; color:#fff; border:none; cursor:pointer;">
              ✕ Close
            </button>
          </div>
        </div>

        <!-- BILL LAYOUT TOGGLE (combined vs split) -->
        <div id="bill-mode-toggle" style="background:#f1f5f9; padding:10px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid #cbd5e1; flex-wrap:wrap;">
          <span style="font-size:0.8rem; font-weight:700; color:#334155;">Guest bill layout:</span>
          <div style="display:flex; gap:8px;">
            <button type="button" id="btn-mode-combined" class="mode-btn" style="padding:6px 12px; font-weight:700; font-size:0.8rem; border-radius:6px; cursor:pointer; border:1px solid #0f172a; background:#0f172a; color:#fff;">One consolidated bill</button>
            <button type="button" id="btn-mode-split" class="mode-btn" style="padding:6px 12px; font-weight:700; font-size:0.8rem; border-radius:6px; cursor:pointer; border:1px solid #cbd5e1; background:#fff; color:#0f172a;">Split Food &amp; Bar bills</button>
          </div>
        </div>

        <!-- DOCUMENTS SCROLL AREA -->
        <div id="invoice-docs" style="flex:1; overflow-y:auto; padding:20px; font-family:'Courier New', Courier, monospace; color:#000000; background:#ffffff;"></div>
      </div>
    `;

    this.bindEvents();
    this.paintDocuments();
    return this.modalEl;
  }

  /**
   * Gather the authoritative bill data once. The engine's fiscalSections drive
   * the Food(GST)/Bar(VAT) grouping; the UI never re-classifies any line.
   */
  _readModel() {
    const proj = sessionProjectionService.getSessionProjection(this.sessionId);
    const revisions = billRevisionModel.getRevisionsForSession(this.sessionId);
    const latestRev = revisions.length > 0 ? revisions[revisions.length - 1] : null;
    const invoice = invoiceModel.getInvoiceForSession(this.sessionId);
    const payment = paymentModel.getPaymentForSession(this.sessionId);

    const activeRev = (this.revisionIndex !== null && revisions[this.revisionIndex])
      ? revisions[this.revisionIndex]
      : latestRev;

    const tenant = tenantModel.getPrimaryTenant() || {};
    const restaurantName = tenant.name || 'Anchor Bistro & Cafe';
    const gstin = tenant.gstin || '27AAAAA0000A1Z5';
    const fssai = tenant.fssaiLicenseNo || '12421008000123';
    const address = tenant.address || 'Shop 4 & 5, Ocean Heights, Carter Road, Bandra West, Mumbai 400050';
    const phone = tenant.phone || '+91 98200 12345';

    const tableNo = proj ? proj.tableNumber : (activeRev ? activeRev.tableNumber : 1);
    const tableCode = proj ? proj.tableCode : (activeRev ? activeRev.tableCode : 'T-01');
    const waiterName = proj ? proj.waiter.name : (activeRev ? activeRev.waiterName : 'Staff');

    const items = activeRev ? activeRev.items : (proj ? proj.itemizedList : []);
    const grossSales = parseFloat(activeRev ? (activeRev.grossSales || activeRev.subtotal) : (invoice ? (invoice.grossSales || invoice.grandTotal) : (proj ? proj.subtotal : 0))) || 0;
    const discountsTotal = parseFloat(activeRev ? (activeRev.discountsTotal || activeRev.discounts || 0) : (invoice ? (invoice.discountsTotal || 0) : 0)) || 0;
    const discountRecords = activeRev ? (activeRev.discountRecords || []) : [];
    const taxableAmount = parseFloat(activeRev && activeRev.taxableAmount !== undefined ? activeRev.taxableAmount : (invoice && invoice.taxableAmount !== undefined ? invoice.taxableAmount : (grossSales - discountsTotal))) || 0;

    const taxLines = activeRev ? (activeRev.taxLines || []) : [];
    const charges = activeRev ? (activeRev.charges || []) : [];
    const serviceCharge = parseFloat(activeRev ? activeRev.serviceChargeAmount : (invoice ? (invoice.serviceChargeAmount || 0) : 0)) || 0;
    const grandTotal = parseFloat(activeRev ? activeRev.grandTotal : (invoice ? invoice.grandTotal : (proj ? proj.grandTotal : 0))) || 0;

    const fiscalSections = (activeRev && Array.isArray(activeRev.fiscalSections) && activeRev.fiscalSections.length)
      ? activeRev.fiscalSections
      : (invoice && Array.isArray(invoice.fiscalSections) && invoice.fiscalSections.length)
        ? invoice.fiscalSections
        : (proj && Array.isArray(proj.fiscalSections) ? proj.fiscalSections : []);

    const invoiceNo = invoice ? invoice.invoiceNumber : (payment ? payment.invoiceNumber : (activeRev && activeRev.invoiceNumber ? activeRev.invoiceNumber : 'DRAFT PREVIEW'));
    const isPaid = payment !== null;

    return { restaurantName, gstin, fssai, address, phone, tableNo, tableCode, waiterName, items, grossSales, discountsTotal, discountRecords, taxableAmount, taxLines, charges, serviceCharge, grandTotal, fiscalSections, invoiceNo, isPaid };
  }

  /** Section grouping of line items for the item table. */
  _itemsTableHtml(model, sections) {
    const secs = (sections || []).filter(s => s && Array.isArray(s.items) && s.items.length);
    if (!secs.length) {
      return `<tbody>${(model.items || []).map(it => `
        <tr>
          <td style="padding:4px 0; font-weight:700;">${it.name || it.itemName}</td>
          <td style="padding:4px 0; text-align:center;">${it.quantity || 1}</td>
          <td style="padding:4px 0; text-align:right;">${(it.price || 0).toFixed(2)}</td>
          <td style="padding:4px 0; text-align:right; font-weight:700;">${(it.lineTotal || (it.price * it.quantity)).toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>`;
    }
    return `<tbody>${secs.map(s => `
      <tr><td colspan="4" style="padding:6px 0 2px; font-weight:900; text-transform:uppercase; border-bottom:1px solid #000;">${s.label || s.section}</td></tr>
      ${s.items.map(it => `
        <tr>
          <td style="padding:4px 0; font-weight:700;">${it.name || it.itemName}</td>
          <td style="padding:4px 0; text-align:center;">${it.quantity}</td>
          <td style="padding:4px 0; text-align:right;">${(it.price || 0).toFixed(2)}</td>
          <td style="padding:4px 0; text-align:right; font-weight:700;">${(it.lineTotal || (it.price * it.quantity)).toFixed(2)}</td>
        </tr>`).join('')}
      <tr><td colspan="3" style="padding:2px 0; text-align:right; font-weight:700;">${s.section === 'BAR' ? 'BAR' : 'FOOD'} Subtotal:</td><td style="padding:2px 0; text-align:right; font-weight:700;">${(s.subtotal || 0).toFixed(2)}</td></tr>
    `).join('')}
    </tbody>`;
  }

  /**
   * Build one bill document. Used for the consolidated bill (all sections, the
   * combined totals) and, in split mode, for a single section (its own totals +
   * the shared combined amount payable for reconciliation across the two slips).
   */
  _buildDoc(o) {
    const {
      name, gstin, fssai, address, phone, licence, title, invoiceNo, isDraft,
      tableNo, tableCode, waiterName, isPaid,
      sections, items, grossSales, discountsTotal, discountRecords, taxableAmount,
      taxLines, charges, serviceCharge, docTotal, combinedTotal, crossRef
    } = o;

    const itemRows = (sections && sections.length) ? this._itemsTableHtml({ items }, sections) : this._itemsTableHtml({ items }, []);

    return `
      <div class="invoice-print-doc" data-print-doc="1" style="border:1px solid #000; padding:20px; margin:0 auto 16px; max-width:480px; line-height:1.4;">

        <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:12px; margin-bottom:12px;">
          <div style="font-size:1.3rem; font-weight:900; letter-spacing:1px; text-transform:uppercase;">${name}</div>
          <div style="font-size:0.8rem;">${address || ''}</div>
          <div style="font-size:0.8rem; font-weight:700;">TEL: ${phone || ''}</div>
          <div style="font-size:0.8rem; font-weight:700; margin-top:4px;">GSTIN: ${gstin || ''}${fssai ? ' • FSSAI: ' + fssai : ''}${licence ? '<br/>EXCISE LICENCE: ' + licence : ''}</div>
          <div style="font-size:1rem; font-weight:800; text-transform:uppercase; margin-top:8px; border:1px solid #000; display:inline-block; padding:2px 10px;">
            ${isDraft ? 'DRAFT ' + title : title}
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:0.8rem; border-bottom:1px dashed #000; padding-bottom:8px; margin-bottom:12px;">
          <div>
            <div><strong>INVOICE NO:</strong> ${invoiceNo}</div>
            <div><strong>TABLE:</strong> Table ${tableNo} (${tableCode})</div>
            <div><strong>WAITER:</strong> ${waiterName}</div>
          </div>
          <div style="text-align:right;">
            <div><strong>DATE:</strong> ${new Date().toLocaleDateString('en-IN')}</div>
            <div><strong>TIME:</strong> ${new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}</div>
            <div><strong>STATUS:</strong> ${isPaid ? 'PAID / SETTLED' : 'UNPAID'}</div>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:0.8rem; margin-bottom:12px;">
          <thead>
            <tr style="border-bottom:1px solid #000; text-align:left;">
              <th style="padding:4px 0;">ITEM DESCRIPTION</th>
              <th style="padding:4px 0; text-align:center;">QTY</th>
              <th style="padding:4px 0; text-align:right;">RATE</th>
              <th style="padding:4px 0; text-align:right;">AMOUNT</th>
            </tr>
          </thead>
          ${itemRows}
        </table>

        <div style="border-top:1px dashed #000; border-bottom:1px dashed #000; padding:8px 0; margin-bottom:12px; font-size:0.85rem;">
          <div style="display:flex; justify-content:space-between;"><span>GROSS SUBTOTAL:</span> <span>₹${(grossSales || 0).toFixed(2)}</span></div>
          ${(discountsTotal > 0) ? `
            <div style="display:flex; justify-content:space-between; font-weight:700;"><span>LESS DISCOUNTS:</span> <span>-₹${(discountsTotal || 0).toFixed(2)}</span></div>
            ${(discountRecords || []).map(d => `<div style="font-size:0.75rem; text-align:right; color:#333;">• ${d.reason || d.discountType}: -₹${parseFloat(d.discountAmount).toFixed(2)}</div>`).join('')}
          ` : ''}
          <div style="display:flex; justify-content:space-between; font-weight:700; border-top:1px dotted #000; padding-top:4px; margin-top:2px;"><span>NET TAXABLE VALUE:</span> <span>₹${(taxableAmount || 0).toFixed(2)}</span></div>
          ${(taxLines || []).map(t => `
            <div style="display:flex; justify-content:space-between;"><span>${t.type === 'LIQUOR_VAT' ? 'VAT' : t.type} (${t.rate}%):</span> <span>₹${(t.amount || 0).toFixed(2)}</span></div>`).join('')}
          ${(charges || []).map(c => `
            <div style="display:flex; justify-content:space-between;"><span>${String(c.type || '').replace('_', ' ')} (${c.rate}%):</span> <span>₹${(c.amount || 0).toFixed(2)}</span></div>`).join('')}
          ${(!(charges || []).length && serviceCharge > 0) ? `
            <div style="display:flex; justify-content:space-between;"><span>SERVICE CHARGE:</span> <span>₹${(serviceCharge || 0).toFixed(2)}</span></div>` : ''}
          <div style="display:flex; justify-content:space-between; font-size:1.15rem; font-weight:900; border-top:2px solid #000; margin-top:6px; padding-top:6px;"><span>${docTotal && docTotal !== combinedTotal ? 'THIS BILL TOTAL:' : 'GRAND TOTAL:'}</span> <span>₹${(docTotal || 0).toFixed(2)}</span></div>
        </div>

        ${crossRef ? `
          <div style="text-align:center; font-size:0.8rem; margin-bottom:10px; padding:8px; border:1px dashed #000; border-radius:6px;">
            <div><strong>AMOUNT PAYABLE (Table ${tableNo}, both bills):</strong> ₹${(combinedTotal || 0).toFixed(2)}</div>
            <div style="margin-top:4px;">Settled with companion bill <strong>${crossRef}</strong></div>
          </div>` : ''}

        <div style="text-align:center; font-size:0.75rem;">
          <div>THANK YOU FOR DINING WITH US!</div>
          <div style="margin-top:2px;">HAVE A WONDERFUL DAY</div>
          <div style="font-size:0.65rem; color:#555; margin-top:8px;">Powered by Anchor RestaurantOS • CBIC GST Compliant</div>
        </div>
      </div>
    `;
  }

  paintDocuments() {
    const container = this.modalEl.querySelector('#invoice-docs');
    if (!container) return;
    const m = this._readModel();

    // Reflect the active mode on the toggle buttons.
    const combinedBtn = this.modalEl.querySelector('#btn-mode-combined');
    const splitBtn = this.modalEl.querySelector('#btn-mode-split');
    if (combinedBtn && splitBtn) {
      const active = { background: '#0f172a', color: '#fff', borderColor: '#0f172a' };
      const inactive = { background: '#fff', color: '#0f172a', borderColor: '#cbd5e1' };
      const st = this.splitMode ? inactive : active;
      const sp = this.splitMode ? active : inactive;
      Object.assign(combinedBtn.style, st);
      Object.assign(splitBtn.style, sp);
    }

    const sections = m.fiscalSections || [];
    const barSec = sections.find(s => s && s.section === 'BAR' && Array.isArray(s.items) && s.items.length);
    const foodSec = sections.find(s => s && s.section === 'FOOD' && Array.isArray(s.items) && s.items.length);
    // Split only makes sense when BOTH a food and a bar section exist.
    const canSplit = !!(barSec && foodSec);

    if (!this.splitMode || !canSplit) {
      container.innerHTML = this._buildDoc({
        name: m.restaurantName, gstin: m.gstin, fssai: m.fssai, address: m.address, phone: m.phone, licence: '',
        title: 'TAX INVOICE', invoiceNo: m.invoiceNo, isDraft: String(m.invoiceNo).startsWith('DRAFT'),
        tableNo: m.tableNo, tableCode: m.tableCode, waiterName: m.waiterName, isPaid: m.isPaid,
        sections: sections, items: m.items, grossSales: m.grossSales, discountsTotal: m.discountsTotal,
        discountRecords: m.discountRecords, taxableAmount: m.taxableAmount, taxLines: m.taxLines,
        charges: m.charges, serviceCharge: m.serviceCharge, docTotal: m.grandTotal, combinedTotal: m.grandTotal, crossRef: null
      });
      return;
    }

    // Split mode: two documents. Numbers are provisional until the cashier prints
    // (which triggers onIssueSplit); pass this._splitResult if already issued.
    const split = this._splitResult || null;
    const foodNo = split ? split.foodInvoice.invoiceNumber : 'DRAFT-FOOD (issue on print)';
    const barNo = split ? split.barInvoice.invoiceNumber : 'DRAFT-BAR (issue on print)';
    const combined = split ? split.combinedGrandTotal : m.grandTotal;

    let barName = m.restaurantName, barGstin = m.gstin, barAddress = m.address, barLicence = '';
    try {
      const cfg = taxConfigurationModel.getBarBillingConfig();
      if (cfg && cfg.separateExciseLicence) {
        barName = cfg.licenceName || m.restaurantName;
        barGstin = cfg.gstin || m.gstin;
        barAddress = cfg.address || m.address;
        barLicence = cfg.licenceNumber || '';
      }
    } catch (_) {}

    container.innerHTML =
      this._buildDoc({
        name: m.restaurantName, gstin: m.gstin, fssai: m.fssai, address: m.address, phone: m.phone, licence: '',
        title: 'TAX INVOICE (RESTAURANT)', invoiceNo: foodNo, isDraft: !split,
        tableNo: m.tableNo, tableCode: m.tableCode, waiterName: m.waiterName, isPaid: m.isPaid,
        sections: [foodSec], items: [], grossSales: foodSec.subtotal, discountsTotal: foodSec.discounts || 0,
        discountRecords: m.discountRecords, taxableAmount: foodSec.taxableAmount, taxLines: foodSec.taxLines,
        charges: foodSec.charges, serviceCharge: foodSec.serviceChargeAmount || 0, docTotal: foodSec.sectionTotal, combinedTotal: combined, crossRef: barNo
      }) +
      this._buildDoc({
        name: barName, gstin: barGstin, fssai: '', address: barAddress, phone: m.phone, licence: barLicence,
        title: 'BAR BILL (EXCISE VAT)', invoiceNo: barNo, isDraft: !split,
        tableNo: m.tableNo, tableCode: m.tableCode, waiterName: m.waiterName, isPaid: m.isPaid,
        sections: [barSec], items: [], grossSales: barSec.subtotal, discountsTotal: 0,
        discountRecords: [], taxableAmount: barSec.taxableAmount, taxLines: barSec.taxLines,
        charges: barSec.charges, serviceCharge: 0, docTotal: barSec.sectionTotal, combinedTotal: combined, crossRef: foodNo
      });
  }

  bindEvents() {
    const closeBtn = this.modalEl.querySelector('#btn-close-print-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.modalEl.remove();
        if (this.onClose) this.onClose();
      });
    }

    const combinedBtn = this.modalEl.querySelector('#btn-mode-combined');
    const splitBtn = this.modalEl.querySelector('#btn-mode-split');
    if (combinedBtn) combinedBtn.addEventListener('click', () => { this.splitMode = false; this.paintDocuments(); });
    if (splitBtn) splitBtn.addEventListener('click', () => { this.splitMode = true; this.paintDocuments(); });

    const printBtn = this.modalEl.querySelector('#btn-do-browser-print');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        // Committing a split print persists the two linked invoices (idempotent),
        // so the printed slips carry real GST/VAT invoice numbers.
        if (this.splitMode && typeof this.onIssueSplit === 'function' && !this._splitResult) {
          try {
            const res = this.onIssueSplit();
            if (res && res.foodInvoice && res.barInvoice) this._splitResult = res;
          } catch (err) { console.warn('[TaxInvoicePrintModal] split issue error:', err && err.message); }
          this.paintDocuments();
        }
        this._openPrintWindow();
      });
    }
  }

  _openPrintWindow() {
    const docs = Array.from(this.modalEl.querySelectorAll('[data-print-doc]'));
    const docContent = docs.map(d => d.outerHTML).join('\n<div style="page-break-after:always;"></div>\n');
    const win = window.open('', '_blank', 'width=600,height=800');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Print Invoice</title>
          <style>
            body { margin:0; padding:20px; font-family:'Courier New', Courier, monospace; }
            @media print { body { padding:0; } }
          </style>
        </head>
        <body>
          ${docContent}
          <script>
            window.onload = function() { window.print(); setTimeout(function(){ window.close(); }, 500); };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  }
}
