/**
 * Anchor Coastal Bistro - Canonical Import Package Generator (F9.7)
 * Compiles real Coastal Bistro restaurant menu, inventory, suppliers, variants,
 * BOM recipes, and opening stock into the canonical F9 package structure.
 */

export const COASTAL_BISTRO_MANIFEST = {
  schemaVersion: '1.0',
  packageVersion: '2026.09.01',
  restaurant: 'Anchor Coastal Bistro (Zai Harbour)',
  location: 'Zai Harbour, Maharashtra',
  description: 'Full real food & beverage menu with semi-finished prep BOMs and inventory master'
};

export const COASTAL_BISTRO_INVENTORY = [
  { itemCode: 'RM0101', itemName: 'Chicken Boneless (Thigh & Breast)', itemType: 'Raw Material', categoryCode: 'CAT-MEAT', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 280, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0102', itemName: 'Whole Chicken (Curry Cut)', itemType: 'Raw Material', categoryCode: 'CAT-MEAT', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 220, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0103', itemName: 'Chicken Mince (Keema)', itemType: 'Raw Material', categoryCode: 'CAT-MEAT', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 310, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0105', itemName: 'Mutton Curry Cut (Bone-in)', itemType: 'Raw Material', categoryCode: 'CAT-MEAT', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 750, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0201', itemName: 'Bombil / Bombay Duck (Fresh)', itemType: 'Raw Material', categoryCode: 'CAT-SEAFOOD', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 320, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0202', itemName: 'Surmai / Seer Fish (King Mackerel)', itemType: 'Raw Material', categoryCode: 'CAT-SEAFOOD', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 950, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0203', itemName: 'Pomfret (Silver / Black)', itemType: 'Raw Material', categoryCode: 'CAT-SEAFOOD', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 1100, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0206', itemName: 'Tiger Prawns (Cleaned & Deveined)', itemType: 'Raw Material', categoryCode: 'CAT-SEAFOOD', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 850, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0301', itemName: 'Fresh Paneer (Malai)', itemType: 'Raw Material', categoryCode: 'CAT-DAIRY', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 380, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0309', itemName: 'Red & White Onions', itemType: 'Raw Material', categoryCode: 'CAT-PRODUCE', baseUom: 'KG', purchaseUom: 'BAG', conversionFactor: 50, defaultLocationCode: 'LOC-MWH', lastPurchasePrice: 30, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0310', itemName: 'Tomatoes (Ripe & Charred)', itemType: 'Raw Material', categoryCode: 'CAT-PRODUCE', baseUom: 'KG', purchaseUom: 'CRATE', conversionFactor: 25, defaultLocationCode: 'LOC-MWH', lastPurchasePrice: 30, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0311', itemName: 'Fresh Herbs (Coriander, Mint, Parsley)', itemType: 'Raw Material', categoryCode: 'CAT-PRODUCE', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 160, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0314', itemName: 'Fresh Kokum & Kokum Extract', itemType: 'Raw Material', categoryCode: 'CAT-PRODUCE', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-MWH', lastPurchasePrice: 280, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0401', itemName: 'Kolam Rice (Steamed)', itemType: 'Raw Material', categoryCode: 'CAT-GRAIN', baseUom: 'KG', purchaseUom: 'BAG', conversionFactor: 25, defaultLocationCode: 'LOC-MWH', lastPurchasePrice: 58, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0403', itemName: 'Basmati Rice (Long Grain)', itemType: 'Raw Material', categoryCode: 'CAT-GRAIN', baseUom: 'KG', purchaseUom: 'BAG', conversionFactor: 25, defaultLocationCode: 'LOC-MWH', lastPurchasePrice: 114, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0408', itemName: 'Amul Butter', itemType: 'Raw Material', categoryCode: 'CAT-DAIRY', baseUom: 'KG', purchaseUom: 'PACK', conversionFactor: 0.5, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 520, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0409', itemName: 'Desi Cow Ghee', itemType: 'Raw Material', categoryCode: 'CAT-OIL', baseUom: 'KG', purchaseUom: 'TIN', conversionFactor: 15, defaultLocationCode: 'LOC-MWH', lastPurchasePrice: 650, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'RM0411', itemName: 'Coconut Milk & Cream', itemType: 'Raw Material', categoryCode: 'CAT-DAIRY', baseUom: 'LTR', purchaseUom: 'BOX', conversionFactor: 12, defaultLocationCode: 'LOC-MWH', lastPurchasePrice: 150, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'BAR-RUM-WHT', itemName: 'White Rum Premium', itemType: 'Raw Material', categoryCode: 'CAT-BAR-SPIRIT', baseUom: 'ML', purchaseUom: 'BOTTLE_750ML', conversionFactor: 750, defaultLocationCode: 'LOC-BAR', lastPurchasePrice: 1200, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'BAR-GIN-HERB', itemName: 'Artisanal Coastal Gin', itemType: 'Raw Material', categoryCode: 'CAT-BAR-SPIRIT', baseUom: 'ML', purchaseUom: 'BOTTLE_750ML', conversionFactor: 750, defaultLocationCode: 'LOC-BAR', lastPurchasePrice: 1800, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'SF0001', itemName: 'Signature Damao Masala Paste', itemType: 'Semi Finished', categoryCode: 'CAT-PREP', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 350, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'SF0003', itemName: 'Goan Green Cafreal Herb Marinade', itemType: 'Semi Finished', categoryCode: 'CAT-PREP', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 290, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'SF0007', itemName: 'Signature House Green Dip (Molho Verde)', itemType: 'Semi Finished', categoryCode: 'CAT-PREP', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 240, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true },
  { itemCode: 'SF0008', itemName: 'Signature House Red Pepper Dip', itemType: 'Semi Finished', categoryCode: 'CAT-PREP', baseUom: 'KG', purchaseUom: 'KG', conversionFactor: 1, defaultLocationCode: 'LOC-CHILL', lastPurchasePrice: 260, isStockable: true, isRecipeIngredient: true, autoDeductionEnabled: true }
];

export const COASTAL_BISTRO_SUPPLIERS = [
  { supplierCode: 'SUP-MEAT-01', supplierName: 'Zai Coastal Poultry & Meats', phone: '+91 98200 11223', email: 'meats@zaicoastal.in', address: 'Zai Harbour Dock Road' },
  { supplierCode: 'SUP-SEAFOOD-02', supplierName: 'Konkan Fresh Catch Artisanal Fishery', phone: '+91 98200 44556', email: 'orders@konkancatch.in', address: 'Fisheries Jetty, Palghar' },
  { supplierCode: 'SUP-BAR-03', supplierName: 'Maritime Beverage Distributors', phone: '+91 98200 77889', email: 'spirits@maritimebev.in', address: 'MIDC Tarapur' }
];

export const COASTAL_BISTRO_FOOD_MENU = [
  { menuCode: 'SOUP-KOKUM', categoryName: 'Soups', itemName: 'Kokum & Coconut Soup', description: 'Light coconut broth balanced with refreshing tang of kokum', isVegetarian: true, productionRouting: 'KITCHEN' },
  { menuCode: 'SOUP-CAFREAL', categoryName: 'Soups', itemName: 'Green Chicken Soup', description: 'Shredded chicken simmered with fresh coriander and Cafreal spices', isVegetarian: false, productionRouting: 'KITCHEN' },
  { menuCode: 'STARTER-DAMAO-PNR', categoryName: 'Starters', itemName: 'Smoked Damao Paneer', description: 'Paneer batons in signature Damao Masala, charcoal grilled', isVegetarian: true, productionRouting: 'KITCHEN' },
  { menuCode: 'STARTER-DAMAO-CHK', categoryName: 'Starters', itemName: 'Smoked Damao Tikka', description: 'Chicken in signature Damao Masala, charcoal grilled', isVegetarian: false, productionRouting: 'KITCHEN' },
  { menuCode: 'MAIN-DAMAO-CURRY', categoryName: 'Seafood Curries', itemName: 'Damao Homestyle Fish Curry', description: 'Fresh catch simmered in rich Damao tomato coconut gravy', isVegetarian: false, productionRouting: 'KITCHEN' },
  { menuCode: 'RICE-BIRYANI-CHK', categoryName: 'Rice & Biryani', itemName: 'Classic Chicken Biryani', description: 'Succulent chicken and fragrant basmati rice layered with herbs', isVegetarian: false, productionRouting: 'KITCHEN' }
];

export const COASTAL_BISTRO_FOOD_VARIANTS = [
  { menuCode: 'SOUP-KOKUM', variantCode: 'PORTION_250ML', variantName: '250ml Bowl', sellingPrice: 220, recipeCode: 'REC-SOUP-KOKUM' },
  { menuCode: 'SOUP-CAFREAL', variantCode: 'PORTION_250ML', variantName: '250ml Bowl', sellingPrice: 260, recipeCode: 'REC-SOUP-CAFREAL' },
  { menuCode: 'STARTER-DAMAO-PNR', variantCode: 'REGULAR', variantName: 'Regular (6 Batons)', sellingPrice: 380, recipeCode: 'REC-DAMAO-PNR' },
  { menuCode: 'STARTER-DAMAO-CHK', variantCode: 'REGULAR', variantName: 'Regular (6 Pieces)', sellingPrice: 440, recipeCode: 'REC-DAMAO-CHK' },
  { menuCode: 'MAIN-DAMAO-CURRY', variantCode: 'SURMAI', variantName: 'King Mackerel (Surmai)', sellingPrice: 650, recipeCode: 'REC-MAIN-DAMAO-SURMAI' },
  { menuCode: 'RICE-BIRYANI-CHK', variantCode: 'FULL', variantName: 'Full Handi', sellingPrice: 480, recipeCode: 'REC-BIRYANI-CHK' }
];

export const COASTAL_BISTRO_FOOD_RECIPES = [
  { recipeCode: 'REC-SOUP-KOKUM', recipeName: 'Kokum Coconut Soup Recipe', ingredientCode: 'RM0314', quantity: 0.03, unit: 'KG' },
  { recipeCode: 'REC-SOUP-KOKUM', recipeName: 'Kokum Coconut Soup Recipe', ingredientCode: 'RM0411', quantity: 0.1, unit: 'LTR' },
  { recipeCode: 'REC-SOUP-CAFREAL', recipeName: 'Green Chicken Soup Recipe', ingredientCode: 'RM0101', quantity: 0.08, unit: 'KG' },
  { recipeCode: 'REC-SOUP-CAFREAL', recipeName: 'Green Chicken Soup Recipe', ingredientCode: 'SF0003', quantity: 0.02, unit: 'KG' },
  { recipeCode: 'REC-DAMAO-PNR', recipeName: 'Smoked Damao Paneer Recipe', ingredientCode: 'RM0301', quantity: 0.18, unit: 'KG' },
  { recipeCode: 'REC-DAMAO-PNR', recipeName: 'Smoked Damao Paneer Recipe', ingredientCode: 'SF0001', quantity: 0.04, unit: 'KG' },
  { recipeCode: 'REC-DAMAO-PNR', recipeName: 'Smoked Damao Paneer Recipe', ingredientCode: 'SF0008', quantity: 0.03, unit: 'KG' },
  { recipeCode: 'REC-DAMAO-CHK', recipeName: 'Smoked Damao Tikka Recipe', ingredientCode: 'RM0101', quantity: 0.22, unit: 'KG' },
  { recipeCode: 'REC-DAMAO-CHK', recipeName: 'Smoked Damao Tikka Recipe', ingredientCode: 'SF0001', quantity: 0.05, unit: 'KG' },
  { recipeCode: 'REC-MAIN-DAMAO-SURMAI', recipeName: 'Damao Surmai Curry Recipe', ingredientCode: 'RM0202', quantity: 0.25, unit: 'KG' },
  { recipeCode: 'REC-MAIN-DAMAO-SURMAI', recipeName: 'Damao Surmai Curry Recipe', ingredientCode: 'SF0001', quantity: 0.06, unit: 'KG' },
  { recipeCode: 'REC-MAIN-DAMAO-SURMAI', recipeName: 'Damao Surmai Curry Recipe', ingredientCode: 'RM0411', quantity: 0.15, unit: 'LTR' },
  { recipeCode: 'REC-BIRYANI-CHK', recipeName: 'Classic Chicken Biryani Recipe', ingredientCode: 'RM0102', quantity: 0.28, unit: 'KG' },
  { recipeCode: 'REC-BIRYANI-CHK', recipeName: 'Classic Chicken Biryani Recipe', ingredientCode: 'RM0403', quantity: 0.2, unit: 'KG' },
  { recipeCode: 'REC-BIRYANI-CHK', recipeName: 'Classic Chicken Biryani Recipe', ingredientCode: 'RM0409', quantity: 0.03, unit: 'KG' }
];

export const COASTAL_BISTRO_BAR_MENU = [
  { menuCode: 'COCK-MANGO-MOJ', categoryName: 'Signature Cocktails', itemName: 'Zai Mango Mojito', description: 'White rum, fresh mango puree, mint, lime and soda', isAlcoholic: true, productionRouting: 'BAR' },
  { menuCode: 'COCK-GIN-CAFREAL', categoryName: 'Signature Cocktails', itemName: 'Cafreal Botanical Gin & Tonic', description: 'Artisanal gin infused with Cafreal herbs, tonic and lime', isAlcoholic: true, productionRouting: 'BAR' }
];

export const COASTAL_BISTRO_BAR_VARIANTS = [
  { menuCode: 'COCK-MANGO-MOJ', variantCode: 'REGULAR', variantName: 'Standard Glass (350ml)', sellingPrice: 420, recipeCode: 'REC-BAR-MANGO-MOJ' },
  { menuCode: 'COCK-GIN-CAFREAL', variantCode: 'REGULAR', variantName: 'Goblet (400ml)', sellingPrice: 480, recipeCode: 'REC-BAR-GIN-CAFREAL' }
];

export const COASTAL_BISTRO_BAR_RECIPES = [
  { recipeCode: 'REC-BAR-MANGO-MOJ', recipeName: 'Zai Mango Mojito Recipe', ingredientCode: 'BAR-RUM-WHT', quantity: 60, unit: 'ML' },
  { recipeCode: 'REC-BAR-MANGO-MOJ', recipeName: 'Zai Mango Mojito Recipe', ingredientCode: 'RM0311', quantity: 0.01, unit: 'KG' },
  { recipeCode: 'REC-BAR-GIN-CAFREAL', recipeName: 'Cafreal G&T Recipe', ingredientCode: 'BAR-GIN-HERB', quantity: 60, unit: 'ML' },
  { recipeCode: 'REC-BAR-GIN-CAFREAL', recipeName: 'Cafreal G&T Recipe', ingredientCode: 'SF0007', quantity: 0.015, unit: 'KG' }
];

export const COASTAL_BISTRO_OPENING_STOCK = [
  { itemCode: 'RM0101', locationCode: 'LOC-CHILL', quantity: 45, unit: 'KG', unitCost: 280, notes: 'Opening boneless chicken stock' },
  { itemCode: 'RM0102', locationCode: 'LOC-CHILL', quantity: 30, unit: 'KG', unitCost: 220, notes: 'Opening curry cut chicken stock' },
  { itemCode: 'RM0202', locationCode: 'LOC-CHILL', quantity: 20, unit: 'KG', unitCost: 950, notes: 'Opening fresh Surmai stock' },
  { itemCode: 'RM0301', locationCode: 'LOC-CHILL', quantity: 25, unit: 'KG', unitCost: 380, notes: 'Opening fresh Paneer stock' },
  { itemCode: 'RM0403', locationCode: 'LOC-MWH', quantity: 150, unit: 'KG', unitCost: 114, notes: 'Opening Basmati rice bags' },
  { itemCode: 'RM0409', locationCode: 'LOC-MWH', quantity: 30, unit: 'KG', unitCost: 650, notes: 'Opening Cow Ghee tins' },
  { itemCode: 'RM0411', locationCode: 'LOC-MWH', quantity: 60, unit: 'LTR', unitCost: 150, notes: 'Opening Coconut milk cartons' },
  { itemCode: 'BAR-RUM-WHT', locationCode: 'LOC-BAR', quantity: 7500, unit: 'ML', unitCost: 1.6, notes: 'Opening White Rum bottles (10 bottles)' },
  { itemCode: 'BAR-GIN-HERB', locationCode: 'LOC-BAR', quantity: 6000, unit: 'ML', unitCost: 2.4, notes: 'Opening Coastal Gin bottles (8 bottles)' },
  { itemCode: 'SF0001', locationCode: 'LOC-CHILL', quantity: 12, unit: 'KG', unitCost: 350, notes: 'Opening Damao Masala batch' },
  { itemCode: 'SF0003', locationCode: 'LOC-CHILL', quantity: 10, unit: 'KG', unitCost: 290, notes: 'Opening Cafreal Marinade batch' },
  { itemCode: 'SF0007', locationCode: 'LOC-CHILL', quantity: 8, unit: 'KG', unitCost: 240, notes: 'Opening House Green Dip batch' },
  { itemCode: 'SF0008', locationCode: 'LOC-CHILL', quantity: 8, unit: 'KG', unitCost: 260, notes: 'Opening House Red Dip batch' }
];

export const FULL_COASTAL_BISTRO_PACKAGE = {
  manifest: COASTAL_BISTRO_MANIFEST,
  INVENTORY_MASTER: COASTAL_BISTRO_INVENTORY,
  SUPPLIERS: COASTAL_BISTRO_SUPPLIERS,
  FOOD_MENU: COASTAL_BISTRO_FOOD_MENU,
  FOOD_VARIANTS: COASTAL_BISTRO_FOOD_VARIANTS,
  FOOD_RECIPES: COASTAL_BISTRO_FOOD_RECIPES,
  BAR_MENU: COASTAL_BISTRO_BAR_MENU,
  BAR_VARIANTS: COASTAL_BISTRO_BAR_VARIANTS,
  BAR_RECIPES: COASTAL_BISTRO_BAR_RECIPES,
  OPENING_STOCK: COASTAL_BISTRO_OPENING_STOCK
};
