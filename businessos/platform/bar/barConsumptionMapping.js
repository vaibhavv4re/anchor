/**
 * BusinessOS Platform - Bar Consumption Mapping Engine (Phase B-02B.1)
 *
 * Authoritative machine-readable contract reconciling Bar Menu Items (64 items)
 * with the Bar Inventory Master Catalog (50 SKUs) and Recipes engine.
 *
 * Enforces 3 distinct consumption models:
 *   1. POUR: Single-ingredient spirit/wine served by peg/glass. Deduction derived strictly in Base UOM (LTR).
 *   2. UNIT: Sealed bottle/can (beers, breezers, soft drinks). Commercial UNIT mode mapped to Base UOM deduction (LTR).
 *   3. RECIPE: Multi-ingredient cocktails/mocktails. Requires composite BOM recipe.
 *
 * Invariants:
 *   - Zero dummy 1-line recipes for straight drinks.
 *   - Deduction strictly respects the inventory master's Base UOM (e.g. 0.650 LTR for 650ml beer bottle).
 *   - Explicit beer mapping (RC-BAR-143 -> BAR0044 Carlsberg Elephant, RC-BAR-144 -> BAR0043 Budweiser Magnum).
 *   - Business pricing review flags surfaced cleanly without invented data.
 */

// 1. Explicit 1:1 Mapping of Bar Menu Codes to Inventory Master SKUs (50 Items)
export const BAR_SKU_MAP = Object.freeze({
  // House Wines (RC-BAR-101 .. 103)
  'RC-BAR-101': 'BAR0001', // Red Wine
  'RC-BAR-102': 'BAR0002', // White Wine
  'RC-BAR-103': 'BAR0003', // Sparkling White

  // Single Malt Scotch Whisky (RC-BAR-104 .. 105)
  'RC-BAR-104': 'BAR0004', // Glenfiddich 12 Yr Old
  'RC-BAR-105': 'BAR0005', // Singleton Luscious 12 Yr Old

  // Blended Scotch Whisky (RC-BAR-106 .. 116)
  'RC-BAR-106': 'BAR0006', // Chivas Regal 12 Yrs
  'RC-BAR-107': 'BAR0007', // J.W. Black Label
  'RC-BAR-108': 'BAR0008', // J.W. Red Label
  'RC-BAR-109': 'BAR0009', // Jack Daniels
  'RC-BAR-110': 'BAR0010', // Black Dog Gold
  'RC-BAR-111': 'BAR0011', // Teachers Highland
  'RC-BAR-112': 'BAR0012', // 100 Pipers
  'RC-BAR-113': 'BAR0013', // Black & White
  'RC-BAR-114': 'BAR0014', // Vat 69
  'RC-BAR-115': 'BAR0015', // Ballantine's Finest Scotch
  'RC-BAR-116': 'BAR0016', // Jameson (Catalog: Jamson)

  // Premium Whisky (RC-BAR-117 .. 119)
  'RC-BAR-117': 'BAR0017', // Blenders Pride Reserve
  'RC-BAR-118': 'BAR0018', // Blenders Pride
  'RC-BAR-119': 'BAR0019', // Antiquity Blue

  // Domestic Whisky (RC-BAR-120 .. 123)
  'RC-BAR-120': 'BAR0020', // Signature
  'RC-BAR-121': 'BAR0021', // Royal Challenge
  'RC-BAR-122': 'BAR0022', // Royal Stag
  'RC-BAR-123': 'BAR0023', // Imperial Blue

  // Brandy (RC-BAR-124 .. 125)
  'RC-BAR-124': 'BAR0024', // Monarch Brandy
  'RC-BAR-125': 'BAR0025', // Dr. Brandy

  // Gin (RC-BAR-126 .. 127)
  'RC-BAR-126': 'BAR0026', // Bombay Sapphire
  'RC-BAR-127': 'BAR0027', // Greater Than London Dry Gin (Catalog: Greater Than Londan)

  // Tequila (RC-BAR-128)
  'RC-BAR-128': 'BAR0028', // Don Julio Blanco

  // Vodka (RC-BAR-129 .. 132)
  'RC-BAR-129': 'BAR0029', // Absolut (Catalog: Absolute)
  'RC-BAR-130': 'BAR0030', // Smirnoff No. 21 Red
  'RC-BAR-131': 'BAR0031', // Smirnoff Minty Jamun
  'RC-BAR-132': 'BAR0032', // Smirnoff Green Apple

  // Rum (RC-BAR-133 .. 134)
  'RC-BAR-133': 'BAR0033', // Bacardi White
  'RC-BAR-134': 'BAR0034', // Old Monk

  // Mild Beers (RC-BAR-135 .. 143)
  'RC-BAR-135': 'BAR0035', // Budweiser Mild
  'RC-BAR-136': 'BAR0036', // Kingfisher Ultra
  'RC-BAR-137': 'BAR0037', // Kingfisher Mild
  'RC-BAR-138': 'BAR0038', // Tuborg
  'RC-BAR-139': 'BAR0039', // Heineken
  'RC-BAR-140': 'BAR0040', // Hoegaarden (Catalog: Hoegarden)
  'RC-BAR-141': 'BAR0041', // Corona
  'RC-BAR-142': 'BAR0042', // London Pilsner
  'RC-BAR-143': 'BAR0044', // Carlsberg Elephant (Explicitly mapped to BAR0044 Elephant)

  // Strong Beers (RC-BAR-144 .. 146)
  'RC-BAR-144': 'BAR0043', // Budweiser Magnum (Explicitly mapped to BAR0043 Magnum)
  'RC-BAR-145': 'BAR0045', // Tuborg Strong
  'RC-BAR-146': 'BAR0046', // Kingfisher Strong

  // Breezer (RC-BAR-161)
  'RC-BAR-161': 'BAR0047', // Breezer

  // Non-Alcoholic Beverages & Mixers (RC-BAR-162 .. 164)
  'RC-BAR-162': 'BAR0048', // Bottled Water
  'RC-BAR-163': 'BAR0049', // Cold Drink
  'RC-BAR-164': 'BAR0050'  // Soda
});

