/**
 * Frozen canonical UOM registry.
 * Source: existing bundle.js PD-035 specification.
 */
export const UOM_REGISTRY = {
  // Weight Family (Base: G)
  'MG': { code: 'MG', name: 'Milligram', family: 'WEIGHT', isBase: false, baseRatio: 0.001, icon: '⚖️' },
  'G': { code: 'G', name: 'Gram', family: 'WEIGHT', isBase: true, baseRatio: 1, icon: '⚖️' },
  'KG': { code: 'KG', name: 'Kilogram', family: 'WEIGHT', isBase: false, baseRatio: 1000, icon: '⚖️' },

  // Volume Family (Base: ML)
  'ML': { code: 'ML', name: 'Millilitre', family: 'VOLUME', isBase: true, baseRatio: 1, icon: '🥤' },
  'LTR': { code: 'LTR', name: 'Litre', family: 'VOLUME', isBase: false, baseRatio: 1000, icon: '🥤' },

  // Count Family (Base: PCS)
  'PCS': { code: 'PCS', name: 'Piece', family: 'COUNT', isBase: true, baseRatio: 1, icon: '📦' },
  'DOZEN': { code: 'DOZEN', name: 'Dozen', family: 'COUNT', isBase: false, baseRatio: 12, icon: '📦' },
  'PACK': { code: 'PACK', name: 'Pack', family: 'COUNT', isBase: false, isContainer: true, icon: '📦' },
  'BOX': { code: 'BOX', name: 'Box', family: 'COUNT', isBase: false, isContainer: true, icon: '📦' },
  'BOTTLE': { code: 'BOTTLE', name: 'Bottle', family: 'COUNT', isBase: false, isContainer: true, icon: '📦' },
  'CAN': { code: 'CAN', name: 'Can', family: 'COUNT', isBase: false, isContainer: true, icon: '📦' },
  'BAG': { code: 'BAG', name: 'Bag / Sack', family: 'COUNT', isBase: false, isContainer: true, icon: '🛍️' },
  'CRATE': { code: 'CRATE', name: 'Crate', family: 'COUNT', isBase: false, isContainer: true, icon: '🧺' },
  'TIN': { code: 'TIN', name: 'Tin / Canister', family: 'COUNT', isBase: false, isContainer: true, icon: '🛢️' },
  'JAR': { code: 'JAR', name: 'Jar', family: 'COUNT', isBase: false, isContainer: true, icon: '🫙' },
  'CASE': { code: 'CASE', name: 'Case', family: 'COUNT', isBase: false, isContainer: true, icon: '📦' },
  'TRAY': { code: 'TRAY', name: 'Tray', family: 'COUNT', isBase: false, isContainer: true, icon: '🍱' }
};
