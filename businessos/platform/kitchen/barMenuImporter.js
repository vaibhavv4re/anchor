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

export const ANCHOR_HARBOUR_BAR_MENU_ITEMS = [
  // 1. Cocktails (7)
  { Section: 'Cocktails', Item: 'Seaside Balcony', Price: 545 },
  { Section: 'Cocktails', Item: 'Afternoon Garden', Price: 545 },
  { Section: 'Cocktails', Item: 'Kitchen Pantry', Price: 545 },
  { Section: 'Cocktails', Item: 'Feni Cellar', Price: 545 },
  { Section: 'Cocktails', Item: 'Orchard', Price: 545 },
  { Section: 'Cocktails', Item: 'Courtyard', Price: 545 },
  { Section: 'Cocktails', Item: 'Sunset Terrace', Price: 545 },

  // 2. Mocktails (7)
  { Section: 'Mocktails', Item: 'Tropical Grove', Price: 325 },
  { Section: 'Mocktails', Item: 'Virgin Watermelon & Basil Mojito', Price: 325 },
  { Section: 'Mocktails', Item: 'Shikanji', Price: 325 },
  { Section: 'Mocktails', Item: 'Ginger Me (Frozen)', Price: 325 },
  { Section: 'Mocktails', Item: 'Mango Mastani', Price: 325 },
  { Section: 'Mocktails', Item: 'Guava Mary', Price: 325 },
  { Section: 'Mocktails', Item: 'Fresh Juice', Price: 165 },

  // 3. Breezers (3)
  { Section: 'Breezers', Item: 'Breezer Blackberry', '275 ml': 215 },
  { Section: 'Breezers', Item: 'Breezer Cranberry', '275 ml': 215 },
  { Section: 'Breezers', Item: 'Breezer Jamaican Passion', '275 ml': 215 },

  // 4. Beverages (3)
  { Section: 'Beverages', Item: 'Bottled Water', Price: 40 },
  { Section: 'Beverages', Item: 'Cold Drink', Price: 40 },
  { Section: 'Beverages', Item: 'Soda', Price: 40 },

  // 5. Single Malt (4)
  { Section: 'Single Malt', Item: 'Glenfiddich 12 Yr', '30 ml': 280, '60 ml': 550, '90 ml': 1090, '180 ml': 2160, '375 ml': 4300, '750 ml': 8580 },
  { Section: 'Single Malt', Item: 'Glenmorangie 12 Yr', '30 ml': 280, '60 ml': 550, '90 ml': 1090, '180 ml': 2160, '375 ml': 4300, '750 ml': 8580 },
  { Section: 'Single Malt', Item: 'Singleton Glendullan 12 Yr', '30 ml': 270, '60 ml': 520, '90 ml': 1020, '180 ml': 2020, '375 ml': 4020, '750 ml': 8010 },
  { Section: 'Single Malt', Item: 'Amrut Amalgam', '30 ml': 240, '60 ml': 460, '90 ml': 910, '180 ml': 1800, '375 ml': 3590, '750 ml': 7150 },

  // 6. Blended Scotch & Irish Whisky (21)
  { Section: 'Blended Scotch & Irish Whisky', Item: 'J.W. Blue Label', '30 ml': 1250, '60 ml': 2480, '90 ml': 4950, '180 ml': 9880, '375 ml': 19710, '750 ml': 39325 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'J.W. Gold Label', '30 ml': 380, '60 ml': 750, '90 ml': 1490, '180 ml': 2970, '375 ml': 5920, '750 ml': 11800 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'J.W. Double Black', '30 ml': 230, '60 ml': 440, '90 ml': 870, '180 ml': 1720, '375 ml': 3430, '750 ml': 6830 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'J.W. Black Label', '30 ml': 180, '60 ml': 350, '90 ml': 690, '375 ml': 1370, '750 ml': 2730 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'J.W. Red Label', '30 ml': 120, '60 ml': 220, '90 ml': 420, '375 ml': 830, '750 ml': 1640 },
  { Section: 'Blended Scotch & Irish Whisky', Item: '100 Pipers', '30 ml': 140, '60 ml': 260, '90 ml': 510, '375 ml': 1010, '750 ml': 2010 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Chivas Regal 12 Yr', '30 ml': 180, '60 ml': 350, '90 ml': 690, '180 ml': 1370, '375 ml': 2730, '750 ml': 5435 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Amrut Fusion', '30 ml': 260, '60 ml': 510, '90 ml': 1000, '180 ml': 1980, '375 ml': 3950, '750 ml': 7865 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Macintosh', '30 ml': 90, '60 ml': 170, '90 ml': 320, '375 ml': 620, '750 ml': 1220 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Monkey Shoulder', '30 ml': 210, '60 ml': 410, '90 ml': 800, '180 ml': 1590, '375 ml': 3160, '750 ml': 6295 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Jameson Black Barrel', '30 ml': 200, '60 ml': 390, '90 ml': 770, '180 ml': 1520, '375 ml': 3020, '750 ml': 6010 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Jameson Stout Edition', '30 ml': 170, '60 ml': 330, '90 ml': 640, '180 ml': 1260, '375 ml': 2510, '750 ml': 5005 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Jameson Irish', '30 ml': 160, '60 ml': 300, '90 ml': 590, '375 ml': 1160, '750 ml': 2300 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Seven Islands Malt', '30 ml': 250, '60 ml': 480, '90 ml': 940, '180 ml': 1870, '375 ml': 3730, '750 ml': 7440 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Royal Ranthambore', '30 ml': 140, '60 ml': 260, '90 ml': 510, '180 ml': 1010, '375 ml': 2010, '750 ml': 4005 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Teachers 50', '30 ml': 170, '60 ml': 320, '90 ml': 620, '180 ml': 1220, '375 ml': 2430, '750 ml': 4835 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Teachers Highland', '30 ml': 140, '60 ml': 270, '90 ml': 520, '180 ml': 1030, '375 ml': 2050, '750 ml': 4080 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Black Dog Centenary', '30 ml': 140, '60 ml': 260, '90 ml': 510, '180 ml': 1010, '375 ml': 2010, '750 ml': 4005 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Black Dog Deluxe', '30 ml': 150, '60 ml': 290, '90 ml': 560, '375 ml': 1110, '750 ml': 2200 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Ballantines', '30 ml': 120, '60 ml': 220, '90 ml': 420, '375 ml': 820, '750 ml': 1620 },
  { Section: 'Blended Scotch & Irish Whisky', Item: 'Black & White', '30 ml': 110, '60 ml': 200, '90 ml': 380, '375 ml': 750, '750 ml': 1480 },

  // 7. Bourbon (2)
  { Section: 'Bourbon', Item: 'Jack Daniels', '30 ml': 180, '60 ml': 350, '90 ml': 690, '375 ml': 1370, '750 ml': 2730 },
  { Section: 'Bourbon', Item: 'Jim Beam', '30 ml': 140, '60 ml': 260, '90 ml': 510, '180 ml': 1010, '375 ml': 2010, '750 ml': 4005 },

  // 8. Whisky (16)
  { Section: 'Whisky', Item: 'Woodburns', '30 ml': 160, '60 ml': 300, '90 ml': 590, '375 ml': 1160, '750 ml': 2300 },
  { Section: 'Whisky', Item: 'Vat 69', '30 ml': 140, '60 ml': 260, '90 ml': 500, '375 ml': 980, '750 ml': 1940 },
  { Section: 'Whisky', Item: 'Oaksmith Nagomi', '30 ml': 110, '60 ml': 200, '90 ml': 380, '180 ml': 750, '375 ml': 1490, '750 ml': 2970 },
  { Section: 'Whisky', Item: 'Oaksmith Gold', '30 ml': 90, '60 ml': 160, '90 ml': 300, '375 ml': 580, '750 ml': 1150 },
  { Section: 'Whisky', Item: 'Oaksmith Silver', '30 ml': 80, '60 ml': 140, '90 ml': 260, '375 ml': 500, '750 ml': 990 },
  { Section: 'Whisky', Item: 'Rockford Reserve', '30 ml': 90, '60 ml': 160, '90 ml': 300, '180 ml': 580, '375 ml': 1150, '750 ml': 2290 },
  { Section: 'Whisky', Item: 'Rockford Classic', '30 ml': 80, '60 ml': 150, '90 ml': 280, '375 ml': 550, '750 ml': 1080 },
  { Section: 'Whisky', Item: 'William Lawson\'s', '30 ml': 100, '60 ml': 190, '90 ml': 370, '375 ml': 730, '750 ml': 1440 },
  { Section: 'Whisky', Item: 'Blenders Pride Reserve', '30 ml': 90, '60 ml': 160, '90 ml': 300, '180 ml': 580, '375 ml': 1150, '750 ml': 2290 },
  { Section: 'Whisky', Item: 'Blenders Pride', '30 ml': 80, '60 ml': 150, '90 ml': 280, '375 ml': 550, '750 ml': 1080 },
  { Section: 'Whisky', Item: 'Antiquity Blue', '30 ml': 90, '60 ml': 170, '90 ml': 320, '375 ml': 630, '750 ml': 1250 },
  { Section: 'Whisky', Item: 'Signature Premier', '30 ml': 90, '60 ml': 160, '90 ml': 300, '180 ml': 580, '375 ml': 1150, '750 ml': 2290 },
  { Section: 'Whisky', Item: 'Signature Rare', '30 ml': 80, '60 ml': 150, '90 ml': 280, '375 ml': 550, '750 ml': 1080 },
  { Section: 'Whisky', Item: 'Royal Challenge', '30 ml': 60, '60 ml': 110, '90 ml': 200, '375 ml': 390, '750 ml': 770 },
  { Section: 'Whisky', Item: 'Royal Stag', '30 ml': 60, '60 ml': 110, '90 ml': 200, '375 ml': 390, '750 ml': 770 },
  { Section: 'Whisky', Item: 'Imperial Blue', '30 ml': 50, '60 ml': 90, '90 ml': 170, '375 ml': 330, '750 ml': 640 },

  // 9. Rum (3)
  { Section: 'Rum', Item: 'Bacardi Lemon', '30 ml': 90, '60 ml': 170, '90 ml': 330, '375 ml': 640, '750 ml': 1260 },
  { Section: 'Rum', Item: 'Bacardi White', '30 ml': 90, '60 ml': 170, '90 ml': 320, '375 ml': 620, '750 ml': 1220 },
  { Section: 'Rum', Item: 'Old Monk', '30 ml': 50, '60 ml': 90, '90 ml': 170, '375 ml': 330, '750 ml': 640 },

  // 10. Gin (4)
  { Section: 'Gin', Item: 'Jaisalmer', '30 ml': 180, '60 ml': 350, '90 ml': 690, '375 ml': 1370, '750 ml': 2730 },
  { Section: 'Gin', Item: 'Hapusa', '30 ml': 180, '60 ml': 350, '90 ml': 690, '375 ml': 1370, '750 ml': 2730 },
  { Section: 'Gin', Item: 'Bombay Sapphire', '30 ml': 150, '60 ml': 290, '90 ml': 570, '180 ml': 1120, '375 ml': 2230, '750 ml': 4435 },
  { Section: 'Gin', Item: 'Greater Than London Dry', '30 ml': 100, '60 ml': 190, '90 ml': 360, '180 ml': 710, '375 ml': 1400, '750 ml': 2790 },

  // 11. Tequila (2)
  { Section: 'Tequila', Item: 'Camino Real Gold', '30 ml': 160, '60 ml': 310, '90 ml': 600, '180 ml': 1190, '375 ml': 2370, '750 ml': 4720 },
  { Section: 'Tequila', Item: 'Camino Real Silver', '30 ml': 160, '60 ml': 310, '90 ml': 600, '180 ml': 1190, '375 ml': 2370, '750 ml': 4720 },

  // 12. Vodka (8)
  { Section: 'Vodka', Item: 'Grey Goose', '30 ml': 250, '60 ml': 490, '90 ml': 960, '375 ml': 1910, '750 ml': 3800 },
  { Section: 'Vodka', Item: 'Absolut', '30 ml': 120, '60 ml': 230, '90 ml': 440, '375 ml': 870, '750 ml': 1730 },
  { Section: 'Vodka', Item: 'Smirnoff Minty Jamun', '30 ml': 90, '60 ml': 170, '90 ml': 330, '180 ml': 640, '375 ml': 1260, '750 ml': 2505 },
  { Section: 'Vodka', Item: 'Smirnoff Green Apple', '30 ml': 90, '60 ml': 170, '90 ml': 330, '180 ml': 640, '375 ml': 1260, '750 ml': 2505 },
  { Section: 'Vodka', Item: 'Smirnoff No. 21 Red', '30 ml': 90, '60 ml': 170, '90 ml': 320, '180 ml': 620, '375 ml': 1220, '750 ml': 2435 },
  { Section: 'Vodka', Item: 'Magic Moments Vodka', '30 ml': 60, '60 ml': 110, '90 ml': 210, '180 ml': 410, '375 ml': 810, '750 ml': 1610 },
  { Section: 'Vodka', Item: 'Magic Moments Jamun', '30 ml': 60, '60 ml': 110, '90 ml': 210, '180 ml': 410, '375 ml': 810, '750 ml': 1610 },
  { Section: 'Vodka', Item: 'Magic Moments Apple', '30 ml': 60, '60 ml': 110, '90 ml': 210, '180 ml': 410, '375 ml': 810, '750 ml': 1610 },

  // 13. Liqueur (2)
  { Section: 'Liqueur', Item: 'Jagermeister', '30 ml': 200, '60 ml': 390, '90 ml': 770, '375 ml': 1520, '750 ml': 3020 },
  { Section: 'Liqueur', Item: 'Absinthe', '30 ml': 190, '60 ml': 370, '90 ml': 730, '375 ml': 1440, '750 ml': 2870 },

  // 14. Mahua Spirit (1)
  { Section: 'Mahua Spirit', Item: 'Six Brothers', '30 ml': 130, '60 ml': 240, '90 ml': 460, '375 ml': 900, '750 ml': 1790 },

  // 15. Feni (1)
  { Section: 'Feni', Item: 'Tinto Feni', '30 ml': 130, '60 ml': 250, '90 ml': 490, '375 ml': 960, '750 ml': 1900 },

  // 16. Local Spirits (3)
  { Section: 'Local Spirits', Item: 'Orange City Vodka Jamun Mint', '30 ml': 40, '60 ml': 70, '90 ml': 130, '180 ml': 240, '375 ml': 470, '750 ml': 920 },
  { Section: 'Local Spirits', Item: 'Orange City Vodka', '30 ml': 40, '60 ml': 70, '90 ml': 120, '180 ml': 230, '375 ml': 440, '750 ml': 860 },
  { Section: 'Local Spirits', Item: 'Orange City Whisky', '30 ml': 40, '60 ml': 70, '90 ml': 120, '180 ml': 230, '375 ml': 440, '750 ml': 860 },

  // 17. Premium Beer (11)
  { Section: 'Premium Beer', Item: 'Budweiser Mild', '500 ml': 275, '650 ml': 355 },
  { Section: 'Premium Beer', Item: 'Carlsberg Smooth', '500 ml': 275, '650 ml': 355 },
  { Section: 'Premium Beer', Item: 'Corona', '330 ml': 290, '650 ml': 360 },
  { Section: 'Premium Beer', Item: 'Heineken', '500 ml': 290 },
  { Section: 'Premium Beer', Item: 'Hoegaarden Peach', '500 ml': 360 },
  { Section: 'Premium Beer', Item: 'Hoegaarden Raspberry', '500 ml': 360 },
  { Section: 'Premium Beer', Item: 'Hoegaarden', '500 ml': 360 },
  { Section: 'Premium Beer', Item: 'Kingfisher Mild', '500 ml': 210, '650 ml': 290 },
  { Section: 'Premium Beer', Item: 'Kingfisher Ultra', '500 ml': 275, '650 ml': 350 },
  { Section: 'Premium Beer', Item: 'LP Mild', '500 ml': 180, '650 ml': 215 },
  { Section: 'Premium Beer', Item: 'Tuborg Mild', '500 ml': 275, '650 ml': 290 },

  // 17. Strong Beer (6)
  { Section: 'Strong Beer', Item: 'Budweiser Magnum', '500 ml': 290, '650 ml': 355 },
  { Section: 'Strong Beer', Item: 'Carlsberg Elephant', '500 ml': 290, '650 ml': 375 },
  { Section: 'Strong Beer', Item: 'Kingfisher Strong', '500 ml': 235, '650 ml': 290 },
  { Section: 'Strong Beer', Item: 'Kingfisher Ultra Max', '500 ml': 290, '650 ml': 375 },
  { Section: 'Strong Beer', Item: 'LP Strong', '500 ml': 205, '650 ml': 260 },
  { Section: 'Strong Beer', Item: 'Tuborg Strong', '500 ml': 235, '650 ml': 300 },

  // 17. Craft Beer (3)
  { Section: 'Craft Beer', Item: 'Hefeweizen', Price: 360 },
  { Section: 'Craft Beer', Item: 'Lager', Price: 360 },
  { Section: 'Craft Beer', Item: 'Belgian Wit', Price: 360 }
];

