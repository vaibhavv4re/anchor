import { UOM_REGISTRY } from './uomRegistry.js';

/**
 * Canonical unit-of-measure conversion engine.
 *
 * Preserves the existing conversion behavior from bundle.js.
 */
export class UomConversionEngine {
  constructor(registry = UOM_REGISTRY) {
    this.registry = registry;
  }

  getUom(code) {
    if (!code) return null;
    return this.registry[String(code).toUpperCase().trim()] || null;
  }

  getFamily(code) {
    const u = this.getUom(code);
    return u ? u.family : null;
  }

  areSameFamily(uom1, uom2) {
    const f1 = this.getFamily(uom1);
    const f2 = this.getFamily(uom2);
    return f1 && f2 && f1 === f2;
  }

  convertQuantity(qty, fromUomCode, toUomCode, itemContext = null) {
    const quantity = parseFloat(qty);

    if (isNaN(quantity)) {
      return { success: false, error: 'Invalid quantity' };
    }

    const fromCode = String(fromUomCode || '').toUpperCase().trim();
    const toCode = String(toUomCode || '').toUpperCase().trim();

    if (fromCode === toCode) {
      return { success: true, convertedQty: quantity };
    }

    const uomFrom = this.getUom(fromCode);
    const uomTo = this.getUom(toCode);

    if (!uomFrom || !uomTo) {
      return {
        success: false,
        error: `Unrecognized UOM code (${!uomFrom ? fromCode : toCode}). Free-text UOMs are disallowed.`
      };
    }

    // Item-level container purchase UOM conversion.
    if (uomFrom.isContainer || uomTo.isContainer) {
      if (
        itemContext &&
        itemContext.purchaseConversionFactor &&
        itemContext.purchaseUom
      ) {
        const pUom = String(itemContext.purchaseUom).toUpperCase().trim();
        const factor = parseFloat(itemContext.purchaseConversionFactor);

        if (
          fromCode === pUom &&
          toCode === String(itemContext.baseUom).toUpperCase().trim()
        ) {
          return { success: true, convertedQty: quantity * factor };
        }

        if (
          toCode === pUom &&
          fromCode === String(itemContext.baseUom).toUpperCase().trim()
        ) {
          return { success: true, convertedQty: quantity / factor };
        }
      }

      return {
        success: false,
        error: `Container UOM (${fromCode}/${toCode}) requires an item-specific conversion factor.`
      };
    }

    // Cross-family conversion is not permitted.
    if (uomFrom.family !== uomTo.family) {
      return {
        success: false,
        error: `Cross-family conversion not allowed (${uomFrom.family} -> ${uomTo.family}).`
      };
    }

    const baseQty = quantity * uomFrom.baseRatio;
    const convertedQty = baseQty / uomTo.baseRatio;

    return { success: true, convertedQty };
  }
}
