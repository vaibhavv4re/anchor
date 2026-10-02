/**
 * BusinessOS Platform - Menu Master Model
 * Bridges the live restaurant menu (kitchen_menu_items / ACTUAL_ANCHOR_MENU)
 * with the POS Touch Menu Browser, Order Builder, and Waiter workflow.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { ACTUAL_ANCHOR_MENU } from '../../../restaurantos/frontend/capabilities/kitchen/data/actualMenuData.js';

/**
 * Category icons keyed by the ACTUAL category strings used in the menu data
 * (e.g. "FROM THE SHORE - CHICKEN"), not the legacy "STARTERS - ..." names.
 */
const CATEGORY_ICONS = {
  'SOUPS': '🥣',
  'GARDEN & GRAIN': '🥗',
  'STARTERS - GARDEN & GRAIN': '🥗',
  'FROM THE SEA - PRAWNS': '🍤',
  'STARTERS - HARBOUR & COAST': '🍤',
  'FROM THE SHORE - CHICKEN': '🍗',
  'FROM THE SHORE - MUTTON': '🍖',
  'CURRIES & DAALS': '🍛',
  'MEAT CURRIES - CHICKEN': '🍛',
  'MEAT CURRIES - MUTTON': '🍛',
  'MAINS - COASTAL CURRIES': '🥘',
  'MAIN COURSE': '🍛',
  'STARTERS': '🍢',
  'RICE': '🍚',
  'BREADS & RICE': '🍚',
  'COASTAL BREADS': '🍞',
  'DESSERTS': '🍨',
  'BEVERAGES & BAR': '🍹',
  'BEVERAGES': '🥤',
  'BEVERAGE': '🥤',
  'BAR': '🍺',
  'ALCOHOL': '🍺'
};

/**
 * Unambiguous short chip labels. The menu has two sections that share a protein
 * (starters "FROM THE SHORE - CHICKEN" vs curries "MEAT CURRIES - CHICKEN"), so
 * we keep the section word to avoid two identical "Chicken" chips.
 */
const CONCISE_LABELS = {
  'SOUPS': 'Soups',
  'GARDEN & GRAIN': 'Veg Starters',
  'STARTERS - GARDEN & GRAIN': 'Veg Starters',
  'FROM THE SEA - PRAWNS': 'Prawns',
  'STARTERS - HARBOUR & COAST': 'Seafood Starters',
  'FROM THE SHORE - CHICKEN': 'Chicken Starters',
  'FROM THE SHORE - MUTTON': 'Mutton Starters',
  'CURRIES & DAALS': 'Curries & Daals',
  'MEAT CURRIES - CHICKEN': 'Chicken Curries',
  'MEAT CURRIES - MUTTON': 'Mutton Curries',
  'MAINS - COASTAL CURRIES': 'Coastal Mains',
  'MAIN COURSE': 'Mains',
  'STARTERS': 'Starters',
  'RICE': 'Rice',
  'BREADS & RICE': 'Breads & Rice',
  'COASTAL BREADS': 'Breads',
  'DESSERTS': 'Desserts',
  'BEVERAGES & BAR': 'Beverages',
  'BEVERAGES': 'Beverages',
  'BEVERAGE': 'Beverages',
  'BAR': 'Bar',
  'ALCOHOL': 'Bar'
};

class MenuMasterModel {
  _getTenantId() {
    if (typeof sessionStorage !== 'undefined') {
      try {
        const session = JSON.parse(sessionStorage.getItem('ros_session') || '{}');
        return session.tenantId || null;
      } catch (_) {}
    }
    return null;
  }