// Backward-compatible alias
export const ANCHOR_HARBOUR_64_MENU_ITEMS = ANCHOR_HARBOUR_BAR_MENU_ITEMS;

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
  static detectServingColumns(sampleRowOrRows) {
    const keySet = new Set();
    if (Array.isArray(sampleRowOrRows)) {
      sampleRowOrRows.forEach(r => Object.keys(r || {}).forEach(k => keySet.add(k)));
    } else {
      Object.keys(sampleRowOrRows || {}).forEach(k => keySet.add(k));
    }
    const keys = Array.from(keySet);
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

    const servingCols = this.detectServingColumns(rows);

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
  static executeImport(previewResult, tenantId = null, options = { cleanSweep: true }) {
    if (!previewResult || !Array.isArray(previewResult.items)) {
      return { success: false, importedCount: 0, archivedCount: 0, batchId: null };
    }

    let archivedCount = 0;
    if (options.cleanSweep !== false) {
      const newNames = new Set(previewResult.items.map(i => String(i.itemName || '').toLowerCase().trim()));
      const existingBar = kitchenMenuModel.getAll(tenantId, { domain: 'BAR', showArchived: false });
      existingBar.forEach(oldItem => {
        const oldName = String(oldItem.itemName || '').toLowerCase().trim();
        if (!newNames.has(oldName)) {
          kitchenMenuModel.archiveItem(oldItem.id);
          archivedCount++;
        }
      });
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
      archivedCount,
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
      archivedCount,
      batchId: previewResult.importBatchId
    };
  }
}
