/**
 * Frozen canonical Product Families Registry.
 * Source: existing bundle.js PD-035 specification.
 *
 * Pure configuration — no storage, UI, Supabase, or runtime dependencies.
 */
export const PRODUCT_FAMILIES_REGISTRY = {
  'FAM-MEAT': { code: 'FAM-MEAT', name: 'Meat & Poultry', icon: '🥩', description: 'Chicken, mutton, processed meats' },
  'FAM-SEAFOOD': { code: 'FAM-SEAFOOD', name: 'Seafood', icon: '🐟', description: 'Fish, prawns, shellfish, seafood products' },
  'FAM-PRODUCE': { code: 'FAM-PRODUCE', name: 'Fruits & Vegetables', icon: '🥬', description: 'Fresh vegetables, fruits, herbs, greens' },
  'FAM-DAIRY': { code: 'FAM-DAIRY', name: 'Dairy & Fats', icon: '🥛', description: 'Milk, cream, butter, cheese, ghee, cooking fats' },
  'FAM-SPICES': { code: 'FAM-SPICES', name: 'Spices & Seasonings', icon: '🌶️', description: 'Whole spices, powdered spices, seasonings' },
  'FAM-CONDIMENTS': { code: 'FAM-CONDIMENTS', name: 'Oils, Sauces & Condiments', icon: '🫙', description: 'Cooking oils, vinegar, sauces, pastes, condiments' },
  'FAM-GRAINS': { code: 'FAM-GRAINS', name: 'Grains, Pulses & Dry Goods', icon: '🍛', description: 'Rice, flour, pulses, cereals, dry staples' },
  'FAM-PACKAGED': { code: 'FAM-PACKAGED', name: 'Canned & Packaged Foods', icon: '🥫', description: 'Canned ingredients, packaged food products' },
  'FAM-BEVERAGES': { code: 'FAM-BEVERAGES', name: 'Beverages', icon: '🍹', description: 'Bar & non-alcoholic beverage ingredients/products' },
  'FAM-PREPS': { code: 'FAM-PREPS', name: 'Semi-Finished Preparations', icon: '🧂', description: 'Masalas, gravy bases, dips, stocks, sauces' },
  'FAM-PACKAGING': { code: 'FAM-PACKAGING', name: 'Packaging', icon: '📦', description: 'Takeaway containers, boxes, bags, foil, cups' },
  'FAM-CONSUMABLES': { code: 'FAM-CONSUMABLES', name: 'Consumables', icon: '🧻', description: 'Tissues, napkins, POS rolls, operating disposables' },
  'FAM-HOUSEKEEPING': { code: 'FAM-HOUSEKEEPING', name: 'Cleaning & Housekeeping', icon: '🧹', description: 'Detergents, sanitizers, cleaning chemicals' },
  'FAM-ASSETS': { code: 'FAM-ASSETS', name: 'Operating Assets', icon: '🪑', description: 'Glasses, mugs, equipment, utensils' },
  'FAM-SERVICES': { code: 'FAM-SERVICES', name: 'Services', icon: '🧾', description: 'Delivery charges, service fees, non-stock items' }
};