  /**
   * Get all live menu items from offlineStore (synced with Supabase),
   * falling back to the 70 authentic Anchor Coastal dishes if offlineStore is empty.
   */
  getAllMenuItems() {
    const tenantId = this._getTenantId();
    let rawList = offlineStore.getCollection('kitchen_menu_items', tenantId) || [];
    if (!rawList.length) {
      rawList = offlineStore.getCollection('kitchen_menu_items') || [];
    }
    if (!rawList.length) {
      rawList = ACTUAL_ANCHOR_MENU;
    }

    return rawList.map(item => {
      const isItemAvailable = (item.availabilityStatus || 'AVAILABLE') === 'AVAILABLE' && (item.lifecycleStatus || 'ACTIVE') !== 'ARCHIVED';
      const rawVariants = Array.isArray(item.variants) ? item.variants : [];
      
      const variants = rawVariants.map(v => ({
        variantId: v.variantId || v.id || `var-${item.id}-${v.variantName}`,
        variantCode: v.variantCode || v.sku || v.variantId,
        variantName: v.variantName || v.name || 'Standard',
        price: parseFloat(v.price || v.sellingPrice || item.sellingPrice || item.price) || 0,
        sku: v.sku || v.variantCode || '',
        portionSize: v.portionSize || '',
        bomMode: v.bomMode || 'INDEPENDENT',
        scalingFactor: parseFloat(v.scalingFactor) || 1.0,
        bomId: v.bomId || v.recipeId || null,
        is86: v.is86 || v.is_86 || !isItemAvailable,
        isAvailable: isItemAvailable && !(v.is86 || v.is_86),
        packagingBom: Array.isArray(v.packagingBom) ? v.packagingBom : []
      }));

      return {
        id: item.id || item.itemCode || `item-${(item.itemName || item.name || '').toLowerCase().replace(/\s+/g, '-')}`,
        itemId: item.id || item.itemCode,
        itemCode: item.itemCode || item.id,
        name: item.itemName || item.name || 'Untitled Dish',
        itemName: item.itemName || item.name || 'Untitled Dish',
        category: item.category || 'GENERAL',
        categoryId: item.category || 'GENERAL',
        price: parseFloat(item.sellingPrice || item.price) || 0,
        sellingPrice: parseFloat(item.sellingPrice || item.price) || 0,
        dietary: item.dietaryType || item.dietary || 'VEG',
        dietaryType: item.dietaryType || item.dietary || 'VEG',
        portionSize: item.portionSize || '',
        description: item.description || '',
        region: item.region || '',
        spicinessLevel: item.spicinessLevel || 'MEDIUM',
        routing: item.routing || (item.category === 'BEVERAGES & BAR' || item.category === 'BAR' ? 'BAR_LINE' : 'KITCHEN_LINE'),
        menuDomain: this._classifyDomain(item),
        recipeId: item.recipeId || item.recipe_id || (item.data ? (item.data.recipeId || item.data.recipe_id) : null) || null,
        recipe_id: item.recipeId || item.recipe_id || (item.data ? (item.data.recipeId || item.data.recipe_id) : null) || null,
        isAvailable: isItemAvailable,
        hasVariants: variants.length > 0 || !!item.hasVariants,
        variants,
        modifiers: Array.isArray(item.modifiers) ? item.modifiers : (item.spicinessLevel ? [`Spicy: ${item.spicinessLevel}`] : ['Standard'])
      };
    });
  }

  getAllItems() {
    return this.getAllMenuItems();
  }

  /**
   * List the menu categories (with live per-category dish counts) for the POS
   * filter bar. When `domain` is 'FOOD' or 'BAR', only categories that contain
   * items in that domain are returned - so a waiter taking a FOOD order never
   * sees bar categories, and vice-versa. Domain defaults to null (all).
   * @param {string|null} domain 'FOOD' | 'BAR' | null
   */
  getAllCategories(domain = null) {
    const items = this.getAllMenuItems().filter(i => i.isAvailable);
    const scoped = domain ? items.filter(i => (i.menuDomain || 'FOOD') === domain) : items;

    const order = [];
    const tally = {};
    scoped.forEach(item => {
      const cat = item.category || 'GENERAL';
      if (!(cat in tally)) { tally[cat] = 0; order.push(cat); }
      tally[cat] += 1;
    });

    return order.map(cat => {
      const icon = CATEGORY_ICONS[cat] || '🍽️';
      const formattedName = cat.split(' - ').map(s => s.charAt(0) + s.slice(1).toLowerCase()).join(' • ');
      return {
        id: cat,
        name: `${icon} ${formattedName}`,
        shortName: `${icon} ${this._conciseCategoryLabel(cat)}`,
        rawCategory: cat,
        count: tally[cat]
      };
    });
  }

