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

/**
 * Canonical packaging helpers (single source of truth for the "how much real
 * stock is one physical package?" rule). These read ITEM-LEVEL master data
 * (stock/purchase UOM, purchase conversion, content qty) rather than the frozen
 * registry's global ratios, because containers (CAN / CASE / PACK / BOTTLE)
 * deliberately have no global ratio. Additive only: when an item carries no
 * packaging metadata the quantity is passed through untouched, so every existing
 * SKU behaves exactly as before.
 */
const _norm = (s) => String(s == null ? '' : s).toUpperCase().trim();
const _round = (n) => parseFloat((Math.round((Number(n) || 0) * 10000) / 10000).toFixed(4));
const _fld = (o, camel, snake) =>
  o && o[camel] !== undefined ? o[camel] : (o ? o[snake] : undefined);

/**
 * Resolve a quantity expressed in a supplier/packaging UOM into the item's
 * canonical STOCK unit.
 *   - Received in the stock/base unit            -> already canonical.
 *   - Received in the declared purchase pack      -> qty x conversionFactor.
 *   - No packaging metadata / unknown unit        -> pass through (non-breaking).
 * @returns {{quantity:number, uom:string, converted:boolean, reason:string}}
 */
export function resolveCanonicalStockQuantity(item, qty, inUom) {
  const quantity = parseFloat(qty) || 0;
  if (!item) {
    return { quantity, uom: _norm(inUom), converted: false, reason: 'NO_ITEM' };
  }

  const stockUom = _norm(_fld(item, 'baseUom', 'base_uom') || _fld(item, 'stockUom', 'stock_uom') || item.baseUnit);
  const purchaseUom = _norm(_fld(item, 'purchaseUom', 'purchase_uom') || item.purchaseUnit);
  const convRaw = _fld(item, 'conversionFactor', 'conversion_factor');
  const conv = convRaw === undefined || convRaw === null || convRaw === '' ? 1 : (parseFloat(convRaw) || 1);
  const from = _norm(inUom);

  // Nothing declared to convert against -> preserve legacy pass-through.
  if (!purchaseUom || !stockUom) {
    return { quantity, uom: from || stockUom, converted: false, reason: 'NO_PACKAGING_META' };
  }

  // Already expressed in the canonical stock unit (or unspecified -> assume base).
  if (!from || from === stockUom) {
    return { quantity, uom: stockUom, converted: false, reason: 'ALREADY_STOCK_UOM' };
  }

  // Received in the supplier pack -> expand to canonical stock units.
  if (from === purchaseUom && conv > 0 && conv !== 1) {
    return { quantity: _round(quantity * conv), uom: stockUom, converted: true, factor: conv, reason: 'PURCHASE_TO_STOCK' };
  }

  // A unit that is neither the stock unit nor the declared pack -> never guess.
  return { quantity, uom: from, converted: false, reason: 'UNKNOWN_IN_UOM' };
}

/**
 * True when `code` is a physical container (CASE / PACK / BOX / CAN / BOTTLE /
 * BAG / CRATE / TIN / JAR / TRAY / DOZEN) per the frozen registry. Containers
 * deliberately carry no global ratio, so receiving stock in one without an
 * item-specific conversion is always a mis-post risk. Used by the GRN guard.
 */
export function isContainerUom(code) {
  const u = UOM_REGISTRY[_norm(code)];
  return !!(u && u.isContainer);
}

/**
 * Physical content equivalence for display & reconciliation, e.g. 120 PCS x
 * 500 ML = 60000 ML = 60 L. Derived purely from item master (content_quantity x
 * content_uom). Returns available:false when the item declares no content.
 */
export function computeContentEquivalent(item, stockQty) {
  const qty = parseFloat(stockQty) || 0;
  const cqRaw = _fld(item, 'contentQuantity', 'content_quantity');
  const cu = _norm(_fld(item, 'contentUom', 'content_uom'));
  const cq = cqRaw === undefined || cqRaw === null || cqRaw === '' ? 0 : (parseFloat(cqRaw) || 0);
  if (!item || cq <= 0 || !cu) return { available: false };

  const totalInContentUom = qty * cq;
  const family = (UOM_REGISTRY[cu] && UOM_REGISTRY[cu].family) || null;
  let canonicalQty = totalInContentUom;
  let canonicalUom = cu;
  if (family && cu !== 'ML') {
    // Fold to the family's base unit using the registry ratio (ML / G / PCS).
    const baseRatio = UOM_REGISTRY[cu].baseRatio;
    const baseCode = family === 'VOLUME' ? 'ML' : (family === 'WEIGHT' ? 'G' : cu);
    canonicalQty = _round(totalInContentUom * baseRatio);
    canonicalUom = baseCode;
  }
  return { available: true, contentPerUnit: cq, contentUom: cu, totalInContentUom: _round(totalInContentUom), canonicalQty, canonicalUom, family };
}
