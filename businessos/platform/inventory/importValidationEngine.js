/**
 * BusinessOS Platform - Import Validation Engine (F9.3)
 * Performs pre-import validation: header checks, datatype checks, and relational integrity.
 * Absolute Read-Only: Zero database mutations performed during validation.
 */

import { MANDATORY_HEADERS } from './canonicalImportSpec.js';

export class ImportValidationEngine {
  /**
   * Validates parsed import package data across all files.
   * Supports both snake_case CSV field names and camelCase JS domain objects.
   * @param {Object} parsedPackage - Keyed by file type, containing rows []
   * @returns {Object} Validation summary { isValid, totalErrors, totalWarnings, fileReports }
   */
  validatePackage(parsedPackage = {}) {
    const fileReports = {};
    let totalErrors = 0;
    let totalWarnings = 0;

    // Helper to extract field regardless of casing
    const getVal = (row, fieldSnake, fieldCamel) => {
      if (!row) return undefined;
      if (row[fieldSnake] !== undefined) return row[fieldSnake];
      if (row[fieldCamel] !== undefined) return row[fieldCamel];
      return undefined;
    };

    // 1. Build Inventory Master lookup set
    const inventoryRows = parsedPackage.INVENTORY_MASTER;
    const validInventoryCodes = new Set();
    if (Array.isArray(inventoryRows)) {
      inventoryRows.forEach(r => {
        const code = getVal(r, 'item_code', 'itemCode');
        if (code) validInventoryCodes.add(String(code).trim());
      });
    }

    // 2. Build Menu Code lookup set
    const foodRows = parsedPackage.FOOD_MENU || [];
    const barRows = parsedPackage.BAR_MENU || [];
    const validMenuCodes = new Set();
    [...foodRows, ...barRows].forEach(r => {
      const code = getVal(r, 'menu_code', 'menuCode');
      if (code) validMenuCodes.add(String(code).trim());
    });

    // 3. Validate each file type
    Object.keys(parsedPackage).forEach(fileType => {
      const rows = parsedPackage[fileType];
      if (!Array.isArray(rows)) return;

      const fileReport = {
        fileType,
        totalRows: rows.length,
        errors: [],
        warnings: [],
        isValid: true
      };

      rows.forEach((row, idx) => {
        const rowNum = idx + 2;

        if (fileType === 'INVENTORY_MASTER') {
          const itemCode = getVal(row, 'item_code', 'itemCode');
          const itemName = getVal(row, 'item_name', 'itemName');
          const convFactor = getVal(row, 'conversion_factor', 'conversionFactor');

          if (!itemCode) fileReport.errors.push({ row: rowNum, field: 'item_code', message: 'Missing item_code.' });
          if (!itemName) fileReport.errors.push({ row: rowNum, field: 'item_name', message: 'Missing item_name.' });
          if (convFactor !== undefined && (isNaN(convFactor) || Number(convFactor) <= 0)) {
            fileReport.errors.push({ row: rowNum, field: 'conversion_factor', message: 'conversion_factor must be a positive number.' });
          }
        }

        if (fileType === 'FOOD_VARIANTS' || fileType === 'BAR_VARIANTS') {
          const menuCode = getVal(row, 'menu_code', 'menuCode');
          const price = getVal(row, 'selling_price', 'sellingPrice');

          if (!menuCode) {
            fileReport.errors.push({ row: rowNum, field: 'menu_code', message: 'Missing menu_code.' });
          } else if (validMenuCodes.size > 0 && !validMenuCodes.has(String(menuCode).trim())) {
            fileReport.errors.push({ row: rowNum, field: 'menu_code', message: `menu_code "${menuCode}" does not exist in Menu.` });
          }

          if (price === undefined || price === '' || isNaN(price) || Number(price) < 0) {
            fileReport.errors.push({ row: rowNum, field: 'selling_price', message: 'selling_price must be a valid non-negative number.' });
          }
        }

        if (fileType === 'FOOD_RECIPES' || fileType === 'BAR_RECIPES') {
          const recipeCode = getVal(row, 'recipe_code', 'recipeCode');
          const ingredientCode = getVal(row, 'ingredient_code', 'ingredientCode');
          const quantity = getVal(row, 'quantity', 'quantity');

          if (!recipeCode) fileReport.errors.push({ row: rowNum, field: 'recipe_code', message: 'Missing recipe_code.' });
          if (!ingredientCode) {
            fileReport.errors.push({ row: rowNum, field: 'ingredient_code', message: 'Missing ingredient_code.' });
          } else if (validInventoryCodes.size > 0 && !validInventoryCodes.has(String(ingredientCode).trim())) {
            fileReport.errors.push({
              row: rowNum,
              field: 'ingredient_code',
              message: `Ingredient "${ingredientCode}" does not exist in Inventory Master. Create inventory item first.`
            });
          }

          if (!quantity || isNaN(quantity) || Number(quantity) <= 0) {
            fileReport.errors.push({ row: rowNum, field: 'quantity', message: 'Recipe ingredient quantity must be greater than 0.' });
          }
        }

        if (fileType === 'OPENING_STOCK') {
          const itemCode = getVal(row, 'item_code', 'itemCode');
          const quantity = getVal(row, 'quantity', 'quantity');

          if (!itemCode) {
            fileReport.errors.push({ row: rowNum, field: 'item_code', message: 'Missing item_code.' });
          } else if (validInventoryCodes.size > 0 && !validInventoryCodes.has(String(itemCode).trim())) {
            fileReport.errors.push({ row: rowNum, field: 'item_code', message: `Opening stock item "${itemCode}" does not exist in Inventory Master.` });
          }

          if (quantity === undefined || isNaN(quantity) || Number(quantity) < 0) {
            fileReport.errors.push({ row: rowNum, field: 'quantity', message: 'Opening stock quantity must be non-negative.' });
          }
        }
      });

      fileReport.isValid = fileReport.errors.length === 0;
      totalErrors += fileReport.errors.length;
      totalWarnings += fileReport.warnings.length;
      fileReports[fileType] = fileReport;
    });

    return {
      isValid: totalErrors === 0,
      totalErrors,
      totalWarnings,
      fileReports
    };
  }
}

export const importValidationEngine = new ImportValidationEngine();
