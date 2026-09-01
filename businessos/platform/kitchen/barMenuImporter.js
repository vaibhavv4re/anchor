/**
 * BusinessOS Platform - Universal Bar Menu Importer Engine (F8.2A)
 * Parses Excel (.xlsx) / CSV menu files into canonical menu items and first-class variants.
 * 
 * CORE CONTRACTS:
 * 1. Zero Fake BOM Generation: Creates menu skeleton + variants, flagging items as 'BOM_REQUIRED'.
 * 2. Variant Extraction: Automatically detects serving columns (30ml, 60ml, 90ml, 180ml, 330ml, 650ml, 750ml).
 * 3. Idempotent Import Batches: Prevents duplicate creations across re-imports.
 * 4. Setup Status Queue: Assigns setup status (🟢 READY, 🟡 BOM_REQUIRED, 🟡 PRICE_REQUIRED).
 */

import { kitchenMenuModel } from './kitchenMenuModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';

export const ANCHOR_HARBOUR_64_MENU_ITEMS = [
  // House Wines (3)
  { Section: 'House Wines', Item: 'Red Wine', '30 ml': 220, '60 ml': 400, '750 ml': 1800 },
  { Section: 'House Wines', Item: 'White Wine', '30 ml': 220, '60 ml': 400, '750 ml': 1800 },
  { Section: 'House Wines', Item: 'Sparkling White', '30 ml': 280, '60 ml': 520, '750 ml': 2400 },

  // Single Malt Scotch Whisky (2)
  { Section: 'Single Malt Scotch Whisky', Item: 'Glenfiddich 12 Yr Old', '30 ml': 450, '60 ml': 850, '90 ml': 1250, '180 ml': 2400 },
  { Section: 'Single Malt Scotch Whisky', Item: 'Singleton Luscious 12 Yr Old', '30 ml': 480, '60 ml': 900, '90 ml': 1320, '180 ml': 2550 },

  // Blended Scotch Whisky (11)
  { Section: 'Blended Scotch Whisky', Item: 'Chivas Regal 12 Yrs', '30 ml': 320, '60 ml': 600, '90 ml': 880, '180 ml': 1750 },
  { Section: 'Blended Scotch Whisky', Item: 'J.W. Black Label', '30 ml': 340, '60 ml': 640, '90 ml': 940, '180 ml': 1850 },
  { Section: 'Blended Scotch Whisky', Item: 'J.W. Red Label', '30 ml': 240, '60 ml': 450, '90 ml': 650, '180 ml': 1250 },
  { Section: 'Blended Scotch Whisky', Item: 'Jack Daniels', '30 ml': 320, '60 ml': 600, '90 ml': 880, '180 ml': 1750 },
  { Section: 'Blended Scotch Whisky', Item: 'Black Dog Gold', '30 ml': 260, '60 ml': 490, '90 ml': 720, '180 ml': 1400 },
  { Section: 'Blended Scotch Whisky', Item: 'Teachers Highland', '30 ml': 220, '60 ml': 400, '90 ml': 580, '180 ml': 1150 },
  { Section: 'Blended Scotch Whisky', Item: '100 Pipers', '30 ml': 200, '60 ml': 380, '90 ml': 550, '180 ml': 1050 },
  { Section: 'Blended Scotch Whisky', Item: 'Black & White', '30 ml': 200, '60 ml': 380, '90 ml': 550, '180 ml': 1050 },
  { Section: 'Blended Scotch Whisky', Item: 'Vat 69', '30 ml': 190, '60 ml': 360, '90 ml': 520, '180 ml': 990 },
  { Section: 'Blended Scotch Whisky', Item: 'Ballantine\'s Finest Scotch', '30 ml': 240, '60 ml': 450, '90 ml': 650, '180 ml': 1250 },
  { Section: 'Blended Scotch Whisky', Item: 'Jameson', '30 ml': 260, '60 ml': 490, '90 ml': 720, '180 ml': 1400 },

  // Premium Whisky (3)
  { Section: 'Premium Whisky', Item: 'Blenders Pride Reserve', '30 ml': 160, '60 ml': 300, '90 ml': 430, '180 ml': 820 },
  { Section: 'Premium Whisky', Item: 'Blenders Pride', '30 ml': 140, '60 ml': 260, '90 ml': 380, '180 ml': 720 },
  { Section: 'Premium Whisky', Item: 'Antiquity Blue', '30 ml': 160, '60 ml': 300, '90 ml': 430, '180 ml': 820 },

  // Domestic Whisky (4)
  { Section: 'Domestic Whisky', Item: 'Signature', '30 ml': 130, '60 ml': 240, '90 ml': 350, '180 ml': 660 },
  { Section: 'Domestic Whisky', Item: 'Royal Challenge', '30 ml': 120, '60 ml': 220, '90 ml': 320, '180 ml': 600 },
  { Section: 'Domestic Whisky', Item: 'Royal Stag', '30 ml': 110, '60 ml': 200, '90 ml': 290, '180 ml': 550 },
  { Section: 'Domestic Whisky', Item: 'Imperial Blue', '30 ml': 100, '60 ml': 180, '90 ml': 260, '180 ml': 490 },

  // Brandy (2)
  { Section: 'Brandy', Item: 'Monarch Brandy', '30 ml': 140, '60 ml': 260, '90 ml': 380, '180 ml': 720 },
  { Section: 'Brandy', Item: 'Dr. Brandy', '30 ml': 120, '60 ml': 220, '90 ml': 320, '180 ml': 600 },

  // Gin (2)
  { Section: 'Gin', Item: 'Bombay Sapphire', '30 ml': 260, '60 ml': 490, '90 ml': 720, '180 ml': 1400 },
  { Section: 'Gin', Item: 'Greater Than London Dry Gin', '30 ml': 180, '60 ml': 340, '90 ml': 490, '180 ml': 950 },

  // Tequila (1)
  { Section: 'Tequila', Item: 'Don Julio Blanco', '30 ml': 450, '60 ml': 850, '90 ml': 1250, '180 ml': 2400 },

  // Vodka (4)
  { Section: 'Vodka', Item: 'Absolut', '30 ml': 220, '60 ml': 400, '90 ml': 580, '180 ml': 1150 },
  { Section: 'Vodka', Item: 'Smirnoff No. 21 Red', '30 ml': 160, '60 ml': 300, '90 ml': 430, '180 ml': 820 },
  { Section: 'Vodka', Item: 'Smirnoff Minty Jamun', '30 ml': 170, '60 ml': 320, '90 ml': 460, '180 ml': 880 },
  { Section: 'Vodka', Item: 'Smirnoff Green Apple', '30 ml': 170, '60 ml': 320, '90 ml': 460, '180 ml': 880 },

  // Rum (2)
  { Section: 'Rum', Item: 'Bacardi White', '30 ml': 160, '60 ml': 300, '90 ml': 430, '180 ml': 820 },
  { Section: 'Rum', Item: 'Old Monk', '30 ml': 110, '60 ml': 200, '90 ml': 290, '180 ml': 550 },

  // Mild Beer (10)
  { Section: 'Mild Beer', Item: 'Budweiser Mild', '330 ml': 220, '650 ml': 380 },
  { Section: 'Mild Beer', Item: 'Kingfisher Ultra', '330 ml': 240, '650 ml': 420 },
  { Section: 'Mild Beer', Item: 'Kingfisher Mild', '330 ml': 180, '650 ml': 320 },
  { Section: 'Mild Beer', Item: 'Tuborg', '330 ml': 180, '650 ml': 320 },
  { Section: 'Mild Beer', Item: 'Heineken', '330 ml': 260, '650 ml': 450 },
  { Section: 'Mild Beer', Item: 'Hoegaarden', '330 ml': 340 },
  { Section: 'Mild Beer', Item: 'Corona', '330 ml': 360 },
  { Section: 'Mild Beer', Item: 'London Pilsner', '650 ml': 280 },
  { Section: 'Mild Beer', Item: 'Carlsberg Elephant', '650 ml': 360 },

  // Strong Beer (4)
  { Section: 'Strong Beer', Item: 'Budweiser Magnum', '650 ml': 420 },
  { Section: 'Strong Beer', Item: 'Tuborg Strong', '650 ml': 340 },
  { Section: 'Strong Beer', Item: 'Kingfisher Strong', '650 ml': 340 },

  // Cocktails (7)
  { Section: 'Cocktails', Item: 'Seaside Balcony - Savoury', Price: 450 },
  { Section: 'Cocktails', Item: 'Afternoon Garden - Floral', Price: 420 },
  { Section: 'Cocktails', Item: 'Kitchen pantry - Herbs & Spices', Price: 450 },
  { Section: 'Cocktails', Item: 'Feni Cellar - Refreshing', Price: 480 },
  { Section: 'Cocktails', Item: 'Orchard - Fruity / Spicy', Price: 420 },
  { Section: 'Cocktails', Item: 'Courtyard - Summery', Price: 420 },
  { Section: 'Cocktails', Item: 'Sunset terrace - Sundowner', Price: 490 },

  // Mocktails (7)
  { Section: 'Mocktails', Item: 'Tropical Grove', Price: 260 },
  { Section: 'Mocktails', Item: 'Virgin Watermelon & Basil Mojito', Price: 280 },
  { Section: 'Mocktails', Item: 'Shikanji', Price: 180 },
  { Section: 'Mocktails', Item: 'Ginger me (Frozen)', Price: 240 },
  { Section: 'Mocktails', Item: 'Mango Mastani', Price: 260 },
  { Section: 'Mocktails', Item: 'Guava Mary', Price: 240 },
  { Section: 'Mocktails', Item: 'Fresh Juice', Price: 220 },

  // Breezer (1)
  { Section: 'Breezer', Item: 'Breezer', '275 ml': 180 },

  // Beverage (4)
  { Section: 'Beverage', Item: 'Bottled Water', '750 ml': 60 },
  { Section: 'Beverage', Item: 'Cold Drink', Price: 50 },
  { Section: 'Beverage', Item: 'Soda', Price: 40 }
];

