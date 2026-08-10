/**
 * BusinessOS Platform - Production Specification Model (ProdSpec)
 * Maps Menu Items to Production Specifications and target production destinations (KITCHEN vs BAR).
 */

import { offlineStore } from '../offline_store/offlineStore.js';

export const ProductionDestinations = Object.freeze({
  KITCHEN: 'KITCHEN',
  BAR: 'BAR'
});

class ProdSpecModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('prod_specs')) {
      const defaultSpecs = [
        // Food Items -> KITCHEN Station
        { itemId: 'item-paneer-tikka', destination: ProductionDestinations.KITCHEN, stationName: 'Tandoor Station', prepTimeMinutes: 15 },
        { itemId: 'item-chicken-tikka', destination: ProductionDestinations.KITCHEN, stationName: 'Tandoor Station', prepTimeMinutes: 18 },
        { itemId: 'item-butter-chicken', destination: ProductionDestinations.KITCHEN, stationName: 'Curry Station', prepTimeMinutes: 20 },
        { itemId: 'item-dal-makhani', destination: ProductionDestinations.KITCHEN, stationName: 'Curry Station', prepTimeMinutes: 15 },
        { itemId: 'item-garlic-naan', destination: ProductionDestinations.KITCHEN, stationName: 'Breads Station', prepTimeMinutes: 8 },
        { itemId: 'item-gulab-jamun', destination: ProductionDestinations.KITCHEN, stationName: 'Desserts Station', prepTimeMinutes: 5 },

        // Drink Items -> BAR Station
        { itemId: 'item-fresh-lime', destination: ProductionDestinations.BAR, stationName: 'Mocktail Bar', prepTimeMinutes: 5 },
        { itemId: 'item-mojito', destination: ProductionDestinations.BAR, stationName: 'Mocktail Bar', prepTimeMinutes: 6 },
        { itemId: 'item-kingfisher-beer', destination: ProductionDestinations.BAR, stationName: 'Beverage Bar', prepTimeMinutes: 2 }
      ];
      offlineStore.setCollection('prod_specs', defaultSpecs);
    }
  }

  getProdSpecForItem(itemId) {
    const specs = offlineStore.getCollection('prod_specs') || [];
    return specs.find(s => s.itemId === itemId) || {
      itemId,
      destination: ProductionDestinations.KITCHEN,
      stationName: 'Main Kitchen',
      prepTimeMinutes: 15
    };
  }
}

export const prodSpecModel = new ProdSpecModel();
