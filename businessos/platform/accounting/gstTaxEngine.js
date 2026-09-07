/**
 * BusinessOS Platform - GST Input Tax Credit (ITC) Engine (P2P v1.1)
 * Evaluates Supplier State Code vs Tenant Location State Code to determine CGST + SGST (Intra-state) vs IGST (Inter-state).
 * Calculates recoverable Input Tax Credit.
 */

export class GstTaxEngine {
  /**
   * Determine GST tax breakdown and ITC accounts based on state boundaries
   * @param {Object} params { supplierStateCode, tenantStateCode, taxableAmount, taxRate }
   * @returns {Object} GST Tax Breakdown
   */
  calculateGstBreakdown({ supplierStateCode = '27', tenantStateCode = '27', taxableAmount = 0, taxRate = 5 }) {
    const taxable = parseFloat(taxableAmount) || 0;
    const rate = parseFloat(taxRate) || 5;
    const totalTax = Math.round((taxable * (rate / 100)) * 100) / 100;

    const sState = String(supplierStateCode).trim();
    const tState = String(tenantStateCode).trim();
    const isIntraState = sState === tState;

    if (isIntraState) {
      const cgstAmount = Math.round((totalTax / 2) * 100) / 100;
      const sgstAmount = Math.round((totalTax - cgstAmount) * 100) / 100;
      return {
        isInterState: false,
        taxType: 'CGST_SGST',
        cgstAmount,
        sgstAmount,
        igstAmount: 0,
        totalTax,
        taxLines: [
          { accountCode: '1410', accountName: 'Input CGST (Recoverable)', amount: cgstAmount },
          { accountCode: '1420', accountName: 'Input SGST (Recoverable)', amount: sgstAmount }
        ]
      };
    } else {
      return {
        isInterState: true,
        taxType: 'IGST',
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: totalTax,
        totalTax,
        taxLines: [
          { accountCode: '1430', accountName: 'Input IGST (Recoverable)', amount: totalTax }
        ]
      };
    }
  }
}

export const gstTaxEngine = new GstTaxEngine();