export class BarMenuImporter {
  /**
   * Non-authoritative classification suggestion for menu item consumption type
   * @param {string} categoryName 
   * @param {string} itemName 
   * @returns {'POUR' | 'UNIT' | 'RECIPE'}
   */
  static classifySuggestedConsumptionType(categoryName = '', itemName = '') {
    const catLower = (categoryName || '').toLowerCase();
    const nameLower = (itemName || '').toLowerCase();

    // Explicit bottle/can units (e.g. "Kingfisher 650ml", "Budweiser Bottle", "Coke Can")
    if (
      nameLower.includes('bottle') ||
      nameLower.includes('can') ||
      catLower.includes('beer') ||
      catLower.includes('breezer')
    ) {
      return 'UNIT';
    }

    // Cocktails & Mocktails (Multi-ingredient recipes)
    if (
      catLower.includes('cocktail') ||
      catLower.includes('mocktail') ||
      catLower.includes('shooter') ||
      nameLower.includes('mojito') ||
      nameLower.includes('margarita') ||
      nameLower.includes('martini')
    ) {
      return 'RECIPE';
    }

    // Spirit pours (Scotch, Whisky, Gin, Vodka, Tequila, Rum, Brandy, Wine)
    if (
      catLower.includes('whisky') ||
      catLower.includes('scotch') ||
      catLower.includes('bourbon') ||
      catLower.includes('brandy') ||
      catLower.includes('gin') ||
      catLower.includes('tequila') ||
      catLower.includes('vodka') ||
      catLower.includes('rum') ||
      catLower.includes('wine')
    ) {
      return 'POUR';
    }

    return 'POUR'; // default suggestion
  }

