/**
 * BusinessOS Platform - Import Dependency Resolver (F9.3)
 * Enforces canonical dependency resolution sequence for restaurant data onboarding.
 * Allows semi-finished items to exist in Inventory Master before their recipes are loaded.
 */

export const EXECUTION_ORDER = [
  'INVENTORY_MASTER',
  'SUPPLIERS',
  'FOOD_MENU',
  'BAR_MENU',
  'FOOD_VARIANTS',
  'BAR_VARIANTS',
  'FOOD_RECIPES',
  'BAR_RECIPES',
  'OPENING_STOCK'
];

export class DependencyResolver {
  /**
   * Sorts array of file objects according to canonical dependency graph.
   * @param {Array<Object>} filesList - List of file descriptors { type, content, filename }
   * @returns {Array<Object>} Ordered file descriptors
   */
  resolveExecutionOrder(filesList = []) {
    const sorted = [];
    EXECUTION_ORDER.forEach(type => {
      const matching = filesList.filter(f => f.type === type);
      sorted.push(...matching);
    });

    // Append any unclassified files at the end safely
    const processedTypes = new Set(EXECUTION_ORDER);
    const unclassified = filesList.filter(f => !processedTypes.has(f.type));
    sorted.push(...unclassified);

    return sorted;
  }
}

export const dependencyResolver = new DependencyResolver();
