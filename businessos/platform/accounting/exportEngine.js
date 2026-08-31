/**
 * BusinessOS Platform - Multi-Format Financial Export Engine (F1.4)
 * Generates accounting export packages in CSV, JSON/Excel, PDF, and Tally Prime XML formats.
 * Consumes CQRS accountingProjectionService.js source of truth.
 */

import { accountingProjectionService } from './accountingProjectionService.js';
import { invoiceModel } from '../billing/invoiceModel.js';
import { paymentModel } from '../billing/paymentModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';

export class ExportEngine {
  /**
   * Universal CSV Exporter
   */
  static exportCSV(packageType = 'all', dateFilter = 'month', tenantId = null) {
    const data = this._prepareExportData(packageType, dateFilter, tenantId);
    let csvContent = '';

    if (packageType === 'sales' || packageType === 'all') {
      csvContent += '=== SALES REGISTER ===\n';
      csvContent += 'Invoice Number,Date,Session ID,Table,Gross Sales,CGST,SGST,Grand Total,Status\n';
      (data.invoices || []).forEach(inv => {
        csvContent += `"${inv.invoiceNumber}","${inv.issuedAt || ''}","${inv.sessionId}","Table ${inv.tableNumber || 1}",${inv.grossSales || 0},${inv.cgstAmount || 0},${inv.sgstAmount || 0},${inv.grandTotal || 0},"${inv.status}"\n`;
      });
      csvContent += '\n';
    }

    if (packageType === 'payments' || packageType === 'all') {
      csvContent += '=== PAYMENT LEDGER ===\n';
      csvContent += 'Payment ID,Invoice Number,Session ID,Date,Method,Reference No,Amount,Received By,Status\n';
      (data.payments || []).forEach(p => {
        csvContent += `"${p.paymentId || p.id}","${p.invoiceNumber || ''}","${p.sessionId}","${p.receivedAt || ''}","${p.paymentMethod}","${p.referenceNo || ''}",${p.amount || 0},"${p.receivedByName || ''}","${p.status || 'SETTLED'}"\n`;
      });
      csvContent += '\n';
    }

    if (packageType === 'reconciliation' || packageType === 'all') {
      csvContent += '=== RECONCILIATION EXCEPTION LOG ===\n';
      csvContent += 'Invoice Number,Table,Expected Invoiced,Settled Receipts,Difference,Category,Workflow Status\n';
      (data.reconciliation?.allResults || []).forEach(r => {
        csvContent += `"${r.invoiceNumber}","Table ${r.tableNumber}",${r.invoicedAmount},${r.settledAmount},${r.difference},"${r.type}","${r.workflowStatus}"\n`;
      });
    }

    const filename = `Anchor_Financial_Export_${packageType}_${dateFilter}_${Date.now()}.csv`;
    this._downloadFile(filename, csvContent, 'text/csv;charset=utf-8;');
    return { success: true, filename };
  }

  /**
   * Universal JSON Data Package Exporter (Excel-Compatible)
   */
  static exportJSON(packageType = 'all', dateFilter = 'month', tenantId = null) {
    const data = this._prepareExportData(packageType, dateFilter, tenantId);
    const jsonString = JSON.stringify(data, null, 2);
    const filename = `Anchor_Financial_Package_${packageType}_${dateFilter}_${Date.now()}.json`;
    this._downloadFile(filename, jsonString, 'application/json;');
    return { success: true, filename };
  }