  /**
   * Parse Sheet Matrix (Array of Arrays) into Array of Row Objects with Header Detection
   * @param {Array<Array<any>>} rawMatrix 
   * @returns {Array<Object>}
   */
  static parseSheetMatrix(rawMatrix = []) {
    if (!Array.isArray(rawMatrix) || rawMatrix.length === 0) return [];

    // Find header row (row containing words like item, name, particulars, section, category, 30, 60, 90, 750, price, rate)
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(rawMatrix.length, 10); r++) {
      const rowArr = rawMatrix[r] || [];
      const rowText = rowArr.map(c => String(c).toLowerCase()).join(' ');
      if (
        rowText.includes('item') ||
        rowText.includes('particular') ||
        rowText.includes('section') ||
        rowText.includes('category') ||
        rowText.includes('beverage') ||
        rowText.includes('30') ||
        rowText.includes('60') ||
        rowText.includes('90') ||
        rowText.includes('750') ||
        rowText.includes('price') ||
        rowText.includes('rate')
      ) {
        headerRowIdx = r;
        break;
      }
    }

    let headers = [];
    let startDataIdx = 0;

    if (headerRowIdx !== -1) {
      headers = (rawMatrix[headerRowIdx] || []).map((h, i) => {
        const str = String(h).trim();
        return str.length > 0 ? str : `col_${i}`;
      });
      startDataIdx = headerRowIdx + 1;
    } else {
      // Auto-generate col_0, col_1, col_2 if no explicit header row
      const maxCols = Math.max(...rawMatrix.map(row => (Array.isArray(row) ? row.length : 0)));
      for (let i = 0; i < maxCols; i++) headers.push(`col_${i}`);
      startDataIdx = 0;
    }