// 2. Cocktails & Mocktails (14 Items strictly requiring multi-ingredient BOM recipes)
export const BAR_COCKTAIL_CODES = Object.freeze(new Set([
  'RC-BAR-147', // Seaside Balcony - Savoury
  'RC-BAR-148', // Afternoon Garden - Floral
  'RC-BAR-149', // Kitchen pantry - Herbs & Spices
  'RC-BAR-150', // Feni Cellar - Refreshing
  'RC-BAR-151', // Orchard - Fruity / Spicy
  'RC-BAR-152', // Courtyard - Summery
  'RC-BAR-153', // Sunset terrace - Sundowner
  'RC-BAR-154', // Tropical Grove
  'RC-BAR-155', // Virgin Watermelon & Basil Mojito
  'RC-BAR-156', // Shikanji
  'RC-BAR-157', // Ginger me (Frozen)
  'RC-BAR-158', // Mango Mastani
  'RC-BAR-159', // Guava Mary
  'RC-BAR-160'  // Fresh Juice
]));

// 3. Authoritative Standard Bottle / Pack Volume in ML per SKU
export const BAR_PACK_SIZE_ML = Object.freeze({
  // Standard 650ml Indian Beer Bottles
  'BAR0035': 650, // Budweiser Mild
  'BAR0036': 650, // Kingfisher Ultra
  'BAR0037': 650, // Kingfisher Mild
  'BAR0038': 650, // Tuborg
  'BAR0042': 650, // London Pilsner
  'BAR0043': 650, // Budweiser Magnum
  'BAR0044': 650, // Carlsberg Elephant
  'BAR0045': 650, // Tuborg Strong
  'BAR0046': 650, // Kingfisher Strong

  // 330ml Pints / Import Bottles
  'BAR0039': 330, // Heineken
  'BAR0040': 330, // Hoegaarden
  'BAR0041': 330, // Corona

  // Breezer
  'BAR0047': 275, // Breezer (275ml)

  // Soft Beverages
  'BAR0048': 750, // Bottled Water (750ml)
  'BAR0049': 300, // Cold Drink Can/Bottle (300ml)
  'BAR0050': 300, // Soda Bottle (300ml)

  // Standard Spirits & Wines (750ml standard bottle)
  'DEFAULT_BOTTLE': 750
});