  /**
   * Tally Prime XML Sales & Receipt Voucher Exporter
   * Generates standard Tally Prime import XML format.
   */
  static exportTallyXML(dateFilter = 'month', tenantId = null) {
    const data = this._prepareExportData('all', dateFilter, tenantId);
    const invoices = data.invoices || [];
    const payments = data.payments || [];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xml += `  <HEADER>\n`;
    xml += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
    xml += `    <TYPE>Vouchers</TYPE>\n`;
    xml += `    <VERSION>9.0</VERSION>\n`;
    xml += `  </HEADER>\n`;
    xml += `  <BODY>\n`;
    xml += `    <IMPORTDATA>\n`;
    xml += `      <REQUESTDESC>\n`;
    xml += `        <REPORTNAME>Vouchers</REPORTNAME>\n`;
    xml += `        <STATICVARIABLES>\n`;
    xml += `          <SVCURRENTCOMPANY>Anchor Bistro &amp; Cafe</SVCURRENTCOMPANY>\n`;
    xml += `        </STATICVARIABLES>\n`;
    xml += `      </REQUESTDESC>\n`;
    xml += `      <REQUESTDATA>\n`;

    // 1. Export Sales Vouchers for Invoices
    invoices.forEach(inv => {
      const dtStr = (inv.issuedAt || new Date().toISOString()).substring(0, 10).replace(/-/g, '');
      const gross = Math.round((parseFloat(inv.grossSales) || 0) * 100) / 100;
      const cgst = Math.round((parseFloat(inv.cgstAmount) || 0) * 100) / 100;
      const sgst = Math.round((parseFloat(inv.sgstAmount) || 0) * 100) / 100;
      const grandTotal = Math.round((parseFloat(inv.grandTotal) || 0) * 100) / 100;

      xml += `        <TALLYMESSAGE>\n`;
      xml += `          <VOUCHER VCHTYPE="Sales" ACTION="Create">\n`;
      xml += `            <DATE>${dtStr}</DATE>\n`;
      xml += `            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>\n`;
      xml += `            <VOUCHERNUMBER>${inv.invoiceNumber}</VOUCHERNUMBER>\n`;
      xml += `            <REFERENCE>${inv.billNumber || ''}</REFERENCE>\n`;
      xml += `            <PARTYLEDGERNAME>Restaurant Sales Customer</PARTYLEDGERNAME>\n`;
      xml += `            <NARRATION>POS Invoice ${inv.invoiceNumber} (Table ${inv.tableNumber || 1}) - Session ${inv.sessionId}</NARRATION>\n`;
      
      // Debit Party/Receivables
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Restaurant Sales Customer</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>YES</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>-${grandTotal.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;

      // Credit Sales Revenue
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Food &amp; Beverage Sales</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>${gross.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;

      // Credit CGST Output Tax
      if (cgst > 0) {
        xml += `            <ALLLEDGERENTRIES.LIST>\n`;
        xml += `              <LEDGERNAME>Output CGST @ 2.5%</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${cgst.toFixed(2)}</AMOUNT>\n`;
        xml += `            </ALLLEDGERENTRIES.LIST>\n`;
      }

      // Credit SGST Output Tax
      if (sgst > 0) {
        xml += `            <ALLLEDGERENTRIES.LIST>\n`;
        xml += `              <LEDGERNAME>Output SGST @ 2.5%</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${sgst.toFixed(2)}</AMOUNT>\n`;
        xml += `            </ALLLEDGERENTRIES.LIST>\n`;
      }

      xml += `          </VOUCHER>\n`;
      xml += `        </TALLYMESSAGE>\n`;
    });

    // 2. Export Receipt Vouchers for Payments
    payments.forEach(p => {
      const dtStr = (p.receivedAt || p.createdAt || new Date().toISOString()).substring(0, 10).replace(/-/g, '');
      const amt = Math.round((parseFloat(p.amount) || 0) * 100) / 100;
      const bankOrCash = (p.paymentMethod || 'CASH').toUpperCase() === 'CASH' ? 'Cash in Hand' : `Bank / ${p.paymentMethod.toUpperCase()} Account`;

      xml += `        <TALLYMESSAGE>\n`;
      xml += `          <VOUCHER VCHTYPE="Receipt" ACTION="Create">\n`;
      xml += `            <DATE>${dtStr}</DATE>\n`;
      xml += `            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>\n`;
      xml += `            <VOUCHERNUMBER>${p.paymentId || p.id}</VOUCHERNUMBER>\n`;
      xml += `            <PARTYLEDGERNAME>Restaurant Sales Customer</PARTYLEDGERNAME>\n`;
      xml += `            <NARRATION>Payment Receipt for Invoice ${p.invoiceNumber || ''} via ${p.paymentMethod} (Ref: ${p.referenceNo || 'POS'})</NARRATION>\n`;
      
      // Debit Cash / Bank
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>${bankOrCash}</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>YES</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>-${amt.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;

      // Credit Party/Receivables
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Restaurant Sales Customer</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>${amt.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;

      xml += `          </VOUCHER>\n`;
      xml += `        </TALLYMESSAGE>\n`;
    });

    xml += `      </REQUESTDATA>\n`;
    xml += `    </IMPORTDATA>\n`;
    xml += `  </BODY>\n`;
    xml += `</TALLYMESSAGE>\n`;

    const filename = `Anchor_Tally_Prime_Vouchers_${dateFilter}_${Date.now()}.xml`;
    this._downloadFile(filename, xml, 'application/xml;charset=utf-8;');
    return { success: true, filename };
  }

  /**
   * PDF Printable Audit Report Generator
   */
  static exportPDF(packageType = 'all', dateFilter = 'month', tenantId = null) {
    const data = this._prepareExportData(packageType, dateFilter, tenantId);
    const win = window.open('', '_blank');
    if (!win) {
      alert('Please allow popups to generate Printable PDF Audit Report.');
      return { success: false };
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Anchor RestaurantOS - Financial Audit Report (${dateFilter})</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #1e293b; }
          h1 { font-size: 1.6rem; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
          .kpi-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
          .kpi-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; }
          .kpi-title { font-size: 0.75rem; color: #64748b; font-weight: bold; }
          .kpi-value { font-size: 1.4rem; font-weight: bold; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 0.85rem; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
          th { background: #f1f5f9; font-size: 0.75rem; }
          .badge { padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: #e2e8f0; }
          .badge-success { background: #dcfce7; color: #15803d; }
          .badge-danger { background: #fee2e2; color: #b91c1c; }
        </style>
      </head>
      <body>
        <h1>📚 Anchor RestaurantOS — Financial Audit Report</h1>
        <p><strong>Period:</strong> ${dateFilter.toUpperCase()} | <strong>Generated At:</strong> ${new Date().toLocaleString()}</p>
        
        <div class="kpi-container">
          <div class="kpi-card"><div class="kpi-title">TOTAL INVOICED REVENUE</div><div class="kpi-value">₹${(data.reconciliation.totalInvoicedAmount || 0).toFixed(2)}</div></div>
          <div class="kpi-card"><div class="kpi-title">TOTAL SETTLED RECEIPTS</div><div class="kpi-value">₹${(data.reconciliation.totalSettledAmount || 0).toFixed(2)}</div></div>
          <div class="kpi-card"><div class="kpi-title">MATCHED TRANSACTIONS</div><div class="kpi-value">${data.reconciliation.matchedCount || 0}</div></div>
          <div class="kpi-card"><div class="kpi-title">RECONCILIATION EXCEPTIONS</div><div class="kpi-value">${data.reconciliation.exceptionCount || 0}</div></div>
        </div>

        <h2>🧾 Sales Register (${(data.invoices || []).length} Invoices)</h2>
        <table>
          <thead>
            <tr><th>Invoice #</th><th>Date</th><th>Session</th><th>Table</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Grand Total</th></tr>
          </thead>
          <tbody>
            ${(data.invoices || []).map(i => `
              <tr>
                <td><strong>${i.invoiceNumber}</strong></td>
                <td>${(i.issuedAt || '').substring(0, 10)}</td>
                <td>${i.sessionId}</td>
                <td>Table ${i.tableNumber || 1}</td>
                <td>₹${(i.grossSales || 0).toFixed(2)}</td>
                <td>₹${(i.cgstAmount || 0).toFixed(2)}</td>
                <td>₹${(i.sgstAmount || 0).toFixed(2)}</td>
                <td><strong>₹${(i.grandTotal || 0).toFixed(2)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>🔍 Reconciliation Status</h2>
        <table>
          <thead>
            <tr><th>Category</th><th>Invoice #</th><th>Expected</th><th>Settled</th><th>Difference</th><th>Workflow Status</th></tr>
          </thead>
          <tbody>
            ${(data.reconciliation.allResults || []).map(r => `
              <tr>
                <td><span class="badge ${r.status === 'MATCHED' ? 'badge-success' : 'badge-danger'}">${r.type}</span></td>
                <td>${r.invoiceNumber}</td>
                <td>₹${r.invoicedAmount.toFixed(2)}</td>
                <td>₹${r.settledAmount.toFixed(2)}</td>
                <td>₹${r.difference.toFixed(2)}</td>
                <td>${r.workflowStatus}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    win.document.write(html);
    win.document.close();
    return { success: true };
  }

  static _prepareExportData(packageType, dateFilter, tenantId) {
    const sales = accountingProjectionService.getSalesRegister({ dateFilter, tenantId });
    const payments = accountingProjectionService.getPaymentLedger({ dateFilter, tenantId });
    const gst = accountingProjectionService.getGstReport({ dateFilter, tenantId });
    const reconciliation = accountingProjectionService.getReconciliation({ dateFilter, tenantId });
    const auditLog = offlineStore.getCollection('session_audit_logs') || [];

    return {
      exportedAt: new Date().toISOString(),
      dateFilter,
      tenantId: tenantId || 'tenant_h0qc7wf',
      invoices: sales.invoices || [],
      payments: payments.payments || [],
      gstSummary: gst,
      reconciliation,
      auditLog
    };
  }

  static _downloadFile(filename, text, mimeType) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:' + mimeType + ',' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
}