    const rows = [];
    for (let r = startDataIdx; r < rawMatrix.length; r++) {
      const rowArr = rawMatrix[r] || [];
      if (!Array.isArray(rowArr) || !rowArr.some(c => String(c !== undefined && c !== null ? c : '').trim().length > 0)) {
        continue; // skip blank rows
      }
      const rowObj = {};
      headers.forEach((h, i) => {
        rowObj[h] = rowArr[i] !== undefined && rowArr[i] !== null ? rowArr[i] : '';
      });
      rows.push(rowObj);
    }
    return rows;
  }

  /**
   * Parse uploaded Excel (.xlsx/.xls) or CSV File into Array of Row Objects using SheetJS (window.XLSX)
   * @param {File} file 
   * @returns {Promise<Array<Object>>}
   */
  static parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        return reject(new Error('No file selected.'));
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          if (typeof window !== 'undefined' && window.XLSX) {
            const workbook = window.XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rawMatrix = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            const rows = this.parseSheetMatrix(rawMatrix);
            resolve(rows);
          } else {
            // Fallback text parser
            const text = new TextDecoder().decode(data);
            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
            if (lines.length === 0) return resolve([]);
            const matrix = lines.map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
            const rows = this.parseSheetMatrix(matrix);
            resolve(rows);
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Detect serving size columns from raw row object keys
   * @param {Object} sampleRow 
   * @returns {Array<{ key: string, name: string, ml: number }>}
   */
  static detectServingColumns(sampleRow) {
    const keys = Object.keys(sampleRow || {});
    const servingCols = [];

    keys.forEach(k => {
      const lower = k.toLowerCase().trim();
      if (lower.includes('30') || lower.includes('30ml') || lower.includes('peg')) {
        servingCols.push({ key: k, name: '30 ml', ml: 30 });
      } else if (lower.includes('60') || lower.includes('60ml') || lower.includes('double')) {
        servingCols.push({ key: k, name: '60 ml', ml: 60 });
      } else if (lower.includes('90') || lower.includes('90ml') || lower.includes('patiala')) {
        servingCols.push({ key: k, name: '90 ml', ml: 90 });
      } else if (lower.includes('180') || lower.includes('180ml') || lower.includes('quarter') || lower.includes('nip')) {
        servingCols.push({ key: k, name: '180 ml', ml: 180 });
      } else if (lower.includes('200') || lower.includes('200ml')) {
        servingCols.push({ key: k, name: '200 ml', ml: 200 });
      } else if (lower.includes('275') || lower.includes('275ml')) {
        servingCols.push({ key: k, name: '275 ml', ml: 275 });
      } else if (lower.includes('330') || lower.includes('330ml') || lower.includes('pint')) {
        servingCols.push({ key: k, name: '330 ml', ml: 330 });
      } else if (lower.includes('375') || lower.includes('375ml') || lower.includes('half')) {
        servingCols.push({ key: k, name: '375 ml', ml: 375 });
      } else if (lower.includes('500') || lower.includes('500ml')) {
        servingCols.push({ key: k, name: '500 ml', ml: 500 });
      } else if (lower.includes('650') || lower.includes('650ml')) {
        servingCols.push({ key: k, name: '650 ml', ml: 650 });
      } else if (lower.includes('750') || lower.includes('750ml') || lower.includes('bottle')) {
        servingCols.push({ key: k, name: '750 ml', ml: 750 });
      }
    });

    if (servingCols.length === 0) {
      // Default standard bar serving columns if not explicitly detected
      return [
        { key: '30 ml', name: '30 ml', ml: 30 },
        { key: '60 ml', name: '60 ml', ml: 60 },
        { key: '90 ml', name: '90 ml', ml: 90 },
        { key: '180 ml', name: '180 ml', ml: 180 }
      ];
    }

    return servingCols;
  }

  /**
   * Generate Idempotent Import Preview Payload from raw Excel/CSV rows
   * @param {Array<Object>} rows Array of row objects from parsed sheet
   * @param {string|null} tenantId 
   * @returns {Object} Preview analysis payload
   */
  static generateImportPreview(rows = [], tenantId = null) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        success: false,
        totalRows: 0,
        detectedItemsCount: 0,
        detectedVariantsCount: 0,
        newItemsCount: 0,
        existingItemsCount: 0,
        items: [],
        categories: [],
        errors: ['No data rows found in uploaded file.']
      };
    }

    const existingList = kitchenMenuModel.getAll(tenantId) || [];
    const existingMap = new Map();
    existingList.forEach(item => {
      const normKey = `${(item.category || '').toLowerCase()}_${(item.itemName || item.name || '').toLowerCase()}`;
      existingMap.set(normKey, item);
    });

    const parsedItems = [];
    const parsedMap = new Map(); // Map keyed by normKey (category_itemname) to group duplicate rows into 1 menu item with variants
    const categoriesSet = new Set();
    let currentCategory = 'BAR_GENERAL';
    let totalVariantsCount = 0;
    let newItemsCount = 0;
    let existingItemsCount = 0;

    const sampleRow = rows[0] || {};
    const servingCols = this.detectServingColumns(sampleRow);

    rows.forEach((row, idx) => {
      const keys = Object.keys(row || {});

      // 1. Extract category / section if present
      let sectionVal = null;
      keys.forEach(k => {
        const kLower = k.toLowerCase().trim();
        if (kLower.includes('section') || kLower.includes('category') || kLower.includes('group') || kLower.includes('class')) {
          const val = String(row[k] || '').trim();
          if (val && !['section', 'category', 'group', 'class'].includes(val.toLowerCase())) {
            sectionVal = val;
          }
        }
      });

      // 2. Extract item name
      let itemNameVal = null;
      keys.forEach(k => {
        const kLower = k.toLowerCase().trim();
        if (
          kLower.includes('item') ||
          kLower.includes('particular') ||
          kLower.includes('name') ||
          kLower.includes('beverage') ||
          kLower.includes('description') ||
          kLower.includes('drink') ||
          kLower.includes('product')
        ) {
          const val = String(row[k] || '').trim();
          if (val && !['item', 'particulars', 'name', 'item name', 'sr. no.', 'sr no', 's.no', 'description', 'beverage'].includes(val.toLowerCase())) {
            itemNameVal = val;
          }
        }
      });

      // Fallback item name search: First non-numeric text column
      if (!itemNameVal) {
        keys.forEach(k => {
          if (itemNameVal) return;
          const kLower = k.toLowerCase().trim();
          if (kLower.includes('sr') || kLower.includes('s.no') || kLower.includes('s no') || kLower.includes('#') || kLower.includes('col_0')) return;
          const val = String(row[k] || '').trim();
          if (val && isNaN(Number(val)) && val.length > 1) {
            if (!['item', 'particulars', 'name', 'category', 'section', 'description', 'rate', 'price'].includes(val.toLowerCase())) {
              itemNameVal = val;
            }
          }
        });
      }

      // Check if this row is a Category/Section Divider Row (e.g. "BLENDED SCOTCH WHISKY")
      const hasNumericPrices = keys.some(k => {
        const valStr = String(row[k] || '').trim();
        const num = parseFloat(valStr.replace(/[^0-9.]/g, ''));
        return !isNaN(num) && num > 0;
      });

      if (itemNameVal && !hasNumericPrices && !sectionVal) {
        currentCategory = itemNameVal.toUpperCase();
        categoriesSet.add(currentCategory);
        return; // skip adding divider as item
      }

      if (sectionVal) {
        currentCategory = sectionVal.toUpperCase();
        categoriesSet.add(currentCategory);
      }

      if (!itemNameVal) return; // Skip empty rows

      const itemName = itemNameRawClean(itemNameVal);
      const normKey = `${currentCategory.toLowerCase()}_${itemName.toLowerCase()}`;
      const suggestedType = BarMenuImporter.classifySuggestedConsumptionType(currentCategory, itemName);

      // Extract variants from price/serving columns in this row
      const newVariants = [];
      let basePrice = 0;

      servingCols.forEach(col => {
        const val = row[col.key] || row[col.name];
        if (val !== undefined && val !== null && val !== '') {
          const numPrice = parseFloat(String(val).replace(/[^0-9.]/g, ''));
          if (!isNaN(numPrice) && numPrice > 0) {
            if (basePrice === 0) basePrice = numPrice;
            newVariants.push({
              id: `var_${itemName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${col.ml}ml`,
              name: col.name,
              servingSize: col.ml,
              servingUnit: 'ML',
              sellingPrice: numPrice,
              availabilityStatus: 'AVAILABLE',
              productionArea: 'BAR',
              recipeId: null
            });
            totalVariantsCount++;
          }
        }
      });

      // Fallback single variant if no specific serving column price found
      if (newVariants.length === 0) {
        let directPrice = 0;
        keys.forEach(k => {
          if (directPrice > 0) return;
          const kLower = k.toLowerCase().trim();
          if (kLower.includes('price') || kLower.includes('rate') || kLower.includes('cost') || kLower.includes('amount') || kLower.includes('₹') || kLower.includes('rs')) {
            const num = parseFloat(String(row[k] || 0).replace(/[^0-9.]/g, '')) || 0;
            if (num > 0) directPrice = num;
          }
        });

        basePrice = directPrice;
        newVariants.push({
          id: `var_${itemName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_reg`,
          name: 'Regular',
          servingSize: 1,
          servingUnit: 'PORTION',
          sellingPrice: directPrice,
          availabilityStatus: 'AVAILABLE',
          productionArea: 'BAR',
          recipeId: null
        });
        totalVariantsCount++;
      }

      // Check if this item ALREADY exists in parsedMap (Merge same-name items!)
      if (parsedMap.has(normKey)) {
        const existingItem = parsedMap.get(normKey);
        
        // Merge variants into existingItem.variants
        newVariants.forEach(nv => {
          const existingVar = existingItem.variants.find(v => v.name === nv.name || v.id === nv.id);
          if (existingVar) {
            if (nv.sellingPrice > 0) existingVar.sellingPrice = nv.sellingPrice;
          } else {
            existingItem.variants.push(nv);
          }
        });

        if (existingItem.price === 0 && basePrice > 0) {
          existingItem.price = basePrice;
        }

        // Re-evaluate setup status
        if (existingItem.price > 0 && existingItem.setupStatus.includes('PRICE_REQUIRED')) {
          existingItem.setupStatus = existingItem.productionType === 'RECIPE_BOM' ? '🟡 BOM_REQUIRED' : '🟢 READY';
        }
        return; // Merged into existing item!
      }

      const isExisting = existingMap.has(normKey);
      if (isExisting) {
        existingItemsCount++;
      } else {
        newItemsCount++;
      }

      // Production type classification
      let productionType = 'RECIPE_BOM';
      if (currentCategory.includes('BEER') || currentCategory.includes('BREEZER') || currentCategory.includes('BEVERAGE')) {
        productionType = 'DIRECT_INVENTORY';
      }

      // Determine setup status
      let setupStatus = '🟢 READY';
      if (productionType === 'RECIPE_BOM') {
        setupStatus = '🟡 BOM_REQUIRED';
      }
      if (basePrice === 0) {
        setupStatus = '🟡 PRICE_REQUIRED';
      }

      const newItem = {
        itemCode: `RC-BAR-${idx + 101}`,
        itemName,
        category: currentCategory,
        productionArea: 'BAR',
        productionType,
        price: basePrice,
        variants: newVariants,
        setupStatus: suggestedType === 'RECIPE' ? '🟡 BOM_REQUIRED' : '🟢 READY',
        suggestedConsumptionType: suggestedType,
        userConfirmedType: suggestedType,
        isExisting,
        tenantId
      };

      parsedMap.set(normKey, newItem);
      parsedItems.push(newItem);
    });

    function itemNameRawClean(nameStr) {
      return String(nameStr || '').trim();
    }

    return {
      success: true,
      importBatchId: `MENUIMPORT-${Date.now()}`,
      totalRows: rows.length,
      detectedItemsCount: parsedItems.length,
      detectedVariantsCount: totalVariantsCount,
      newItemsCount,
      existingItemsCount,
      categories: Array.from(categoriesSet),
      items: parsedItems
    };
  }

  /**
   * Execute Import Payload into kitchenMenuModel master
   * @param {Object} previewResult Output of generateImportPreview
   * @param {string|null} tenantId 
   * @returns {{ success: boolean, importedCount: number, batchId: string }}
   */
  static executeImport(previewResult, tenantId = null) {
    if (!previewResult || !Array.isArray(previewResult.items)) {
      return { success: false, importedCount: 0, batchId: null };
    }

    let count = 0;
    previewResult.items.forEach(item => {
      kitchenMenuModel.saveItem({
        ...item,
        tenantId,
        availabilityStatus: 'AVAILABLE',
        lifecycleStatus: 'ACTIVE',
        updatedAt: new Date().toISOString()
      });
      count++;
    });

    // Run deduplication pass to eliminate any existing duplicate records
    kitchenMenuModel.deduplicateMenuItems();

    // Store audit batch history
    const auditRecord = {
      batchId: previewResult.importBatchId,
      timestamp: new Date().toISOString(),
      totalRows: previewResult.totalRows,
      importedCount: count,
      newItemsCount: previewResult.newItemsCount,
      existingItemsCount: previewResult.existingItemsCount,
      performedBy: 'Bar Manager'
    };

    const history = offlineStore.getCollection('bar_menu_import_history') || [];
    history.unshift(auditRecord);
    offlineStore.setCollection('bar_menu_import_history', history);

    return {
      success: true,
      importedCount: count,
      batchId: previewResult.importBatchId
    };
  }
}