/**
 * Resolve configured bottle/pack size in ML for a given inventory item code.
 * Item-master content wins when present (content_quantity x content_uom); the
 * legacy hardcoded map is retained as a fallback so existing SKUs are unchanged.
 * @param {string} itemCode inventory SKU (e.g. BAR0044)
 * @param {Object} [item] resolved inventory master item (optional)
 */
export function getBarPackSizeMl(itemCode, item = null) {
  const code = String(itemCode || '').toUpperCase();
  if (item) {
    const cq = parseFloat(item.contentQuantity != null ? item.contentQuantity : item.content_quantity) || 0;
    const cu = String(item.contentUom || item.content_uom || '').toUpperCase().trim();
    if (cq > 0 && cu) {
      if (cu === 'ML') return cq;
      if (cu === 'LTR' || cu === 'L') return cq * 1000;
    }
  }
  return BAR_PACK_SIZE_ML[code] || BAR_PACK_SIZE_ML.DEFAULT_BOTTLE;
}

/**
 * Authoritative Bar Consumption Resolution Contract.
 * Translates a menu item and variant selection into an exact inventory deduction directive.
 *
 * @param {Object} menuItem { itemCode, itemName, category, recipeId, routing, ... }
 * @param {Object} [variant] { name, servingSize, servingUnit, sellingPrice, ... }
 * @param {Object} [options] { orderQty = 1, inventoryMaster = null }
 * @returns {Object} Consumption resolution envelope
 */
export function resolveBarConsumption(menuItem, variant = null, options = {}) {
  const itemCode = String(menuItem.itemCode || menuItem.item_code || menuItem.id || '').toUpperCase();
  const orderQty = parseFloat(options.orderQty || 1);
  const cat = String(menuItem.category || menuItem.category_code || '').toUpperCase();

  // 1. RECIPE MODE: Cocktails and Mocktails
  if (BAR_COCKTAIL_CODES.has(itemCode) || cat.includes('COCKTAIL') || cat.includes('MOCKTAIL')) {
    const recipeId = menuItem.recipeId || menuItem.recipe_id || null;
    return {
      success: true,
      mode: 'RECIPE',
      menuItemCode: itemCode,
      menuItemName: menuItem.itemName || menuItem.item_name || itemCode,
      recipeRequired: true,
      recipeId,
      consumption: [], // Deferred to B-02C Recipe Studio
      notes: recipeId ? `BOM recipe ${recipeId} required` : 'Unlinked: requires authentic recipe BOM'
    };
  }

  // 2. DIRECT SKU MAPPING (POUR or UNIT)
  const mappedSku = BAR_SKU_MAP[itemCode];
  if (!mappedSku) {
    return {
      success: false,
      error: `No inventory SKU mapping established for Bar menu item "${itemCode}".`,
      menuItemCode: itemCode
    };
  }

  // Determine commercial consumption mode
  const isBeerOrBreezer = cat.includes('BEER') || cat.includes('BREEZER');
  const isSoftDrink = cat.includes('BEVERAGE');
  const vName = String(variant?.name || variant?.variantName || '').toLowerCase();

  const mode = isBeerOrBreezer ? 'UNIT' : (isSoftDrink && vName.includes('portion') ? 'UNIT' : 'POUR');

  let deductionQtyPerServing = 0;
  // Resolve the item's canonical stock unit (hybrid packaging model): packaged
  // beverages may be stocked by count (PCS) while poured spirits/wine are stocked
  // by volume (LTR). Falls back to LTR when no inventory-master item is supplied.
  const invItem = options.inventoryItem
    || (Array.isArray(options.inventoryMaster)
      ? options.inventoryMaster.find(it => {
          const c = String(it.itemCode || it.item_code || it.sku || it.id || '').toUpperCase().trim();
          return c && c === mappedSku;
        })
      : null)
    || null;
  const stockUom = String((invItem && (invItem.baseUom || invItem.base_uom || invItem.baseUnit)) || 'LTR').toUpperCase().trim();
  let baseUom = (stockUom === 'L') ? 'LTR' : stockUom; // Authoritative base UOM for this Bar SKU

  if (mode === 'POUR') {
    // Determine ML volume from variant serving size
    let servingMl = 0;
    if (variant) {
      if (variant.servingSize && (variant.servingUnit === 'ML' || String(variant.servingUnit).toUpperCase() === 'ML')) {
        servingMl = parseFloat(variant.servingSize);
      } else if (vName.includes('30')) {
        servingMl = 30;
      } else if (vName.includes('60')) {
        servingMl = 60;
      } else if (vName.includes('200') || vName.includes('glass')) {
        servingMl = 200;
      } else if (vName.includes('750') || vName.includes('bottle')) {
        servingMl = 750;
      }
    }

    if (servingMl <= 0) {
      return {
        success: false,
        error: `Cannot resolve POUR volume for variant "${variant?.name || 'Unknown'}" on ${itemCode}. Undefined serving size.`,
        menuItemCode: itemCode
      };
    }

    // Convert ML directly to Base UOM (LTR): 30ml -> 0.030 LTR, 60ml -> 0.060 LTR
    deductionQtyPerServing = servingMl / 1000.0;
  } else {
    // UNIT mode (Beers, Breezers, Bottled Water, Cans/Bottles).
    //   - Stocked by count (PCS/NOS): deduct 1 stock unit per sold unit (a physical can/bottle).
    //   - Stocked by volume (LTR, legacy default): deduct the pack content in litres,
    //     derived from item content when present, else the legacy ml map (e.g. 650ml -> 0.650 LTR).
    if (baseUom === 'PCS' || baseUom === 'NOS' || baseUom === 'PC') {
      deductionQtyPerServing = 1;
    } else {
      const packMl = getBarPackSizeMl(mappedSku, invItem);
      deductionQtyPerServing = packMl / 1000.0;
    }
  }

  const totalDeduction = parseFloat((deductionQtyPerServing * orderQty).toFixed(4));

  return {
    success: true,
    mode,
    menuItemCode: itemCode,
    menuItemName: menuItem.itemName || menuItem.item_name || itemCode,
    inventoryItemCode: mappedSku,
    inventoryItemName: menuItem.itemName || menuItem.item_name || mappedSku,
    baseUom,
    deductionPerServing: deductionQtyPerServing,
    orderQuantity: orderQty,
    totalDeduction,
    recipeRequired: false,
    notes: `${mode} deduction of ${totalDeduction} ${baseUom} from ${mappedSku}`
  };
}

