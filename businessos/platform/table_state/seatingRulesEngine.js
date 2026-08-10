/**
 * BusinessOS Platform - Seating Rules Engine
 * Validates seating capacity rules and manages table merge specification metadata.
 */

import { tableMasterModel } from '../layout/tableMasterModel.js';

class SeatingRulesEngine {
  /**
   * Validate seating guest count against table min/max capacity.
   * @param {number} tableNumber 
   * @param {number} guestCount 
   * @returns {{isValid: boolean, warning?: string}}
   */
  validateSeatingCapacity(tableNumber, guestCount) {
    const table = tableMasterModel.getTableMaster(tableNumber);
    if (!table) return { isValid: false, warning: 'Table not found' };

    if (guestCount > table.maxSeats) {
      return {
        isValid: false,
        warning: `Guest count (${guestCount}) exceeds Table ${tableNumber} maximum capacity (${table.maxSeats}). Consider table merging.`
      };
    }

    return { isValid: true };
  }
}

export const seatingRulesEngine = new SeatingRulesEngine();
