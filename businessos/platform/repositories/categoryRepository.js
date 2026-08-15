import { PRODUCT_FAMILIES_REGISTRY } from '../inventory/productFamiliesRegistry.js';
import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * CategoryRepository domain persistence abstraction.
 *
 * Manages inventory categories, product family associations, multi-entity archive validation, and default pre-seeding.
 * Supports constructor dependency injection (DataGateway, OfflineStore, OfflineJournal, AuditLogger) while remaining
 * fully backward-compatible with legacy global platform instances.
 */
export class CategoryRepository {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
    this.productFamiliesRegistry = deps.productFamiliesRegistry || (typeof PRODUCT_FAMILIES_REGISTRY !== 'undefined' ? PRODUCT_FAMILIES_REGISTRY : PRODUCT_FAMILIES_REGISTRY);
  }

  getAll(tenantId = null) {
    let list = [];
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      list = this.dataGateway.getCachedCollection('inventory_categories', tenantId) || [];
    } else {
      const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
      list = store ? store.getCollection('inventory_categories', tenantId) || [] : [];
      if (!list || list.length === 0) {
        list = store ? store.getCollection('inventory_categories') || [] : [];
      }
    }

    if (!list || list.length === 0) {
      return this.initDefaultCategories(tenantId || 'ros-tenant-master');
    }
    return list;
  }

  getByCode(code, tenantId = null) {
    return this.getAll(tenantId).find(c => c.categoryCode === code || c.code === code) || null;
  }

  getById(id, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('inventory_categories', id, tenantId);
    }
    return this.getAll(tenantId).find(c => c.id === id || c.categoryCode === id) || null;
  }

  create(data, session) {
    const tenantId = session ? session.tenantId : (data.tenantId || '');
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    const registry = this.productFamiliesRegistry || PRODUCT_FAMILIES_REGISTRY;

    const familyObj = registry[data.productFamilyCode] || registry['FAM-PRODUCE'] || { code: 'FAM-PRODUCE', name: 'Fruits & Vegetables' };

    let newCat = {
      id: 'cat-' + Math.random().toString(36).substring(2, 7),
      categoryCode: data.categoryCode || ('CAT-' + Math.floor(100 + Math.random() * 900)),
      categoryName: data.categoryName || 'General Category',
      productFamilyCode: familyObj.code,
      productFamilyName: familyObj.name,
      description: data.description || '',
      defaultTaxProfile: data.defaultTaxProfile || '5% GST',
      defaultUom: data.defaultUom || 'KG',
      status: data.status || 'ACTIVE'
    };

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      newCat = this.entityMetadata.attachStandardMetadata(newCat, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      newCat = attachStandardMetadata(newCat, tenantId, session);
    }

    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      this.dataGateway.create('inventory_categories', newCat, session);
    } else {
      if (store) {
        store.appendItem('inventory_categories', newCat);
      }

      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPLOAD_EVENT', tenantId, 'inventory_categories', { commandType: 'CREATE_CATEGORY', eventType: 'CategoryCreated', ...newCat }, session);
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'inventory_categories', { commandType: 'CREATE_CATEGORY', eventType: 'CategoryCreated', ...newCat }, session);
      }
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Created Category "${newCat.categoryName}" (${newCat.categoryCode}) under ${newCat.productFamilyName}`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return newCat;
  }

  update(id, patch, session) {
    const tenantId = session ? session.tenantId : '';
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    const registry = this.productFamiliesRegistry || PRODUCT_FAMILIES_REGISTRY;

    const existing = this.getById(id, tenantId);
    if (existing) {
      if (patch.productFamilyCode && registry[patch.productFamilyCode]) {
        patch.productFamilyName = registry[patch.productFamilyCode].name;
      }
      const updated = {
        ...existing,
        ...patch,
        modifiedBy: session ? session.employeeName : 'Admin',
        modifiedAt: new Date().toISOString(),
        version: (existing.version || 1) + 1
      };

      if (this.dataGateway && typeof this.dataGateway.update === 'function') {
        this.dataGateway.update('inventory_categories', id, patch, session);
      } else {
        const list = store ? (store.getCollection('inventory_categories') || []) : [];
        const idx = list.findIndex(c => (c.id === id || c.categoryCode === id) && (!tenantId || c.tenantId === tenantId));
        if (idx !== -1) {
          list[idx] = updated;
          if (store) {
            store.setCollection('inventory_categories', list);
          }
        }

        if (journal && typeof journal.createSyncJob === 'function') {
          journal.createSyncJob('UPDATE_CATEGORY', tenantId, 'inventory_categories', { id: updated.id, patch }, session);
        } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
          offlineJournal.createSyncJob('UPDATE_CATEGORY', tenantId, 'inventory_categories', { id: updated.id, patch }, session);
        }
      }

      const actor = session ? session.employeeName : 'Admin';
      const actionMsg = `Updated Category "${updated.categoryName}" (${updated.categoryCode})`;
      if (this.auditLogger && typeof this.auditLogger.log === 'function') {
        this.auditLogger.log(actor, actionMsg, tenantId);
      } else if (typeof logAudit === 'function') {
        logAudit(actor, actionMsg, tenantId);
      }

      return updated;
    }
    return null;
  }

  archive(id, session) {
    const tenantId = session ? session.tenantId : '';
    const cat = this.getById(id, tenantId);
    if (!cat) return { success: false, error: 'Category not found.' };

    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);

    // Multi-Entity Dependency Check: Active Inventory Items
    const matchingItems = store
      ? (store.getCollection('inventory', tenantId) || []).filter(i => (i.categoryCode === cat.categoryCode || i.categoryId === cat.id) && i.status !== 'ARCHIVED')
      : [];

    // Multi-Entity Dependency Check: Active Recipe Ingredients
    const matchingRecipes = store
      ? (store.getCollection('recipes', tenantId) || []).filter(r => (r.categoryCode === cat.categoryCode) && r.status !== 'ARCHIVED')
      : [];

    if (matchingItems.length > 0 || matchingRecipes.length > 0) {
      return {
        success: false,
        error: `❌ Cannot archive "${cat.categoryName}". This category is currently referenced by:\n• ${matchingItems.length} Active Inventory Item(s)\n• ${matchingRecipes.length} Recipe Ingredient(s)\n\nPlease reclassify or archive these items before archiving this category.`
      };
    }

    this.update(cat.id, { status: 'ARCHIVED' }, session);

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Archived Category "${cat.categoryName}" (${cat.categoryCode})`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return { success: true };
  }

  initDefaultCategories(tenantId = 'ros-tenant-master') {
    const tid = tenantId || 'ros-tenant-master';
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);

    const defaultList = [
      { id: 'cat-1-' + tid, tenantId: tid, categoryCode: 'CAT-CHICKEN', categoryName: 'Chicken', productFamilyCode: 'FAM-MEAT', productFamilyName: 'Meat & Poultry', description: 'Fresh & frozen chicken cuts', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-2-' + tid, tenantId: tid, categoryCode: 'CAT-MUTTON', categoryName: 'Mutton & Lamb', productFamilyCode: 'FAM-MEAT', productFamilyName: 'Meat & Poultry', description: 'Fresh mutton, lamb chops & minced meat', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-3-' + tid, tenantId: tid, categoryCode: 'CAT-FISH', categoryName: 'Fish & Finfish', productFamilyCode: 'FAM-SEAFOOD', productFamilyName: 'Seafood', description: 'Freshwater & marine fish fillets', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-4-' + tid, tenantId: tid, categoryCode: 'CAT-PRAWNS', categoryName: 'Prawns & Shellfish', productFamilyCode: 'FAM-SEAFOOD', productFamilyName: 'Seafood', description: 'Tiger prawns, white prawns, crabs & shellfish', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-5-' + tid, tenantId: tid, categoryCode: 'CAT-VEG', categoryName: 'Fresh Vegetables', productFamilyCode: 'FAM-PRODUCE', productFamilyName: 'Fruits & Vegetables', description: 'Onions, tomatoes, potatoes, greens & exotic veggies', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-6-' + tid, tenantId: tid, categoryCode: 'CAT-BUTTER', categoryName: 'Butter & Ghee', productFamilyCode: 'FAM-DAIRY', productFamilyName: 'Dairy & Fats', description: 'Salted butter, unsalted butter, clarified butter', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-7-' + tid, tenantId: tid, categoryCode: 'CAT-CHEESE', categoryName: 'Cheese & Cream', productFamilyCode: 'FAM-DAIRY', productFamilyName: 'Dairy & Fats', description: 'Mozzarella, cheddar, processed cheese & fresh cream', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-8-' + tid, tenantId: tid, categoryCode: 'CAT-SPICE-WHOLE', categoryName: 'Whole Spices', productFamilyCode: 'FAM-SPICES', productFamilyName: 'Spices & Seasonings', description: 'Cardamom, cinnamon, cloves, cumin seeds, black pepper', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-9-' + tid, tenantId: tid, categoryCode: 'CAT-SPICE-POWDER', categoryName: 'Powdered Spices', productFamilyCode: 'FAM-SPICES', productFamilyName: 'Spices & Seasonings', description: 'Turmeric powder, red chili powder, coriander powder, garama masala', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-10-' + tid, tenantId: tid, categoryCode: 'CAT-OILS', categoryName: 'Cooking Oils & Fats', productFamilyCode: 'FAM-CONDIMENTS', productFamilyName: 'Oils, Sauces & Condiments', description: 'Sunflower oil, mustard oil, olive oil, sesame oil', defaultUom: 'LTR', status: 'ACTIVE' },
      { id: 'cat-11-' + tid, tenantId: tid, categoryCode: 'CAT-RICE', categoryName: 'Rice & Staples', productFamilyCode: 'FAM-GRAINS', productFamilyName: 'Grains, Pulses & Dry Goods', description: 'Basmati rice, jeera rice, wheat flour, maida', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-12-' + tid, tenantId: tid, categoryCode: 'CAT-BEV-ALC', categoryName: 'Spirits & Beer', productFamilyCode: 'FAM-BEVERAGES', productFamilyName: 'Beverages', description: 'Whiskey, rum, vodka, gin, beer, wine', defaultUom: 'BOTTLE', status: 'ACTIVE' },
      { id: 'cat-13-' + tid, tenantId: tid, categoryCode: 'CAT-BEV-SOFT', categoryName: 'Soft Drinks & Juices', productFamilyCode: 'FAM-BEVERAGES', productFamilyName: 'Beverages', description: 'Sodas, tonic water, canned fruit juices, syrups', defaultUom: 'CAN', status: 'ACTIVE' },
      { id: 'cat-14-' + tid, tenantId: tid, categoryCode: 'CAT-MASALA-BASE', categoryName: 'Signature Gravies & Masalas', productFamilyCode: 'FAM-PREPS', productFamilyName: 'Semi-Finished Preparations', description: 'White gravy, makhani gravy, onion tomato masala base', defaultUom: 'KG', status: 'ACTIVE' },
      { id: 'cat-15-' + tid, tenantId: tid, categoryCode: 'CAT-TAKEAWAY', categoryName: 'Takeaway Packaging', productFamilyCode: 'FAM-PACKAGING', productFamilyName: 'Packaging', description: 'Meal boxes, paper bags, plastic containers, cutlery', defaultUom: 'PCS', status: 'ACTIVE' }
    ];

    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      defaultList.forEach(c => this.dataGateway.create('inventory_categories', c));
    } else {
      const existing = store ? (store.getCollection('inventory_categories') || []) : [];
      const merged = [...existing, ...defaultList];
      if (store) {
        store.setCollection('inventory_categories', merged);
      }
    }

    return defaultList;
  }
}
