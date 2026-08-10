/**
 * BusinessOS Platform - Menu Master Model
 * Manages menu categories, items, pricing, dietary indicators (VEG, NON_VEG), and variant modifiers.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

class MenuMasterModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('menu_categories')) {
      const defaultCategories = [
        { id: 'cat-starters', name: 'Appetizers & Starters', displayOrder: 1 },
        { id: 'cat-mains', name: 'Main Course', displayOrder: 2 },
        { id: 'cat-beverages', name: 'Beverages & Bar', displayOrder: 3 },
        { id: 'cat-desserts', name: 'Desserts & Sweets', displayOrder: 4 }
      ];
      offlineStore.setCollection('menu_categories', defaultCategories);
    }

    if (!offlineStore.getCollection('menu_items')) {
      const defaultItems = [
        // Starters
        { id: 'item-paneer-tikka', categoryId: 'cat-starters', name: 'Paneer Tikka', price: 280, dietary: 'VEG', isAvailable: true, modifiers: ['Spicy: Mild', 'Spicy: Medium', 'Spicy: High'] },
        { id: 'item-chicken-tikka', categoryId: 'cat-starters', name: 'Chicken Tikka', price: 340, dietary: 'NON_VEG', isAvailable: true, modifiers: ['Spicy: Mild', 'Spicy: Medium', 'Spicy: High'] },
        
        // Mains
        { id: 'item-butter-chicken', categoryId: 'cat-mains', name: 'Butter Chicken', price: 420, dietary: 'NON_VEG', isAvailable: true, modifiers: ['Spicy: Medium', 'Spicy: Low', 'Extra Gravy'] },
        { id: 'item-dal-makhani', categoryId: 'cat-mains', name: 'Dal Makhani', price: 310, dietary: 'VEG', isAvailable: true, modifiers: ['Extra Butter', 'No Butter'] },
        { id: 'item-garlic-naan', categoryId: 'cat-mains', name: 'Garlic Naan', price: 70, dietary: 'VEG', isAvailable: true, modifiers: ['Butter', 'Plain'] },

        // Beverages & Bar
        { id: 'item-fresh-lime', categoryId: 'cat-beverages', name: 'Fresh Lime Soda', price: 120, dietary: 'VEG', isAvailable: true, modifiers: ['Sweet', 'Salt', 'Mix'] },
        { id: 'item-mojito', categoryId: 'cat-beverages', name: 'Classic Virgin Mojito', price: 180, dietary: 'VEG', isAvailable: true, modifiers: ['Extra Mint', 'Less Ice'] },
        { id: 'item-kingfisher-beer', categoryId: 'cat-beverages', name: 'Kingfisher Premium Beer (330ml)', price: 240, dietary: 'VEG', isAvailable: true, modifiers: ['Chilled'] },

        // Desserts
        { id: 'item-gulab-jamun', categoryId: 'cat-desserts', name: 'Gulab Jamun (2 pcs)', price: 140, dietary: 'VEG', isAvailable: true, modifiers: ['Warm', 'With Ice Cream'] }
      ];
      offlineStore.setCollection('menu_items', defaultItems);
    }
  }

  getAllCategories() {
    const list = offlineStore.getCollection('menu_categories') || [];
    return list.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  getAllMenuItems() {
    return offlineStore.getCollection('menu_items') || [];
  }

  getItemsByCategory(categoryId) {
    const items = this.getAllMenuItems();
    return items.filter(i => i.categoryId === categoryId && i.isAvailable);
  }

  getItem(itemId) {
    const items = this.getAllMenuItems();
    return items.find(i => i.id === itemId) || null;
  }

  searchItems(query) {
    if (!query) return this.getAllMenuItems();
    const q = query.toLowerCase();
    return this.getAllMenuItems().filter(i => 
      i.name.toLowerCase().includes(q) || 
      i.dietary.toLowerCase().includes(q)
    );
  }
}

export const menuMasterModel = new MenuMasterModel();
