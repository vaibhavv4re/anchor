/**
 * BusinessOS Platform - Canonical Import/Export Specification (F9.1)
 * Defines the canonical package layout, manifest contract (schemaVersion: "1.0"),
 * mandatory CSV headers, and Supabase database column mappings.
 */

export const SCHEMA_VERSION = '1.0';

export const CANONICAL_FILES = {
  MANIFEST: 'manifest.json',
  INVENTORY_MASTER: '01_inventory/inventory_master.csv',
  SUPPLIERS: '02_suppliers/suppliers.csv',
  FOOD_MENU: '03_food/food_menu.csv',
  FOOD_VARIANTS: '03_food/food_variants.csv',
  FOOD_RECIPES: '03_food/food_recipes.csv',
  BAR_MENU: '04_bar/bar_menu.csv',
  BAR_VARIANTS: '04_bar/bar_variants.csv',
  BAR_RECIPES: '04_bar/bar_recipes.csv',
  OPENING_STOCK: '05_opening_stock/opening_stock.csv'
};

export const MANDATORY_HEADERS = {
  INVENTORY_MASTER: [
    'item_code', 'item_name', 'item_type', 'category_code', 'base_uom',
    'purchase_uom', 'conversion_factor', 'default_location_code', 'last_purchase_price'
  ],
  SUPPLIERS: [
    'supplier_code', 'supplier_name', 'phone'
  ],
  FOOD_MENU: [
    'menu_code', 'category_name', 'item_name'
  ],
  FOOD_VARIANTS: [
    'menu_code', 'variant_code', 'variant_name', 'selling_price', 'recipe_code'
  ],
  FOOD_RECIPES: [
    'recipe_code', 'recipe_name', 'ingredient_code', 'quantity', 'unit'
  ],
  BAR_MENU: [
    'menu_code', 'category_name', 'item_name'
  ],
  BAR_VARIANTS: [
    'menu_code', 'variant_code', 'variant_name', 'selling_price', 'recipe_code'
  ],
  BAR_RECIPES: [
    'recipe_code', 'recipe_name', 'ingredient_code', 'quantity', 'unit'
  ],
  OPENING_STOCK: [
    'item_code', 'location_code', 'quantity', 'unit', 'unit_cost'
  ]
};

export class CanonicalImportSpec {
  /**
   * Validates manifest.json structure and schemaVersion.
   * @param {Object} manifest 
   * @returns {Object} { isValid, errors: [] }
   */
  validateManifest(manifest) {
    const errors = [];
    if (!manifest) {
      errors.push('manifest.json is missing from import package.');
      return { isValid: false, errors };
    }

    if (!manifest.schemaVersion) {
      errors.push('manifest.json is missing required field "schemaVersion".');
    } else if (manifest.schemaVersion !== SCHEMA_VERSION) {
      errors.push(`Unsupported schemaVersion "${manifest.schemaVersion}". Required schemaVersion is "${SCHEMA_VERSION}".`);
    }

    if (!manifest.restaurant) {
      errors.push('manifest.json is missing required field "restaurant".');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export const canonicalImportSpec = new CanonicalImportSpec();
