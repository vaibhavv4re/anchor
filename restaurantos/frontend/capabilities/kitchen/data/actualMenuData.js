/**
 * Capability 1.3 - Kitchen & Chef Workspace: Actual Restaurant Menu Dataset
 * Canonical Food Menu by Chef Varun Inamdar (Anchor Harbour Bar & Kitchen).
 * Supersedes previous coastal menu dataset. Recipes intentionally unlinked (recipeId: null)
 * for Phase 1 Clean Sweep; to be mapped in Phase 2 after Master Inventory compliance.
 */

function buildVariants(itemCode, defs) {
  return defs.map(([name, price, dietaryType]) => ({
    variantId: `var-${itemCode.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    variantCode: `${itemCode}-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6)}`,
    variantName: name,
    name,
    price,
    sellingPrice: price,
    dietaryType: dietaryType || undefined,
    bomMode: 'INDEPENDENT',
    scalingFactor: 1.0
  }));
}

export const ACTUAL_ANCHOR_MENU = [
  // ==========================================
  // 1. SOUPS
  // ==========================================
  {
    id: 'menu-sou-001',
    itemCode: 'MENU-SOU-001',
    itemName: 'Sopa de Tomate',
    category: 'SOUPS',
    dietaryType: 'VEG',
    sellingPrice: 250,
    description: 'With cream & croutons',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-sou-002',
    itemCode: 'MENU-SOU-002',
    itemName: 'Manchow Soup',
    category: 'SOUPS',
    dietaryType: 'NON_VEG',
    sellingPrice: 250,
    hasVariants: true,
    variants: buildVariants('MENU-SOU-002', [
      ['Vegetables', 250, 'VEG'],
      ['Chicken', 275, 'NON_VEG'],
      ['Prawns', 305, 'NON_VEG'],
      ['Crab', 325, 'NON_VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-sou-003',
    itemCode: 'MENU-SOU-003',
    itemName: 'Red Dragon Soup',
    category: 'SOUPS',
    dietaryType: 'NON_VEG',
    sellingPrice: 250,
    hasVariants: true,
    variants: buildVariants('MENU-SOU-003', [
      ['Vegetables', 250, 'VEG'],
      ['Chicken', 275, 'NON_VEG'],
      ['Prawns', 305, 'NON_VEG'],
      ['Crab', 325, 'NON_VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },

  // ==========================================
  // 2. SHARING PLATES — FROM THE GARDEN
  // ==========================================
  {
    id: 'menu-spg-001',
    itemCode: 'MENU-SPG-001',
    itemName: 'Gobhi Manchurian',
    category: 'SHARING PLATES - FROM THE GARDEN',
    dietaryType: 'VEG',
    sellingPrice: 330,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spg-002',
    itemCode: 'MENU-SPG-002',
    itemName: 'Dragon Paneer',
    category: 'SHARING PLATES - FROM THE GARDEN',
    dietaryType: 'VEG',
    sellingPrice: 385,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spg-003',
    itemCode: 'MENU-SPG-003',
    itemName: 'Masala Crispy Corn',
    category: 'SHARING PLATES - FROM THE GARDEN',
    dietaryType: 'VEG',
    sellingPrice: 330,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },

  // ==========================================
  // 2. SHARING PLATES — FROM THE PASTURE
  // ==========================================
  {
    id: 'menu-spp-001',
    itemCode: 'MENU-SPP-001',
    itemName: 'Chicken Cafreal',
    category: 'SHARING PLATES - FROM THE PASTURE',
    dietaryType: 'NON_VEG',
    sellingPrice: 495,
    description: 'With potato wedges',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spp-002',
    itemCode: 'MENU-SPP-002',
    itemName: 'Kaleji Kali Miri',
    category: 'SHARING PLATES - FROM THE PASTURE',
    dietaryType: 'NON_VEG',
    sellingPrice: 495,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spp-003',
    itemCode: 'MENU-SPP-003',
    itemName: 'Pulicat Chicken Lollypop',
    category: 'SHARING PLATES - FROM THE PASTURE',
    dietaryType: 'NON_VEG',
    sellingPrice: 495,
    description: '65 style',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },

  // ==========================================
  // 2. SHARING PLATES — FROM THE OCEAN
  // ==========================================
  {
    id: 'menu-spo-001',
    itemCode: 'MENU-SPO-001',
    itemName: 'Rawas Koliwada',
    category: 'SHARING PLATES - FROM THE OCEAN',
    dietaryType: 'NON_VEG',
    sellingPrice: 660,
    description: 'With Portuguese piri piri mayonnaise',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spo-002',
    itemCode: 'MENU-SPO-002',
    itemName: 'Mangalorean Prawns Ghee Roast',
    category: 'SHARING PLATES - FROM THE OCEAN',
    dietaryType: 'NON_VEG',
    sellingPrice: 715,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spo-003',
    itemCode: 'MENU-SPO-003',
    itemName: 'Crabs Butter Garlic',
    category: 'SHARING PLATES - FROM THE OCEAN',
    dietaryType: 'NON_VEG',
    sellingPrice: 0,
    isMarketPrice: true,
    description: 'As per catch (Market price)',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },

  // ==========================================
  // 2. SHARING PLATES — FROM THE TANDOOR
  // ==========================================
  {
    id: 'menu-spt-001',
    itemCode: 'MENU-SPT-001',
    itemName: 'Tandoori Aloo',
    category: 'SHARING PLATES - FROM THE TANDOOR',
    dietaryType: 'VEG',
    sellingPrice: 330,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spt-002',
    itemCode: 'MENU-SPT-002',
    itemName: 'Banjara Broccoli Tikka',
    category: 'SHARING PLATES - FROM THE TANDOOR',
    dietaryType: 'VEG',
    sellingPrice: 360,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spt-003',
    itemCode: 'MENU-SPT-003',
    itemName: 'Paneer Coentros Salsa',
    category: 'SHARING PLATES - FROM THE TANDOOR',
    dietaryType: 'VEG',
    sellingPrice: 415,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spt-004',
    itemCode: 'MENU-SPT-004',
    itemName: 'Tandoori Jheenga',
    category: 'SHARING PLATES - FROM THE TANDOOR',
    dietaryType: 'NON_VEG',
    sellingPrice: 765,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spt-005',
    itemCode: 'MENU-SPT-005',
    itemName: 'Classic Chicken Tikka',
    category: 'SHARING PLATES - FROM THE TANDOOR',
    dietaryType: 'NON_VEG',
    sellingPrice: 545,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spt-006',
    itemCode: 'MENU-SPT-006',
    itemName: 'Chicken Mamna',
    category: 'SHARING PLATES - FROM THE TANDOOR',
    dietaryType: 'NON_VEG',
    sellingPrice: 660,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-spt-007',
    itemCode: 'MENU-SPT-007',
    itemName: 'Mutton Mamna',
    category: 'SHARING PLATES - FROM THE TANDOOR',
    dietaryType: 'NON_VEG',
    sellingPrice: 825,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },

  // ==========================================
  // 3. FROM THE WOOD FIRED GRILL
  // ==========================================
  {
    id: 'menu-wfg-001',
    itemCode: 'MENU-WFG-001',
    itemName: 'Tandoori Eggs',
    category: 'FROM THE WOOD FIRED GRILL',
    dietaryType: 'NON_VEG',
    sellingPrice: 495,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-wfg-002',
    itemCode: 'MENU-WFG-002',
    itemName: 'Tandoori Pomfret',
    category: 'FROM THE WOOD FIRED GRILL',
    dietaryType: 'NON_VEG',
    sellingPrice: 0,
    isMarketPrice: true,
    description: 'As per catch',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-wfg-003',
    itemCode: 'MENU-WFG-003',
    itemName: 'Prawns Mirchi Tandoori',
    category: 'FROM THE WOOD FIRED GRILL',
    dietaryType: 'NON_VEG',
    sellingPrice: 715,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-wfg-004',
    itemCode: 'MENU-WFG-004',
    itemName: 'Chicken Peri Peri Tikka',
    category: 'FROM THE WOOD FIRED GRILL',
    dietaryType: 'NON_VEG',
    sellingPrice: 605,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-wfg-005',
    itemCode: 'MENU-WFG-005',
    itemName: 'Barbeque Sticky Wings',
    category: 'FROM THE WOOD FIRED GRILL',
    dietaryType: 'NON_VEG',
    sellingPrice: 605,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-wfg-006',
    itemCode: 'MENU-WFG-006',
    itemName: 'Mutton Boti Kebab',
    category: 'FROM THE WOOD FIRED GRILL',
    dietaryType: 'NON_VEG',
    sellingPrice: 825,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },

  // ==========================================
  // 4. MAINS — OLD CALCUTTA CHINESE
  // ==========================================
  {
    id: 'menu-occ-001',
    itemCode: 'MENU-OCC-001',
    itemName: 'American Chopsuey',
    category: 'MAINS - OLD CALCUTTA CHINESE',
    dietaryType: 'NON_VEG',
    sellingPrice: 415,
    hasVariants: true,
    variants: buildVariants('MENU-OCC-001', [
      ['Vegetables', 415, 'VEG'],
      ['Chicken & Egg', 495, 'NON_VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-occ-002',
    itemCode: 'MENU-OCC-002',
    itemName: 'Schezwan Gravy',
    category: 'MAINS - OLD CALCUTTA CHINESE',
    dietaryType: 'NON_VEG',
    sellingPrice: 330,
    hasVariants: true,
    variants: buildVariants('MENU-OCC-002', [
      ['Veg Balls', 330, 'VEG'],
      ['Mushroom', 385, 'VEG'],
      ['Egg Frittata', 385, 'NON_VEG'],
      ['Chicken', 415, 'NON_VEG'],
      ['Paneer', 440, 'VEG'],
      ['Prawns', 495, 'NON_VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-occ-003',
    itemCode: 'MENU-OCC-003',
    itemName: 'Manchurian Gravy',
    category: 'MAINS - OLD CALCUTTA CHINESE',
    dietaryType: 'NON_VEG',
    sellingPrice: 330,
    hasVariants: true,
    variants: buildVariants('MENU-OCC-003', [
      ['Veg Balls', 330, 'VEG'],
      ['Mushroom', 385, 'VEG'],
      ['Egg Frittata', 385, 'NON_VEG'],
      ['Chicken', 415, 'NON_VEG'],
      ['Paneer', 440, 'VEG'],
      ['Prawns', 495, 'NON_VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-occ-004',
    itemCode: 'MENU-OCC-004',
    itemName: 'Hakka Noodles',
    category: 'MAINS - OLD CALCUTTA CHINESE',
    dietaryType: 'NON_VEG',
    sellingPrice: 360,
    hasVariants: true,
    variants: buildVariants('MENU-OCC-004', [
      ['Vegetables', 360, 'VEG'],
      ['Egg', 415, 'NON_VEG'],
      ['Chicken & Egg', 440, 'NON_VEG'],
      ['Prawns', 495, 'NON_VEG'],
      ['Mixed', 605, 'NON_VEG'],
      ['Mutton', 660, 'NON_VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-occ-005',
    itemCode: 'MENU-OCC-005',
    itemName: 'Fried Rice',
    category: 'MAINS - OLD CALCUTTA CHINESE',
    dietaryType: 'NON_VEG',
    sellingPrice: 360,
    hasVariants: true,
    variants: buildVariants('MENU-OCC-005', [
      ['Vegetables', 360, 'VEG'],
      ['Egg', 415, 'NON_VEG'],
      ['Chicken & Egg', 440, 'NON_VEG'],
      ['Prawns', 495, 'NON_VEG'],
      ['Mixed', 605, 'NON_VEG'],
      ['Mutton', 660, 'NON_VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-occ-006',
    itemCode: 'MENU-OCC-006',
    itemName: 'Manchurian Rice',
    category: 'MAINS - OLD CALCUTTA CHINESE',
    dietaryType: 'NON_VEG',
    sellingPrice: 360,
    hasVariants: true,
    variants: buildVariants('MENU-OCC-006', [
      ['Vegetables', 360, 'VEG'],
      ['Egg', 385, 'NON_VEG'],
      ['Chicken & Egg', 440, 'NON_VEG'],
      ['Prawns', 495, 'NON_VEG'],
      ['Mixed', 605, 'NON_VEG'],
      ['Mutton', 660, 'NON_VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-occ-007',
    itemCode: 'MENU-OCC-007',
    itemName: 'Schezwan Sauce (Add-on)',
    category: 'MAINS - OLD CALCUTTA CHINESE',
    dietaryType: 'VEG',
    sellingPrice: 110,
    description: 'Applies to Hakka Noodles / Fried Rice',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },

  // ==========================================
  // 5. MAINS — INDIAN REGIONAL & COASTAL CURRIES
  // ==========================================
  {
    id: 'menu-irc-001',
    itemCode: 'MENU-IRC-001',
    itemName: 'Malabari Pomfret Moilee',
    category: 'MAINS - INDIAN REGIONAL & COASTAL CURRIES',
    dietaryType: 'NON_VEG',
    sellingPrice: 715,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-irc-002',
    itemCode: 'MENU-IRC-002',
    itemName: 'Chulivarcha Kombdi Rassa',
    category: 'MAINS - INDIAN REGIONAL & COASTAL CURRIES',
    dietaryType: 'NON_VEG',
    sellingPrice: 605,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-irc-003',
    itemCode: 'MENU-IRC-003',
    itemName: 'Agri Mutton Curry',
    category: 'MAINS - INDIAN REGIONAL & COASTAL CURRIES',
    dietaryType: 'NON_VEG',
    sellingPrice: 825,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-irc-004',
    itemCode: 'MENU-IRC-004',
    itemName: 'Goan Curry',
    category: 'MAINS - INDIAN REGIONAL & COASTAL CURRIES',
    dietaryType: 'NON_VEG',
    sellingPrice: 0,
    isMarketPrice: true,
    description: 'As per catch',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-irc-005',
    itemCode: 'MENU-IRC-005',
    itemName: 'Andhra Vepudu',
    category: 'MAINS - INDIAN REGIONAL & COASTAL CURRIES',
    dietaryType: 'NON_VEG',
    sellingPrice: 0,
    isMarketPrice: true,
    description: 'As per catch',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-irc-006',
    itemCode: 'MENU-IRC-006',
    itemName: 'Fresh Catch of the Day',
    category: 'MAINS - INDIAN REGIONAL & COASTAL CURRIES',
    dietaryType: 'NON_VEG',
    sellingPrice: 0,
    isMarketPrice: true,
    description: 'As per catch',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },

  // ==========================================
  // 6. LENTILS & RICE
  // ==========================================
  {
    id: 'menu-lar-001',
    itemCode: 'MENU-LAR-001',
    itemName: 'Dal Tadka',
    category: 'LENTILS & RICE',
    dietaryType: 'VEG',
    sellingPrice: 275,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-lar-002',
    itemCode: 'MENU-LAR-002',
    itemName: 'Dal Makhani',
    category: 'LENTILS & RICE',
    dietaryType: 'VEG',
    sellingPrice: 360,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-lar-003',
    itemCode: 'MENU-LAR-003',
    itemName: 'Dal Gosht',
    category: 'LENTILS & RICE',
    dietaryType: 'NON_VEG',
    sellingPrice: 715,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-lar-004',
    itemCode: 'MENU-LAR-004',
    itemName: 'Steamed Rice',
    category: 'LENTILS & RICE',
    dietaryType: 'VEG',
    sellingPrice: 165,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-lar-005',
    itemCode: 'MENU-LAR-005',
    itemName: 'Ghee Jeera Rice',
    category: 'LENTILS & RICE',
    dietaryType: 'VEG',
    sellingPrice: 215,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-lar-006',
    itemCode: 'MENU-LAR-006',
    itemName: 'Bombay Tawa Biryani',
    category: 'LENTILS & RICE',
    dietaryType: 'NON_VEG',
    sellingPrice: 495,
    hasVariants: true,
    variants: buildVariants('MENU-LAR-006', [
      ['Paneer Tikka', 495, 'VEG'],
      ['Tandoori Jheenga', 715, 'NON_VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-lar-007',
    itemCode: 'MENU-LAR-007',
    itemName: 'Cocktail Chicken Biryani',
    category: 'LENTILS & RICE',
    dietaryType: 'NON_VEG',
    sellingPrice: 825,
    description: 'With tikka, kaleji & seekh kebab',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },

  // ==========================================
  // 7. BREADS
  // ==========================================
  {
    id: 'menu-brd-001',
    itemCode: 'MENU-BRD-001',
    itemName: 'Home-baked Poiee',
    category: 'BREADS',
    dietaryType: 'VEG',
    sellingPrice: 70,
    portionSize: '2 pcs',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-brd-002',
    itemCode: 'MENU-BRD-002',
    itemName: 'Home-baked Laadi Pav',
    category: 'BREADS',
    dietaryType: 'VEG',
    sellingPrice: 45,
    portionSize: '2 pcs',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-brd-003',
    itemCode: 'MENU-BRD-003',
    itemName: 'Whole Wheat Tandoori Roti',
    category: 'BREADS',
    dietaryType: 'VEG',
    sellingPrice: 55,
    hasVariants: true,
    variants: buildVariants('MENU-BRD-003', [
      ['Plain', 55, 'VEG'],
      ['Butter', 70, 'VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-brd-004',
    itemCode: 'MENU-BRD-004',
    itemName: 'Whole Wheat Lachcha Paratha',
    category: 'BREADS',
    dietaryType: 'VEG',
    sellingPrice: 105,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-brd-005',
    itemCode: 'MENU-BRD-005',
    itemName: 'Naan',
    category: 'BREADS',
    dietaryType: 'VEG',
    sellingPrice: 80,
    hasVariants: true,
    variants: buildVariants('MENU-BRD-005', [
      ['Plain', 80, 'VEG'],
      ['Butter', 90, 'VEG'],
      ['Garlic', 105, 'VEG'],
      ['Masala', 105, 'VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-brd-006',
    itemCode: 'MENU-BRD-006',
    itemName: 'Whole Wheat Ajwaini Tawa Paratha',
    category: 'BREADS',
    dietaryType: 'VEG',
    sellingPrice: 105,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },

  // ==========================================
  // 8. DESSERT ARMÁRIO
  // ==========================================
  {
    id: 'menu-des-001',
    itemCode: 'MENU-DES-001',
    itemName: 'Home-baked Bebinca Cake',
    category: 'DESSERT ARMÁRIO',
    dietaryType: 'VEG',
    sellingPrice: 220,
    description: 'With vanilla ice cream',
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-des-002',
    itemCode: 'MENU-DES-002',
    itemName: 'Alphonso Mango',
    category: 'DESSERT ARMÁRIO',
    dietaryType: 'VEG',
    sellingPrice: 220,
    routing: 'KITCHEN_LINE',
    recipeId: null
  },
  {
    id: 'menu-des-003',
    itemCode: 'MENU-DES-003',
    itemName: 'Ice Cream Selection',
    category: 'DESSERT ARMÁRIO',
    dietaryType: 'VEG',
    sellingPrice: 165,
    hasVariants: true,
    variants: buildVariants('MENU-DES-003', [
      ['Kalkatta Meetha Paan', 165, 'VEG'],
      ['Mishri Gulkand', 165, 'VEG'],
      ['Malabar Vanilla', 165, 'VEG'],
      ['Caramel Butterscotch', 165, 'VEG'],
      ['Strawberry Jam & Almonds', 165, 'VEG'],
      ['Masala Peru', 165, 'VEG'],
      ['Dry Fruit Overload', 165, 'VEG']
    ]),
    routing: 'KITCHEN_LINE',
    recipeId: null
  }
];
