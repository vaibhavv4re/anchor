/**
 * BusinessOS Platform - Kitchen & Menu Domain Model (K-02 Menu)
 * Manages kitchen_menu_items collection via DataGateway (Supabase + offlineStore cache).
 * Implements CRUD, Excel/CSV bulk parsing & validation, availability line controls,
 * controlled lifecycle archiving, and recipe linkage pointer tracking.
 *
 * ARCHITECTURE: Reads from offlineStore (populated by DataGateway bootstrap hydration).
 * Writes go through DataGateway → Supabase + local cache synchronously.
 * actualMenuData.js (demo seed) is kept as a utility but MUST NOT be called in the live path.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { ACTUAL_ANCHOR_MENU } from '../../../restaurantos/frontend/capabilities/kitchen/data/actualMenuData.js';

class KitchenMenuModel {
  /**
   * Lazily resolve DataGateway from global app graph.
   * Returns null if not yet initialized (safe to call at any time).
   * @returns {DataGateway|null}
   */
  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  /**
   * Fire-and-forget cloud sync for a single menu item.
   * Writes to Supabase via DataGateway without blocking the synchronous model API.
   * @param {'create'|'update'} op
   * @param {Object} record
   */
  _syncToCloud(op, record) {
    const dg = this._getDataGateway();
    if (!dg) return;
    const promise = op === 'create'
      ? dg.create('kitchen_menu_items', record)
      : dg.update('kitchen_menu_items', record.id, record);
    promise.catch(e => console.warn('[kitchenMenuModel] Cloud sync error:', e.message));
  }

  /**
   * Retrieve all menu items for a tenant, applying optional filters.
   * @param {string|null} tenantId 
   * @param {Object} filters { category, dietaryType, availabilityStatus, lifecycleStatus, searchQuery, showArchived }
   * @returns {Array<Object>}
   */
  getAll(tenantId = null, filters = {}) {
    const rawList = offlineStore.getCollection('kitchen_menu_items', tenantId) || [];
    const showArchived = filters.showArchived || false;

    return rawList.filter(item => {
      // Filter by tenant if provided
      if (tenantId && item.tenantId && item.tenantId !== tenantId) return false;

      // Filter out ARCHIVED unless explicitly requested
      const lifecycle = item.lifecycleStatus || 'ACTIVE';
      if (!showArchived && lifecycle === 'ARCHIVED') return false;
      if (filters.lifecycleStatus && lifecycle !== filters.lifecycleStatus) return false;

      // Filter by Category
      if (filters.category && filters.category !== 'ALL' && item.category !== filters.category) return false;

      // Filter by Dietary Type
      if (filters.dietaryType && filters.dietaryType !== 'ALL' && item.dietaryType !== filters.dietaryType) return false;

      // Filter by Availability Status
      if (filters.availabilityStatus && filters.availabilityStatus !== 'ALL' && (item.availabilityStatus || 'AVAILABLE') !== filters.availabilityStatus) return false;

      // Filter by Search Query (itemName, itemCode, description)
      if (filters.searchQuery && filters.searchQuery.trim() !== '') {
        const q = filters.searchQuery.toLowerCase().trim();
        const nameMatch = (item.itemName || '').toLowerCase().includes(q);
        const codeMatch = (item.itemCode || '').toLowerCase().includes(q);
        const catMatch = (item.category || '').toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !catMatch) return false;
      }

      return true;
    });
  }

  /**
   * Alias for getAll(tenantId)
   */
  getAllMenuItems(tenantId = null, filters = {}) {
    return this.getAll(tenantId, filters);
  }

  /**
   * Get single menu item by ID
   * @param {string} id 
   * @returns {Object|null}
   */
  getById(id) {
    const list = offlineStore.getCollection('kitchen_menu_items') || [];
    return list.find(i => i.id === id) || null;
  }

  /**
   * Deduplicate existing menu items collection by (category + itemName).
   * Merges variants from duplicates into the primary item and removes duplicate records.
   * @returns {number} Number of duplicate records removed
   */
  deduplicateMenuItems() {
    const list = offlineStore.getCollection('kitchen_menu_items') || [];
    const map = new Map();
    const uniqueList = [];
    let removedCount = 0;

    list.forEach(item => {
      const name = (item.itemName || item.name || '').toLowerCase().trim();
      const cat = (item.category || '').toLowerCase().trim();
      if (!name) return;

      const normKey = `${cat}_${name}`;

      if (map.has(normKey)) {
        const primary = map.get(normKey);
        // Merge variants
        if (Array.isArray(item.variants)) {
          item.variants.forEach(nv => {
            const ex = primary.variants.find(v => v.name === nv.name || v.id === nv.id);
            if (ex) {
              if (nv.sellingPrice > 0) ex.sellingPrice = nv.sellingPrice;
            } else {
              primary.variants.push(nv);
            }
          });
        }
        if (primary.sellingPrice === 0 && (item.sellingPrice || item.price) > 0) {
          primary.sellingPrice = item.sellingPrice || item.price;
        }
        removedCount++;
      } else {
        const cleanedVariants = Array.isArray(item.variants) ? [...item.variants] : [];
        const primary = { ...item, variants: cleanedVariants };
        map.set(normKey, primary);
        uniqueList.push(primary);
      }
    });

    if (removedCount > 0) {
      offlineStore.setCollection('kitchen_menu_items', uniqueList);
      if (typeof platformEventBus !== 'undefined') {
        platformEventBus.publish('data:changed', { collection: 'kitchen_menu_items' });
      }
    }
    return removedCount;
  }

  /**
   * Create or update a menu item record adhering to K-02 Core Schema
   * @param {Object} itemData 
   * @returns {Object}
   */
  saveItem(itemData) {
    const list = offlineStore.getCollection('kitchen_menu_items') || [];
    const now = new Date().toISOString();

    let existingIndex = -1;
    if (itemData.id) {
      existingIndex = list.findIndex(i => i.id === itemData.id);
    }
    if (existingIndex < 0 && itemData.itemCode) {
      existingIndex = list.findIndex(i => i.itemCode === itemData.itemCode);
    }
    if (existingIndex < 0 && itemData.itemName) {
      existingIndex = list.findIndex(i => 
        (i.itemName || i.name || '').toLowerCase().trim() === itemData.itemName.toLowerCase().trim() &&
        (i.category || '').toLowerCase().trim() === (itemData.category || '').toLowerCase().trim()
      );
    }

    const existing = existingIndex >= 0 ? list[existingIndex] : null;

    // Merge or replace variants if updating existing item
    let finalVariants = Array.isArray(itemData.variants) ? [...itemData.variants] : [];
    if (!itemData.replaceVariants && existing && Array.isArray(existing.variants)) {
      existing.variants.forEach(ev => {
        const nvMatch = finalVariants.find(v => v.name === ev.name || v.id === ev.id);
        if (nvMatch) {
          if (nvMatch.sellingPrice === 0 && ev.sellingPrice > 0) {
            nvMatch.sellingPrice = ev.sellingPrice;
          }
        } else {
          finalVariants.push(ev);
        }
      });
    }

    const cleanedItem = {
      id: existing ? existing.id : (itemData.id || `menu-item-${Math.random().toString(36).substring(2, 9)}`),
      itemCode: existing ? existing.itemCode : (itemData.itemCode || `MENU-${Math.floor(1000 + Math.random() * 9000)}`),
      itemName: itemData.itemName || (existing ? existing.itemName : 'Untitled Menu Item'),
      category: itemData.category || (existing ? existing.category : 'GENERAL'),
      description: itemData.description || (existing ? existing.description : ''),
      sellingPrice: parseFloat(itemData.sellingPrice) || parseFloat(itemData.price) || (existing ? existing.sellingPrice : 0),
      taxProfile: itemData.taxProfile || (existing ? existing.taxProfile : 'GST_5'),
      dietaryType: itemData.dietaryType || (existing ? existing.dietaryType : 'VEG'),
      portionSize: itemData.portionSize || (existing ? existing.portionSize : '1 Portion'),
      availabilityStatus: itemData.availabilityStatus || (existing ? existing.availabilityStatus : 'AVAILABLE'),
      lifecycleStatus: itemData.lifecycleStatus || (existing ? existing.lifecycleStatus : 'ACTIVE'),
      recipeId: itemData.recipeId || (existing ? existing.recipeId : null),
      routing: itemData.routing || (existing ? existing.routing : 'KITCHEN_LINE'),
      productionArea: itemData.productionArea || (existing ? existing.productionArea : 'BAR'),
      recipeNotes: itemData.recipeNotes || (existing ? existing.recipeNotes : ''),
      spicinessLevel: itemData.spicinessLevel || (existing ? existing.spicinessLevel : 'MEDIUM'),
      region: itemData.region || (existing ? existing.region : 'Coastal India'),
      hasVariants: Boolean(finalVariants.length > 0),
      variants: finalVariants,
      tenantId: itemData.tenantId || (existing ? existing.tenantId : null),
      createdAt: existing ? (existing.createdAt || now) : now,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...cleanedItem };
      this._syncToCloud('update', cleanedItem);
    } else {
      list.push(cleanedItem);
      this._syncToCloud('create', cleanedItem);
    }

    offlineStore.setCollection('kitchen_menu_items', list);
    if (typeof platformEventBus !== 'undefined') {
      platformEventBus.publish('data:changed', { collection: 'kitchen_menu_items', item: cleanedItem });
    }
    return cleanedItem;
  }

  /**
   * Update item availability status (e.g. AVAILABLE / UNAVAILABLE)
   */
  updateItemStatus(id, newStatus) {
    const list = offlineStore.getCollection('kitchen_menu_items') || [];
    const item = list.find(i => i.id === id || i.itemCode === id);
    if (item) {
      item.availabilityStatus = newStatus;
      item.updatedAt = new Date().toISOString();
      offlineStore.setCollection('kitchen_menu_items', list);
      if (typeof platformEventBus !== 'undefined') {
        platformEventBus.publish('data:changed', { collection: 'kitchen_menu_items', item });
      }
      return item;
    }
    return null;
  }

  /**
   * Update operational 86 availability status for a specific variant
   * Emits MENU_VARIANT_86ED platform audit event.
   * @param {string} itemId 
   * @param {string} variantId 
   * @param {'AVAILABLE'|'UNAVAILABLE_86'} newStatus 
   * @param {string} performedBy 
   * @param {string} reason 
   * @returns {Object|null}
   */
  updateVariantAvailability(itemId, variantId, newStatus, performedBy = 'Bartender', reason = 'OUT_OF_STOCK') {
    const list = offlineStore.getCollection('kitchen_menu_items') || [];
    const item = list.find(i => i.id === itemId || i.itemCode === itemId);
    if (!item) return null;

    if (!Array.isArray(item.variants)) {
      item.variants = [
        { id: `${item.id}_reg`, name: 'Regular', sellingPrice: item.price || item.sellingPrice || 350, availabilityStatus: item.availabilityStatus || 'AVAILABLE' }
      ];
    }

    const variant = item.variants.find(v => v.id === variantId || v.variantId === variantId);
    if (variant) {
      variant.availabilityStatus = newStatus;
      variant.updatedAt = new Date().toISOString();
    } else {
      // Item level update
      item.variants.forEach(v => { v.availabilityStatus = newStatus; });
    }

    const hasAvailable = item.variants.some(v => v.availabilityStatus === 'AVAILABLE');
    item.availabilityStatus = hasAvailable ? 'AVAILABLE' : 'UNAVAILABLE_86';
    item.updatedAt = new Date().toISOString();

    offlineStore.setCollection('kitchen_menu_items', list);
    this._syncToCloud('update', item);

    if (typeof platformEventBus !== 'undefined') {
      platformEventBus.publish('MENU_VARIANT_86ED', {
        itemId: item.id,
        variantId,
        newStatus,
        performedBy,
        reason,
        timestamp: new Date().toISOString(),
        source: 'BAR_WORKSPACE'
      });
      platformEventBus.publish('data:changed', { collection: 'kitchen_menu_items', item });
    }
    return item;
  }

  /**
   * Fast service-mode availability toggle (AVAILABLE, PAUSED, SOLD_OUT)
   * @param {string} id 
   * @param {string} newStatus 
   * @returns {Object|null}
   */
  toggleAvailability(id, newStatus) {
    const list = offlineStore.getCollection('kitchen_menu_items') || [];
    const item = list.find(i => i.id === id);
    if (!item) return null;

    item.availabilityStatus = newStatus;
    item.updatedAt = new Date().toISOString();
    offlineStore.setCollection('kitchen_menu_items', list);
    this._syncToCloud('update', item);
    return item;
  }

  /**
   * Soft-delete / Archive menu item (controlled lifecycle transition to ARCHIVED)
   * @param {string} id 
   * @returns {Object|null}
   */
  archiveItem(id) {
    const list = offlineStore.getCollection('kitchen_menu_items') || [];
    const item = list.find(i => i.id === id);
    if (!item) return null;

    item.lifecycleStatus = 'ARCHIVED';
    item.updatedAt = new Date().toISOString();
    offlineStore.setCollection('kitchen_menu_items', list);
    this._syncToCloud('update', item);
    return item;
  }

  /**
   * Load Actual Anchor Coastal Menu Dataset (70 Items)
   * @param {string|null} tenantId 
   * @returns {{ success: boolean, importedCount: number }}
   */
  importActualMenu(tenantId = null) {
    let count = 0;
    ACTUAL_ANCHOR_MENU.forEach(rawItem => {
      this.saveItem({
        ...rawItem,
        tenantId,
        availabilityStatus: 'AVAILABLE',
        lifecycleStatus: 'ACTIVE'
      });
      count++;
    });
    return { success: true, importedCount: count };
  }

  /**
   * Import menu items from parsed Excel/CSV array rows
   * @param {Array<Object>} rows Array of row objects from CSV/Excel
   * @param {string|null} tenantId 
   * @returns {{ success: boolean, importedCount: number, errors: Array<string> }}
   */
  importFromRows(rows, tenantId = null) {
    const errors = [];
    let count = 0;

    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, importedCount: 0, errors: ['No data rows found in uploaded file.'] };
    }

    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const itemName = row['Item Name'] || row['item_name'] || row['itemName'] || row['Item'] || row['Name'];
      const priceRaw = row['Price'] || row['selling_price'] || row['sellingPrice'] || row['Rate'] || row['Cost'];
      const category = row['Category'] || row['category'] || 'GENERAL';
      const dietary = row['Dietary Type'] || row['dietary_type'] || row['dietaryType'] || row['Type'] || 'VEG';

      if (!itemName) {
        errors.push(`Row ${rowNum}: Missing mandatory field "Item Name"`);
        return;
      }

      const price = parseFloat(priceRaw);
      if (isNaN(price)) {
        errors.push(`Row ${rowNum} ("${itemName}"): Invalid price value "${priceRaw}"`);
        return;
      }

      // Normalise dietary type
      let normDiet = 'VEG';
      const dUpper = String(dietary).toUpperCase();
      if (dUpper.includes('NON') || dUpper.includes('CHICKEN') || dUpper.includes('FISH') || dUpper.includes('MUTTON')) {
        normDiet = 'NON_VEG';
      } else if (dUpper.includes('EGG')) {
        normDiet = 'EGG';
      } else if (dUpper.includes('VEGAN')) {
        normDiet = 'VEGAN';
      }

      this.saveItem({
        itemCode: row['Item Code'] || row['item_code'] || row['itemCode'] || `MENU-${Math.floor(1000 + Math.random() * 9000)}`,
        itemName: String(itemName).trim(),
        category: String(category).trim().toUpperCase(),
        sellingPrice: price,
        dietaryType: normDiet,
        description: row['Description'] || row['description'] || '',
        portionSize: row['Portion Size'] || row['portion_size'] || row['Portion'] || '1 Portion',
        routing: row['Routing'] || row['routing'] || 'KITCHEN_LINE',
        tenantId,
        availabilityStatus: 'AVAILABLE',
        lifecycleStatus: 'ACTIVE'
      });

      count++;
    });

    return {
      success: count > 0,
      importedCount: count,
      errors
    };
  }

  /**
   * Compute menu overview summary KPIs
   * @param {string|null} tenantId 
   * @returns {{ totalItems: number, activeItems: number, soldOutItems: number, pausedItems: number, withoutRecipeItems: number, categories: Array<string> }}
   */
  getStats(tenantId = null) {
    const list = this.getAll(tenantId, { showArchived: false });
    const totalItems = list.length;
    const activeItems = list.filter(i => (i.availabilityStatus || 'AVAILABLE') === 'AVAILABLE').length;
    const soldOutItems = list.filter(i => i.availabilityStatus === 'SOLD_OUT').length;
    const pausedItems = list.filter(i => i.availabilityStatus === 'PAUSED').length;
    const withoutRecipeItems = list.filter(i => !i.recipeId).length;

    const categoriesSet = new Set(list.map(i => i.category).filter(Boolean));

    return {
      totalItems,
      activeItems,
      soldOutItems,
      pausedItems,
      withoutRecipeItems,
      categories: Array.from(categoriesSet).sort()
    };
  }

  /**
   * Compute Recipe Linkage stats (K-03 preparation)
   * @param {string|null} tenantId 
   * @returns {{ total: number, linkedCount: number, missingCount: number }}
   */
  getRecipeLinkageStats(tenantId = null) {
    const list = this.getAll(tenantId, { showArchived: false });
    const total = list.length;
    const linkedCount = list.filter(i => Boolean(i.recipeId)).length;
    const missingCount = total - linkedCount;

    return { total, linkedCount, missingCount };
  }
}

export const kitchenMenuModel = new KitchenMenuModel();
