/**
 * BusinessOS Platform - Menu Master Model
 * Bridges the live restaurant menu (kitchen_menu_items / ACTUAL_ANCHOR_MENU)
 * with the POS Touch Menu Browser, Order Builder, and Waiter workflow.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { ACTUAL_ANCHOR_MENU } from '../../../restaurantos/frontend/capabilities/kitchen/data/actualMenuData.js';

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

  getAllCategories() {
    const items = this.getAllMenuItems();
    const categoriesSet = new Set();
    const categories = [];

    // Category display order & icons mapping
    const categoryIcons = {
      'SOUPS': '🥣',
      'STARTERS - GARDEN & GRAIN': '🥗',
      'STARTERS - HARBOUR & COAST': '🍤',
      'STARTERS': '🍢',
      'MAINS - COASTAL CURRIES': '🥘',
      'MAIN COURSE': '🍛',
      'BREADS & RICE': '🍚',
      'DESSERTS': '🍨',
      'BEVERAGES & BAR': '🍹',
      'BAR': '🍺'
    };

    items.forEach(item => {
      const cat = item.category || 'GENERAL';
      if (!categoriesSet.has(cat)) {
        categoriesSet.add(cat);
        const icon = categoryIcons[cat] || '🍽️';
        const formattedName = cat.split(' - ').map(s => s.charAt(0) + s.slice(1).toLowerCase()).join(' • ');
        categories.push({
          id: cat,
          name: `${icon} ${formattedName}`,
          rawCategory: cat
        });
      }
    });

    return categories;
  }

  getItemsByCategory(categoryId) {
    const items = this.getAllMenuItems();
    if (!categoryId || categoryId === 'ALL') {
      return items.filter(i => i.isAvailable);
    }
    return items.filter(i => (i.category === categoryId || i.categoryId === categoryId) && i.isAvailable);
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

  searchItems(query) {
    const items = this.getAllMenuItems().filter(i => i.isAvailable);
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