/**
 * Returns structured catalog items requiring business pricing review.
 * Strictly avoids guessing or inventing prices.
 */
export function getBarCatalogAuditFlags() {
  return [
    {
      itemCode: 'RC-BAR-109',
      itemName: 'Jack Daniels',
      issueType: 'DUPLICATE_PRICING_TIERS',
      details: 'Contains competing 30ml/60ml (₹320/₹600) and Small/Large (₹150/₹250) tiers. Requires business decision on authoritative price.'
    },
    {
      itemCode: 'RC-BAR-116',
      itemName: 'Jameson',
      issueType: 'DUPLICATE_PRICING_TIERS',
      details: 'Contains competing 30ml/60ml (₹260/₹490) and Small/Large (₹180/₹320) tiers. Requires business decision on authoritative price.'
    },
    {
      category: 'MILD BEER',
      itemCodes: ['RC-BAR-135', 'RC-BAR-136', 'RC-BAR-137', 'RC-BAR-138', 'RC-BAR-139', 'RC-BAR-140', 'RC-BAR-141', 'RC-BAR-142', 'RC-BAR-143'],
      issueType: 'ZERO_SELLING_PRICE',
      details: '9 Mild Beers have selling_price = 0 on menu item. Requires menu selling price entry.'
    },
    {
      category: 'STRONG BEER',
      itemCodes: ['RC-BAR-144', 'RC-BAR-145', 'RC-BAR-146'],
      issueType: 'ZERO_SELLING_PRICE',
      details: '3 Strong Beers have selling_price = 0 on menu item. Requires menu selling price entry.'
    },
    {
      category: 'BREEZER',
      itemCodes: ['RC-BAR-161'],
      issueType: 'ZERO_SELLING_PRICE',
      details: 'Breezer has selling_price = 0 on menu item. Requires menu selling price entry.'
    }
  ];
}
