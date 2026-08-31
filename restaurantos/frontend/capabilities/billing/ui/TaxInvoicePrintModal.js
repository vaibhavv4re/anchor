/**
 * Capability Group 5 - Official Tax Invoice Browser Print Modal
 * Generates an official GST Tax Invoice print preview populated dynamically from TenantModel config & InvoiceModel.
 * ZERO financial state mutation (printing never consumes invoice numbers or alters payments).
 */

import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';
import { billRevisionModel } from '../../../../../businessos/platform/billing/billRevisionModel.js';
import { invoiceModel } from '../../../../../businessos/platform/billing/invoiceModel.js';
import { paymentModel } from '../../../../../businessos/platform/billing/paymentModel.js';
import { tenantModel } from '../../../../../businessos/platform/tenant/tenantModel.js';

export class TaxInvoicePrintModal {
  constructor({ sessionId, revisionIndex = null, onClose = null }) {
    this.sessionId = sessionId;
    this.revisionIndex = revisionIndex;
    this.onClose = onClose;
    this.modalEl = null;
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'lock-screen-overlay animate-fade-in';
    this.modalEl.style.zIndex = '999999';
    this.modalEl.style.display = 'flex';
    this.modalEl.style.alignItems = 'center';
    this.modalEl.style.justifyContent = 'center';

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
    const cgst = parseFloat(activeRev ? activeRev.cgstAmount : (invoice ? (invoice.cgstAmount || (invoice.grandTotal * 0.025)) : (proj ? proj.cgstAmount : 0))) || 0;
    const sgst = parseFloat(activeRev ? activeRev.sgstAmount : (invoice ? (invoice.sgstAmount || (invoice.grandTotal * 0.025)) : (proj ? proj.sgstAmount : 0))) || 0;
    const serviceCharge = parseFloat(activeRev ? activeRev.serviceChargeAmount : (invoice ? (invoice.serviceChargeAmount || 0) : (proj ? (proj.serviceChargeAmount || 0) : 0))) || 0;
    const grandTotal = parseFloat(activeRev ? activeRev.grandTotal : (invoice ? invoice.grandTotal : (proj ? proj.grandTotal : 0))) || 0;
    
    const invoiceNo = invoice ? invoice.invoiceNumber : (payment ? payment.invoiceNumber : (activeRev && activeRev.invoiceNumber ? activeRev.invoiceNumber : 'DRAFT PREVIEW'));
    const isPaid = payment !== null;

    this.modalEl.innerHTML = `
      <div class="card animate-fade-in printable-invoice-card" style="max-width:540px; width:92%; max-height:92vh; display:flex; flex-direction:column; padding:0; overflow:hidden; background:#ffffff; color:#000000; border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.4);">
        
        <!-- PRINT/ACTION HEADER BAR -->
        <div style="background:#1e293b; color:#ffffff; padding:12px 20px; display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:700; font-size:0.9rem; display:flex; align-items:center; gap:8px;">
            <span>🖨️</span> Tax Invoice Print Preview
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

        <!-- INVOICE DOCUMENT BODY -->
        <div id="tax-invoice-document" style="flex:1; overflow-y:auto; padding:24px; font-family:'Courier New', Courier, monospace; color:#000000; background:#ffffff; line-height:1.4;">
          
          <!-- RESTAURANT HEADER -->
          <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:12px; margin-bottom:12px;">
            <div style="font-size:1.3rem; font-weight:900; letter-spacing:1px; text-transform:uppercase;">${restaurantName}</div>
            <div style="font-size:0.8rem;">${address}</div>
            <div style="font-size:0.8rem; font-weight:700;">TEL: ${phone}</div>
            <div style="font-size:0.8rem; font-weight:700; margin-top:4px;">GSTIN: ${gstin} • FSSAI: ${fssai}</div>
            <div style="font-size:1rem; font-weight:800; text-transform:uppercase; margin-top:8px; border:1px solid #000; display:inline-block; padding:2px 10px;">
              ${invoiceNo.startsWith('DRAFT') ? 'DRAFT ESTIMATE' : 'TAX INVOICE'}
            </div>
          </div>

          <!-- META METRICS -->
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

          <!-- LINE ITEMS TABLE -->
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem; margin-bottom:12px;">
            <thead>
              <tr style="border-bottom:1px solid #000; text-align:left;">
                <th style="padding:4px 0;">ITEM DESCRIPTION</th>
                <th style="padding:4px 0; text-align:center;">QTY</th>
                <th style="padding:4px 0; text-align:right;">RATE</th>
                <th style="padding:4px 0; text-align:right;">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => `
                <tr>
                  <td style="padding:4px 0; font-weight:700;">${it.name || it.itemName}</td>
                  <td style="padding:4px 0; text-align:center;">${it.quantity}</td>
                  <td style="padding:4px 0; text-align:right;">${(it.price || 0).toFixed(2)}</td>
                  <td style="padding:4px 0; text-align:right; font-weight:700;">${(it.lineTotal || (it.price * it.quantity)).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- FINANCIAL TAX BREAKDOWN -->
          <div style="border-top:1px dashed #000; border-bottom:1px dashed #000; padding:8px 0; margin-bottom:12px; font-size:0.85rem;">
            <div style="display:flex; justify-content:space-between;">
              <span>GROSS COMMERCIAL SUBTOTAL:</span> <span>₹${grossSales.toFixed(2)}</span>
            </div>
            
            ${discountsTotal > 0 ? `
              <div style="display:flex; justify-content:space-between; font-weight:700;">
                <span>LESS DISCOUNTS TOTAL:</span> <span>-₹${discountsTotal.toFixed(2)}</span>
              </div>
              ${discountRecords.map(d => `
                <div style="font-size:0.75rem; text-align:right; color:#333;">
                  • ${d.reason || d.discountType}: -₹${parseFloat(d.discountAmount).toFixed(2)}
                </div>
              `).join('')}
            ` : ''}

            <div style="display:flex; justify-content:space-between; font-weight:700; border-top:1px dotted #000; padding-top:4px; margin-top:2px;">
              <span>NET TAXABLE VALUE:</span> <span>₹${taxableAmount.toFixed(2)}</span>
            </div>

            ${taxLines.length > 0 ? taxLines.map(t => `
              <div style="display:flex; justify-content:space-between;">
                <span>${t.type} (${t.rate}%):</span> <span>₹${t.amount.toFixed(2)}</span>
              </div>
            `).join('') : `
              <div style="display:flex; justify-content:space-between;">
                <span>CGST (2.5%):</span> <span>₹${cgst.toFixed(2)}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>SGST (2.5%):</span> <span>₹${sgst.toFixed(2)}</span>
              </div>
            `}

            ${charges.length > 0 ? charges.map(c => `
              <div style="display:flex; justify-content:space-between;">
                <span>${c.type.replace('_', ' ')} (${c.rate}%):</span> <span>₹${c.amount.toFixed(2)}</span>
              </div>
            `).join('') : `
              <div style="display:flex; justify-content:space-between;">
                <span>SERVICE CHARGE (5%):</span> <span>₹${serviceCharge.toFixed(2)}</span>
              </div>
            `}

            <div style="display:flex; justify-content:space-between; font-size:1.15rem; font-weight:900; border-top:2px solid #000; margin-top:6px; padding-top:6px;">
              <span>GRAND TOTAL:</span> <span>₹${grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <!-- FOOTER -->
          <div style="text-align:center; font-size:0.75rem; margin-top:12px;">
            <div>THANK YOU FOR DINING WITH US!</div>
            <div style="margin-top:2px;">HAVE A WONDERFUL DAY</div>
            <div style="font-size:0.65rem; color:#555; margin-top:8px;">Powered by Anchor RestaurantOS • CBIC GST Compliant</div>
          </div>

        </div>
      </div>
    `;

    this.bindEvents();
    return this.modalEl;
  }

  bindEvents() {
    const closeBtn = this.modalEl.querySelector('#btn-close-print-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.modalEl.remove();
        if (this.onClose) this.onClose();
      });
    }

    const printBtn = this.modalEl.querySelector('#btn-do-browser-print');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        const docContent = this.modalEl.querySelector('#tax-invoice-document').outerHTML;
        const win = window.open('', '_blank', 'width=600,height=800');
        if (win) {
          win.document.write(`
            <html>
              <head>
                <title>Print Tax Invoice</title>
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
      });
    }
  }
}
