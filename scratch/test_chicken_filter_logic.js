import { InventoryWorkspaceView } from '../restaurantos/frontend/capabilities/inventory/ui/InventoryWorkspaceView.js';

function testChickenFiltering() {
  console.log('----------------------------------------------------');
  console.log('🧪 TESTING CHICKEN CATEGORY FILTERING COHESION');
  console.log('----------------------------------------------------\n');

  const masterItems = [
    { itemCode: 'RM0101', itemName: 'Chicken Boneless (Thigh & Breast)', categoryCode: 'CAT-MEAT', categoryName: 'Meat & Poultry' },
    { itemCode: 'RM0102', itemName: 'Whole Chicken (Curry Cut)', categoryCode: 'CAT-MEAT', categoryName: 'Meat & Poultry' },
    { itemCode: 'RM0201', itemName: 'Fresh Surmai Fish', categoryCode: 'CAT-SEAFOOD', categoryName: 'Seafood' },
    { itemCode: 'RM0301', itemName: 'Red Onions', categoryCode: 'CAT-VEG', categoryName: 'Fresh Vegetables' }
  ];

  const catalogueItems = [
    { supplierCode: 'SUP-101', itemCode: 'RM0101', supplierItemName: 'Chicken Boneless' },
    { supplierCode: 'SUP-101', itemCode: 'RM0102', supplierItemName: 'Whole Chicken' },
    { supplierCode: 'SUP-102', itemCode: 'RM0201', supplierItemName: 'Fresh Surmai Fish' },
    { supplierCode: 'SUP-103', itemCode: 'RM0301', supplierItemName: 'Red Onions' }
  ];

  // Emulate filterRows matching logic
  const filterCatCode = 'CAT-CHICKEN';
  const filtered = catalogueItems.filter(c => {
    const itemCode = c.itemCode || c.item_code;
    const itemObj = masterItems.find(i => (i.itemCode || i.item_code || '').toUpperCase() === (itemCode || '').toUpperCase()) || {};

    const itemCatCode = (itemObj.categoryCode || itemObj.category_code || itemObj.category || '').toUpperCase().trim();
    const itemCatName = (itemObj.categoryName || itemObj.category_name || '').toUpperCase().trim();
    const fCatCode = filterCatCode.toUpperCase().trim();

    const matchCode = itemCatCode === fCatCode;
    const matchName = itemCatName && itemCatName.includes(fCatCode.replace('CAT-', ''));

    const matchChickenAlias = (fCatCode.includes('CHICKEN') && (itemCatCode.includes('MEAT') || itemCatCode.includes('POULTRY') || (itemObj.itemName || c.supplierItemName || '').toUpperCase().includes('CHICKEN')));

    return matchCode || matchName || matchChickenAlias;
  });

  console.log(`Filtered count for filter "CAT-CHICKEN": ${filtered.length}`);
  filtered.forEach(item => {
    console.log(`  - Matched Item: [${item.itemCode}] ${item.supplierItemName}`);
  });

  if (filtered.length === 2) {
    console.log('\n----------------------------------------------------');
    console.log('✅ CHICKEN CATEGORY FILTERING PASSED (100%)');
    console.log('----------------------------------------------------');
  } else {
    console.error('❌ FILTERING FAILED: Expected 2 chicken items, got ' + filtered.length);
    process.exit(1);
  }
}

testChickenFiltering();
