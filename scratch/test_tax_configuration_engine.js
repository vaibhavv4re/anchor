import { taxConfigurationModel } from '../businessos/platform/accounting/taxConfigurationModel.js';

async function runTaxConfigurationEngineTest() {
  console.log('====================================================');
  console.log('🧮 CENTRALIZED TAX CONFIGURATION ENGINE VERIFICATION');
  console.log('====================================================\n');

  const tenantId = 'tenant_h0qc7wf';
  const config = taxConfigurationModel.getTaxConfiguration(tenantId);

  console.log(`GSTIN Registered:    ${config.gstRegistration.gstin}`);
  console.log(`State:               ${config.gstRegistration.stateName} (${config.gstRegistration.stateCode})`);
  console.log(`Registered Name:     ${config.gstRegistration.legalName}`);
  console.log(`Total Tax Categories: ${config.taxCategories.length}`);
  console.log(`Total Active Tax Rules: ${config.taxRules.length}`);

  // Test 1: Intra-state Food Sale Tax Calculation
  console.log('\n--- TEST 1: INTRA-STATE FOOD TAX (27 -> 27) ---');
  const foodIntra = taxConfigurationModel.calculateTaxForCategory({
    categoryCode: 'RESTAURANT_FOOD',
    taxableAmount: 1000,
    supplierStateCode: '27',
    tenantId
  });
  console.log(`Taxable Amount: ₹${foodIntra.taxableAmount}`);
  console.log(`CGST (2.5%):    ₹${foodIntra.cgstAmount}`);
  console.log(`SGST (2.5%):    ₹${foodIntra.sgstAmount}`);
  console.log(`Total Tax:      ₹${foodIntra.totalTax}`);
  if (foodIntra.cgstAmount !== 25 || foodIntra.sgstAmount !== 25) {
    throw new Error('Test 1 Failed: CGST/SGST splitting mismatch.');
  }

  // Test 2: Inter-state Food Sale Tax Calculation
  console.log('\n--- TEST 2: INTER-STATE FOOD TAX (29 -> 27) ---');
  const foodInter = taxConfigurationModel.calculateTaxForCategory({
    categoryCode: 'RESTAURANT_FOOD',
    taxableAmount: 1000,
    supplierStateCode: '29',
    tenantId
  });
  console.log(`Taxable Amount: ₹${foodInter.taxableAmount}`);
  console.log(`IGST (5.0%):    ₹${foodInter.igstAmount}`);
  console.log(`Total Tax:      ₹${foodInter.totalTax}`);
  if (foodInter.igstAmount !== 50) {
    throw new Error('Test 2 Failed: IGST calculation mismatch.');
  }

  // Test 3: Alcohol / Liquor VAT Tax Calculation
  console.log('\n--- TEST 3: STATE LIQUOR VAT (ALCOHOL_SPIRITS) ---');
  const liquorVat = taxConfigurationModel.calculateTaxForCategory({
    categoryCode: 'ALCOHOL_SPIRITS',
    taxableAmount: 2000,
    tenantId
  });
  console.log(`Taxable Amount: ₹${liquorVat.taxableAmount}`);
  console.log(`Liquor VAT:     ₹${liquorVat.vatAmount} (Rate: ${liquorVat.taxRate}%)`);
  console.log(`Total Payable:  ₹${liquorVat.totalAmount}`);
  if (liquorVat.vatAmount !== 200) {
    throw new Error('Test 3 Failed: Liquor VAT calculation mismatch.');
  }

  console.log('\n====================================================');
  console.log('✅ CENTRALIZED TAX CONFIGURATION ENGINE PASSED (100%)');
  console.log('====================================================');
}

runTaxConfigurationEngineTest().catch(err => {
  console.error('❌ Tax Configuration Engine Test Failed:', err);
  process.exit(1);
});