  /**
   * Classify a raw menu item into a POS navigation domain ('FOOD' | 'BAR').
   * Bar items are those routed to the bar line, carrying a bar/beverage/drink
   * category, or using a bar item-code prefix. This is display/navigation
   * grouping only - it never changes the stored category or kitchen routing.
   * @param {Object} raw
   * @returns {'FOOD'|'BAR'}
   */
  _classifyDomain(raw = {}) {
    const cat = String(raw.category || raw.categoryId || '').toUpperCase();
    const code = String(raw.itemCode || raw.id || '').toUpperCase();
    const routing = String(raw.routing || '').toUpperCase();
    if (routing === 'BAR_LINE') return 'BAR';
    if (/(^|[^A-Z])(BAR|LIQUOR|ALCOHOL|BEVERAGE|BEVERAGES|COCKTAIL|COCKTAILS|MOCKTAIL|MOCKTAILS|SHAKE|SHAKES|JUICE|JUICES|DRINKS)([^A-Z]|$)/.test(cat)) return 'BAR';
    if (/^(RC-BAR|BAR[-_]|BEV[-_]|BEVERAGE)/.test(code)) return 'BAR';
    return 'FOOD';
  }

  /**
   * Short, UNAMBIGUOUS, tablet-friendly chip label. Two real sections share a
   * protein (starters "FROM THE SHORE - CHICKEN" vs curries "MEAT CURRIES -
   * CHICKEN"), so we never collapse to just the protein - that produced
   * duplicate "Chicken" chips with different counts. Unknown categories keep
   * BOTH segments so labels stay distinct.
   * @param {string} cat
   * @returns {string}
   */
  _conciseCategoryLabel(cat) {
    if (CONCISE_LABELS[cat]) return CONCISE_LABELS[cat];
    return String(cat)
      .split(' - ')
      .map(s => s.split(/\s+/).filter(Boolean).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '))
      .join(' · ');
  }

  getItemsByCategory(categoryId, domain = null) {
    let items = this.getAllMenuItems().filter(i => i.isAvailable);
    if (domain) items = items.filter(i => (i.menuDomain || 'FOOD') === domain);
    if (!categoryId || categoryId === 'ALL') {
      return items;
    }
    return items.filter(i => i.category === categoryId || i.categoryId === categoryId);
  }

  getItem(itemId) {
    if (!itemId) return null;
    const items = this.getAllMenuItems();
    const str = String(itemId).trim().toLowerCase();
    return items.find(i => 
      (i.id && String(i.id).toLowerCase() === str) || 
      (i.itemId && String(i.itemId).toLowerCase() === str) || 
      (i.itemCode && String(i.itemCode).toLowerCase() === str) ||
      (i.name && i.name.toLowerCase() === str)
    ) || null;
  }

  getItemById(itemId) {
    return this.getItem(itemId);
  }

  getMenuItemById(itemId) {
    return this.getItem(itemId);
  }

  searchItems(query, domain = null) {
    let items = this.getAllMenuItems().filter(i => i.isAvailable);
    if (domain) items = items.filter(i => (i.menuDomain || 'FOOD') === domain);
    if (!query || !query.trim()) return items;
    const q = query.toLowerCase().trim();
    return items.filter(i =>
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.itemCode && i.itemCode.toLowerCase().includes(q)) ||
      (i.category && i.category.toLowerCase().includes(q)) ||
      (i.description && i.description.toLowerCase().includes(q)) ||
      (i.region && i.region.toLowerCase().includes(q))
    );
  }
}

export const menuMasterModel = new MenuMasterModel();
