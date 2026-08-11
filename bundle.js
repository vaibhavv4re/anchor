/**
 * RestaurantOS v1.0 - Standalone Single-File Bundle
 * Card 1: Business Profile & Operational Preferences (PD-017 & PD-017A)
 * Card 2: Dining Areas (PD-019, PD-019A & PD-019B)
 * Card 3: Dining Tables & Assets (PD-020 & PD-021)
 * Card 4: Staff & Access (PD-022 & PD-023)
 * Milestone 1: Inventory Manager Workspace & CANON-11 Master Data Platform (PD-024 to PD-031)
 * PD-032: Offline First & Cloud Synchronization Architecture (FROZEN SPECIFICATION)
 * PD-034: Live Supabase Cloud Authentication & REST Synchronization Adapter Integration
 */

(function () {
  'use strict';

  // Crypto / Hash Helper for 6-Digit PINs
  async function hashPin(pinStr) {
    const msgUint8 = new TextEncoder().encode(String(pinStr).trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Device ID Helper for Optimistic Entity Metadata
  function getDeviceId() {
    let devId = localStorage.getItem('ros_device_id');
    if (!devId) {
      devId = 'dev-' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('ros_device_id', devId);
    }
    return devId;
  }

  // 🌐 Supabase REST API Cloud Adapter (PD-034 Configuration)
  class SupabaseClient {
    constructor() {
      this.baseUrl = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1';
      this.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';
    }

    getHeaders() {
      return {
        'apikey': this.anonKey,
        'Authorization': `Bearer ${this.anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation, resolution=merge-duplicates'
      };
    }

    async upsertRecord(tableName, record) {
      try {
        const resp = await fetch(`${this.baseUrl}/${tableName}`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(record)
        });
        if (!resp.ok) {
          const errText = await resp.text();
          return { success: false, status: resp.status, error: errText };
        }
        const data = await resp.json();
        return { success: true, data };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    async deleteRecords(tableName, queryFilter) {
      try {
        const resp = await fetch(`${this.baseUrl}/${tableName}?${queryFilter}`, {
          method: 'DELETE',
          headers: this.getHeaders()
        });
        if (!resp.ok) {
          const errText = await resp.text();
          return { success: false, status: resp.status, error: errText };
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    async fetchTableData(tableName) {
      try {
        const resp = await fetch(`${this.baseUrl}/${tableName}?select=*`, {
          method: 'GET',
          headers: this.getHeaders()
        });
        if (!resp.ok) return { success: false, status: resp.status };
        const data = await resp.json();
        return { success: true, data };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  }
  const supabaseClient = new SupabaseClient();

  // Helper mapper to format exact PostgreSQL columns per table (PD-034)
  function formatRecordForTable(entityName, job) {
    const p = job.payload || {};

    if (entityName === 'tables_master') {
      return {
        id: p.id || ('tbl-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        area_id: p.areaId || null,
        table_code: p.tableCode || 'T-01',
        seats: parseInt(p.seats) || 4,
        shape: p.shape || 'SQUARE',
        status: p.status || 'ACTIVE',
        data: p
      };
    }

    if (entityName === 'dining_areas') {
      return {
        id: p.id || ('area-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        area_code: p.areaCode || 'MH',
        area_name: p.areaName || 'Main Area',
        area_type: p.areaType || 'Indoor',
        status: p.status || 'OPEN',
        data: p
      };
    }

    if (entityName === 'inventory') {
      return {
        uuid: p.uuid || ('uuid-' + Math.random().toString(36).substring(2, 9)),
        tenant_id: job.tenantId || p.tenantId || '',
        item_code: p.itemCode || '',
        item_name: p.itemName || '',
        item_type: p.itemType || 'Raw Material',
        category_code: p.categoryCode || 'GENERAL',
        base_uom: p.baseUom || 'KG',
        opening_stock: parseFloat(p.openingStock) || 0,
        reorder_level: parseFloat(p.reorderLevel) || 0,
        unit_valuation: parseFloat(p.unitValuation) || 0,
        default_location_code: p.defaultLocationCode || 'LOC-MWH',
        default_supplier_code: p.defaultSupplierCode || 'SUP-001',
        version: p.version || 1,
        status: p.status || 'ACTIVE',
        data: p
      };
    }

    if (entityName === 'tenants') {
      return {
        tenant_id: job.tenantId || p.tenantId || '',
        name: p.name || 'Restaurant',
        legal_name: p.legalName || '',
        admin_name: p.adminName || 'Admin',
        admin_pin: p.adminPin || '999999',
        profile_version: p.profileVersion || 1,
        data: p
      };
    }

    if (entityName === 'suppliers') {
      return {
        id: p.id || ('sup-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        supplier_code: p.supplierCode || '',
        supplier_name: p.supplierName || '',
        primary_contact: p.primaryContact || '',
        phone: p.phone || '',
        email: p.email || '',
        gstin: p.gstin || '',
        status: p.status || 'ACTIVE',
        data: p
      };
    }

    if (entityName === 'employees') {
      return {
        id: p.id || ('emp-' + Math.random().toString(36).substring(2, 7)),
        identity_id: p.identityId || '',
        tenant_id: job.tenantId || p.tenantId || '',
        employee_code: p.employeeCode || '',
        name: p.name || '',
        role_id: p.roleId || 'role-waiter',
        workspace_default: p.workspaceDefault || 'waiter',
        status: p.status || 'ACTIVE',
        data: p
      };
    }

    if (entityName === 'storage_locations') {
      return {
        id: p.id || ('loc-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        location_code: p.locationCode || '',
        location_name: p.locationName || '',
        parent_location_code: p.parentLocationCode || null,
        storage_type: p.locationType || p.storageType || 'Store',
        data: p
      };
    }

    if (entityName === 'inventory_uoms') {
      return {
        id: p.id || ('uom-' + (p.uomCode || '').toLowerCase()),
        tenant_id: job.tenantId || p.tenantId || '',
        uom_code: p.uomCode || p.code || '',
        uom_name: p.uomName || p.name || '',
        uom_family: p.uomFamily || p.family || 'COUNT',
        is_base_unit: p.isBaseUnit !== undefined ? p.isBaseUnit : true,
        conversion_factor: parseFloat(p.conversionFactor || p.baseRatio) || 1,
        data: p
      };
    }

    if (entityName === 'purchase_orders') {
      return {
        id: p.id || ('po-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        po_number: p.poNumber || p.po_number || '',
        supplier_code: p.supplierCode || p.supplier_code || '',
        supplier_name: p.supplierName || p.supplier_name || '',
        status: p.status || 'DRAFT',
        total_amount: parseFloat(p.totalAmount || p.total_amount) || 0,
        data: p
      };
    }

    if (entityName === 'goods_receipt_notes') {
      return {
        id: p.id || ('grn-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        grn_number: p.grnNumber || p.grn_number || '',
        po_number: p.poNumber || p.po_number || '',
        supplier_code: p.supplierCode || p.supplier_code || '',
        status: p.status || 'POSTED',
        total_received_value: parseFloat(p.totalReceivedValue || p.total_received_value) || 0,
        data: p
      };
    }

    if (entityName === 'stock_transfers') {
      return {
        id: p.id || ('st-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        transfer_number: p.transferNumber || p.transfer_number || '',
        from_location_code: p.fromLocationCode || p.from_location_code || '',
        to_location_code: p.toLocationCode || p.to_location_code || '',
        status: p.status || 'COMPLETED',
        data: p
      };
    }

    if (entityName === 'stock_issues') {
      return {
        id: p.id || ('si-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        issue_number: p.issueNumber || p.issue_number || '',
        location_code: p.locationCode || p.location_code || '',
        department: p.department || '',
        status: p.status || 'POSTED',
        data: p
      };
    }

    if (entityName === 'stock_adjustments') {
      return {
        id: p.id || ('sa-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        adjustment_number: p.adjustmentNumber || p.adjustment_number || '',
        location_code: p.locationCode || p.location_code || '',
        reason: p.reason || '',
        status: p.status || 'POSTED',
        data: p
      };
    }

    if (entityName === 'stock_counts') {
      return {
        id: p.id || ('sc-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        count_number: p.countNumber || p.count_number || '',
        location_code: p.locationCode || p.location_code || '',
        status: p.status || 'COMPLETED',
        data: p
      };
    }

    if (entityName === 'inventory_requests') {
      return {
        id: p.id || ('req-' + Math.random().toString(36).substring(2, 7)),
        tenant_id: job.tenantId || p.tenantId || '',
        request_number: p.requestNumber || p.request_number || '',
        department: p.department || '',
        status: p.status || 'PENDING',
        data: p
      };
    }

    return {
      job_id: job.jobId,
      job_type: job.jobType,
      tenant_id: job.tenantId,
      entity_name: job.entityName,
      payload: job.payload,
      device_id: job.deviceId,
      version: job.version,
      actor: job.actor,
      correlation_id: job.correlationId,
      sync_state: 'SYNCED'
    };
  }

  // Pre-defined System Role Templates (PD-023 Specification)
  const ROLE_TEMPLATES = {
    'role-superadmin': {
      id: 'role-superadmin',
      name: 'Super Admin',
      icon: '👑',
      description: 'Platform owner with multi-tenant creation & database wipe control.',
      defaultWorkspace: 'superadmin',
      permissions: ['ALL']
    },
    'role-admin': {
      id: 'role-admin',
      name: 'Admin / Owner',
      icon: '⚙️',
      description: 'Full administrative control over restaurant setup, dining areas, tables, staff, & commissioning.',
      defaultWorkspace: 'admin',
      permissions: ['ADMIN_DASHBOARD', 'CONFIG_PROFILE', 'CONFIG_AREAS', 'CONFIG_TABLES', 'CONFIG_STAFF', 'CONFIG_DEVICES', 'CONFIG_PAYMENTS', 'COMMISSIONING', 'AUDIT_LOGS']
    },
    'role-inventory': {
      id: 'role-inventory',
      name: 'Inventory Manager',
      icon: '📦',
      description: 'Master Product Catalog, CANON-11 bulk imports, supplier management, storage locations, stock transfers, & inventory requests.',
      defaultWorkspace: 'inventory',
      permissions: ['INVENTORY_CATALOG', 'CANON11_IMPORTS', 'MANAGE_SUPPLIERS', 'STORAGE_LOCATIONS', 'STOCK_TRANSFERS', 'INVENTORY_REQUESTS']
    },
    'role-waiter': {
      id: 'role-waiter',
      name: 'Floor Waiter',
      icon: '🍽️',
      description: 'Floor Map situational awareness, seating guests, taking table orders, & issuing KOTs.',
      defaultWorkspace: 'waiter',
      permissions: ['FLOOR_MAP_VIEW', 'SEAT_GUESTS', 'CREATE_ORDER', 'ISSUE_KOT', 'SPLIT_BILL']
    },
    'role-chef': {
      id: 'role-chef',
      name: 'Head Chef',
      icon: '👨‍🍳',
      description: 'Kitchen Display Queue (KDS), managing food menu items, recipe specifications, & marking KOT items ready.',
      defaultWorkspace: 'kitchen',
      permissions: ['KITCHEN_KDS_VIEW', 'MARK_ITEM_READY', 'MANAGE_FOOD_RECIPES', 'MANAGE_FOOD_MENU']
    },
    'role-bartender': {
      id: 'role-bartender',
      name: 'Bartender',
      icon: '🍺',
      description: 'Bar Display Queue (BDS), cocktail recipes, drink menu catalog, & marking drink tickets ready.',
      defaultWorkspace: 'bar',
      permissions: ['BAR_BDS_VIEW', 'MARK_DRINK_READY', 'MANAGE_DRINK_RECIPES', 'MANAGE_DRINK_MENU']
    },
    'role-cashier': {
      id: 'role-cashier',
      name: 'Billing Cashier',
      icon: '🧾',
      description: 'Cashier checkout counter, split payments, issuing GST tax invoices, & settlement closing.',
      defaultWorkspace: 'cashier',
      permissions: ['CASHIER_BILLING', 'APPLY_DISCOUNT', 'PRINT_TAX_INVOICE', 'SETTLE_PAYMENT']
    }
  };

  // Offline LocalStorage Repository with Tenant Scoping
  class OfflineStore {
    getCollection(key, tenantId = null) {
      try {
        const raw = localStorage.getItem(`ros_${key}`);
        const list = raw ? JSON.parse(raw) : null;
        if (!list) return null;
        if (tenantId && Array.isArray(list)) {
          const tenantFiltered = list.filter(item => item.tenantId === tenantId || !item.tenantId);
          if (tenantFiltered.length > 0) return tenantFiltered;
        }
        return list;
      } catch (e) {
        console.error('Failed to read collection', key, e);
        return null;
      }
    }
    setCollection(key, data) {
      try {
        localStorage.setItem(`ros_${key}`, JSON.stringify(data));
      } catch (e) {
        console.error('Failed to save collection', key, e);
      }
    }
    appendItem(key, item) {
      const list = this.getCollection(key) || [];
      list.push(item);
      this.setCollection(key, list);
    }
    updateItem(key, idField, idVal, patchObj) {
      const list = this.getCollection(key) || [];
      const idx = list.findIndex(i => i[idField] === idVal);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...patchObj };
        this.setCollection(key, list);
      }
    }
    resetAllData() {
      localStorage.clear();
      this.initCleanPlatform();
    }
    initCleanPlatform() {
      const existingIdentities = this.getCollection('identities');
      if (!existingIdentities || existingIdentities.length === 0) {
        this.setCollection('identities', [
          { id: 'id-superadmin', pinHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', status: 'ACTIVE' }
        ]);
      }

      const existingEmployees = this.getCollection('employees');
      if (!existingEmployees || existingEmployees.length === 0) {
        this.setCollection('employees', [
          { id: 'emp-superadmin', identityId: 'id-superadmin', employeeCode: 'EMP-00001', name: 'Super Admin', roleId: 'role-superadmin', workspaceDefault: 'superadmin', terminalRestriction: 'Any Device', status: 'ACTIVE', timeline: [{ time: new Date().toISOString(), actor: 'System Pre-seed', action: 'Created Super Admin Account' }] }
        ]);
      }

      if (!this.getCollection('tenants')) this.setCollection('tenants', []);
      if (!this.getCollection('roles')) this.setCollection('roles', Object.values(ROLE_TEMPLATES));
      if (!this.getCollection('dining_areas')) this.setCollection('dining_areas', []);
      if (!this.getCollection('tables_master')) this.setCollection('tables_master', []);
      if (!this.getCollection('audit_logs')) this.setCollection('audit_logs', []);
      if (!this.getCollection('inventory_categories')) this.setCollection('inventory_categories', []);
      if (!this.getCollection('inventory_uoms')) this.setCollection('inventory_uoms', []);
      if (!this.getCollection('storage_locations')) this.setCollection('storage_locations', []);
      if (!this.getCollection('suppliers')) this.setCollection('suppliers', []);
      if (!this.getCollection('inventory')) this.setCollection('inventory', []);
      if (!this.getCollection('inventory_requests')) this.setCollection('inventory_requests', []);
      if (!this.getCollection('import_history')) this.setCollection('import_history', []);
      if (!this.getCollection('offline_journal')) this.setCollection('offline_journal', []);
    }

    initDefaultData() {
      if (!this.getCollection('identities')) {
        this.initCleanPlatform();
      }
    }
  }
  const offlineStore = new OfflineStore();
  offlineStore.initDefaultData();

  // Audit Logger Helper
  function logAudit(user, action, tenantId = null) {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const item = {
      id: 'aud-' + Math.random().toString(36).substring(2, 7),
      tenantId,
      time: timeStr,
      user,
      action,
      correlationId: 'corr-' + Math.random().toString(36).substring(2, 7)
    };
    offlineStore.appendItem('audit_logs', item);
  }

  // ⚡ FROZEN PD-032: Offline Journal & Infrastructure Sync Pipeline
  class OfflineJournal {
    createSyncJob(jobType, tenantId, entityName, payload, session) {
      const job = {
        jobId: 'job-' + Math.random().toString(36).substring(2, 9),
        jobType,
        tenantId,
        entityName,
        payload,
        deviceId: getDeviceId(),
        version: payload.version || 1,
        timestamp: new Date().toISOString(),
        actor: session ? session.employeeName : 'System Worker',
        correlationId: payload.correlationId || ('corr-' + Math.random().toString(36).substring(2, 7)),
        syncState: 'QUEUED' // 6-State Entity Lifecycle: LOCAL_ONLY, QUEUED, SYNCING, SYNCED, CONFLICT, ERROR
      };
      offlineStore.appendItem('offline_journal', job);
      window.dispatchEvent(new CustomEvent('ros_sync_updated'));
      return job;
    }
    getJobs(tenantId = null) {
      return offlineStore.getCollection('offline_journal', tenantId) || [];
    }
    getPendingJobs(tenantId = null) {
      const jobs = this.getJobs(tenantId);
      return jobs.filter(j => j.syncState === 'QUEUED');
    }
    updateJobState(jobId, syncState, patch = {}) {
      offlineStore.updateItem('offline_journal', 'jobId', jobId, { syncState, ...patch });
      window.dispatchEvent(new CustomEvent('ros_sync_updated'));
    }
  }
  const offlineJournal = new OfflineJournal();

  // 🏷️ FROZEN CANONICAL PRODUCT FAMILIES REGISTRY (PD-035 Specification)
  const PRODUCT_FAMILIES_REGISTRY = {
    'FAM-MEAT': { code: 'FAM-MEAT', name: 'Meat & Poultry', icon: '🥩', description: 'Chicken, mutton, processed meats' },
    'FAM-SEAFOOD': { code: 'FAM-SEAFOOD', name: 'Seafood', icon: '🐟', description: 'Fish, prawns, shellfish, seafood products' },
    'FAM-PRODUCE': { code: 'FAM-PRODUCE', name: 'Fruits & Vegetables', icon: '🥬', description: 'Fresh vegetables, fruits, herbs, greens' },
    'FAM-DAIRY': { code: 'FAM-DAIRY', name: 'Dairy & Fats', icon: '🥛', description: 'Milk, cream, butter, cheese, ghee, cooking fats' },
    'FAM-SPICES': { code: 'FAM-SPICES', name: 'Spices & Seasonings', icon: '🌶️', description: 'Whole spices, powdered spices, seasonings' },
    'FAM-CONDIMENTS': { code: 'FAM-CONDIMENTS', name: 'Oils, Sauces & Condiments', icon: '🫙', description: 'Cooking oils, vinegar, sauces, pastes, condiments' },
    'FAM-GRAINS': { code: 'FAM-GRAINS', name: 'Grains, Pulses & Dry Goods', icon: '🍛', description: 'Rice, flour, pulses, cereals, dry staples' },
    'FAM-PACKAGED': { code: 'FAM-PACKAGED', name: 'Canned & Packaged Foods', icon: '🥫', description: 'Canned ingredients, packaged food products' },
    'FAM-BEVERAGES': { code: 'FAM-BEVERAGES', name: 'Beverages', icon: '🍹', description: 'Bar & non-alcoholic beverage ingredients/products' },
    'FAM-PREPS': { code: 'FAM-PREPS', name: 'Semi-Finished Preparations', icon: '🧂', description: 'Masalas, gravy bases, dips, stocks, sauces' },
    'FAM-PACKAGING': { code: 'FAM-PACKAGING', name: 'Packaging', icon: '📦', description: 'Takeaway containers, boxes, bags, foil, cups' },
    'FAM-CONSUMABLES': { code: 'FAM-CONSUMABLES', name: 'Consumables', icon: '🧻', description: 'Tissues, napkins, POS rolls, operating disposables' },
    'FAM-HOUSEKEEPING': { code: 'FAM-HOUSEKEEPING', name: 'Cleaning & Housekeeping', icon: '🧹', description: 'Detergents, sanitizers, cleaning chemicals' },
    'FAM-ASSETS': { code: 'FAM-ASSETS', name: 'Operating Assets', icon: '🪑', description: 'Glasses, mugs, equipment, utensils' },
    'FAM-SERVICES': { code: 'FAM-SERVICES', name: 'Services', icon: '🧾', description: 'Delivery charges, service fees, non-stock items' }
  };

  // 📐 FROZEN CANONICAL UOM REGISTRY (PD-035 Specification)
  const UOM_REGISTRY = {
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

  // ⚡ Centralized Deterministic UOM Conversion Engine
  class UomConversionEngine {
    getUom(code) {
      if (!code) return null;
      return UOM_REGISTRY[String(code).toUpperCase().trim()] || null;
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
      if (isNaN(quantity)) return { success: false, error: 'Invalid quantity' };

      const fromCode = String(fromUomCode || '').toUpperCase().trim();
      const toCode = String(toUomCode || '').toUpperCase().trim();

      if (fromCode === toCode) return { success: true, convertedQty: quantity };

      const uomFrom = this.getUom(fromCode);
      const uomTo = this.getUom(toCode);

      if (!uomFrom || !uomTo) {
        return { success: false, error: `Unrecognized UOM code (${!uomFrom ? fromCode : toCode}). Free-text UOMs are disallowed.` };
      }

      // Check item-level container purchase UOM conversion
      if (uomFrom.isContainer || uomTo.isContainer) {
        if (itemContext && itemContext.purchaseConversionFactor && itemContext.purchaseUom) {
          const pUom = String(itemContext.purchaseUom).toUpperCase().trim();
          const factor = parseFloat(itemContext.purchaseConversionFactor);
          if (fromCode === pUom && toCode === String(itemContext.baseUom).toUpperCase().trim()) {
            return { success: true, convertedQty: quantity * factor };
          }
          if (toCode === pUom && fromCode === String(itemContext.baseUom).toUpperCase().trim()) {
            return { success: true, convertedQty: quantity / factor };
          }
        }
        return { success: false, error: `Container UOM (${fromCode}/${toCode}) requires an item-specific conversion factor.` };
      }

      // Check family compatibility
      if (uomFrom.family !== uomTo.family) {
        return { success: false, error: `Cross-family conversion not allowed (${uomFrom.family} -> ${uomTo.family}).` };
      }

      const baseQty = quantity * uomFrom.baseRatio;
      const convertedQty = baseQty / uomTo.baseRatio;
      return { success: true, convertedQty };
    }
  }
  const uomConversionEngine = new UomConversionEngine();

  class SyncEngine {
    constructor() {
      this.isOnline = navigator.onLine;
      this.lastSyncTime = new Date();
      this.isProcessing = false;
      this.initListeners();
      this.pullLatestFromSupabase();
      this.startBackgroundWorker();
    }
    initListeners() {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.pullLatestFromSupabase();
        this.processQueue();
        window.dispatchEvent(new CustomEvent('ros_sync_updated'));
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        window.dispatchEvent(new CustomEvent('ros_sync_updated'));
      });
    }
    startBackgroundWorker() {
      setInterval(() => {
        if (this.isOnline && !this.isProcessing) {
          this.processQueue();
        }
      }, 5000);
    }
    async pullLatestFromSupabase() {
      if (!this.isOnline) return;
      try {
        const resTenants = await supabaseClient.fetchTableData('tenants');
        if (resTenants.success && Array.isArray(resTenants.data) && resTenants.data.length > 0) {
          const cloudTenants = resTenants.data.map(r => r.data || {
            tenantId: r.tenant_id,
            name: r.name,
            legalName: r.legal_name,
            adminName: r.admin_name,
            adminPin: r.admin_pin,
            profileVersion: r.profile_version || 1,
            isOperationsStarted: true
          });
          offlineStore.setCollection('tenants', cloudTenants);
        }

        const resEmps = await supabaseClient.fetchTableData('employees');
        if (resEmps.success && Array.isArray(resEmps.data) && resEmps.data.length > 0) {
          const cloudEmps = resEmps.data.map(r => r.data || {
            id: r.id,
            identityId: r.identity_id,
            tenantId: r.tenant_id,
            employeeCode: r.employee_code,
            name: r.name,
            roleId: r.role_id,
            workspaceDefault: r.workspace_default,
            status: r.status
          });
          offlineStore.setCollection('employees', cloudEmps);
        }

        const resSuppliers = await supabaseClient.fetchTableData('suppliers');
        if (resSuppliers.success && Array.isArray(resSuppliers.data) && resSuppliers.data.length > 0) {
          const cloudSuppliers = resSuppliers.data.map(r => r.data || {
            id: r.id,
            tenantId: r.tenant_id,
            supplierCode: r.supplier_code,
            supplierName: r.supplier_name,
            primaryContact: r.primary_contact,
            phone: r.phone,
            email: r.email,
            gstin: r.gstin,
            status: r.status
          });
          offlineStore.setCollection('suppliers', cloudSuppliers);
        }

        const resLocations = await supabaseClient.fetchTableData('storage_locations');
        if (resLocations.success && Array.isArray(resLocations.data) && resLocations.data.length > 0) {
          const cloudLocations = resLocations.data.map(r => r.data || {
            id: r.id,
            tenantId: r.tenant_id,
            locationCode: r.location_code,
            locationName: r.location_name,
            parentLocationCode: r.parent_location_code,
            locationType: r.storage_type || 'Store'
          });
          offlineStore.setCollection('storage_locations', cloudLocations);
        }

        const resUoms = await supabaseClient.fetchTableData('inventory_uoms');
        if (resUoms.success && Array.isArray(resUoms.data) && resUoms.data.length > 0) {
          const cloudUoms = resUoms.data.map(r => r.data || {
            id: r.id,
            tenantId: r.tenant_id,
            uomCode: r.uom_code,
            uomName: r.uom_name,
            uomFamily: r.uom_family,
            isBaseUnit: r.is_base_unit,
            conversionFactor: r.conversion_factor
          });
          offlineStore.setCollection('inventory_uoms', cloudUoms);
        }

        const resInventory = await supabaseClient.fetchTableData('inventory');
        if (resInventory.success && Array.isArray(resInventory.data) && resInventory.data.length > 0) {
          const cloudInventory = resInventory.data.map(r => {
            if (r.data && typeof r.data === 'object' && Object.keys(r.data).length > 0) {
              return r.data;
            }
            return {
              uuid: r.uuid || r.id,
              id: r.uuid || r.id,
              tenantId: r.tenant_id,
              itemCode: r.item_code,
              itemName: r.item_name,
              itemType: r.item_type || 'Raw Material',
              categoryCode: r.category_code || 'GENERAL',
              baseUom: r.base_uom || 'KG',
              openingStock: parseFloat(r.opening_stock) || 0,
              currentStock: parseFloat(r.opening_stock) || 0,
              reorderLevel: parseFloat(r.reorder_level) || 0,
              unitValuation: parseFloat(r.unit_valuation) || 0,
              defaultLocationCode: r.default_location_code || 'LOC-MWH',
              defaultSupplierCode: r.default_supplier_code || 'SUP-001',
              status: r.status || 'ACTIVE'
            };
          });
          offlineStore.setCollection('inventory', cloudInventory);
        }

        const resCategories = await supabaseClient.fetchTableData('inventory_categories');
        if (resCategories.success && Array.isArray(resCategories.data) && resCategories.data.length > 0) {
          const cloudCategories = resCategories.data.map(r => r.data || {
            id: r.id,
            tenantId: r.tenant_id,
            categoryCode: r.category_code,
            categoryName: r.category_name,
            productFamilyCode: r.product_family_code
          });
          offlineStore.setCollection('inventory_categories', cloudCategories);
        }

        const resIdentities = await supabaseClient.fetchTableData('identities');
        if (resIdentities.success && Array.isArray(resIdentities.data) && resIdentities.data.length > 0) {
          const cloudIdentities = resIdentities.data.map(r => r.data || {
            id: r.id,
            pinHash: r.pin_hash,
            tenantId: r.tenant_id,
            status: r.status
          });
          const localIdentities = offlineStore.getCollection('identities') || [];
          const mergedIdentities = [...localIdentities];
          cloudIdentities.forEach(ci => {
            if (!mergedIdentities.some(li => li.id === ci.id || li.pinHash === ci.pinHash)) {
              mergedIdentities.push(ci);
            }
          });
          offlineStore.setCollection('identities', mergedIdentities);
        }

        this.ensureAllLocationsSynced();
        window.dispatchEvent(new CustomEvent('ros_sync_updated'));
      } catch (e) {
        console.warn('Supabase sync pull encountered issue:', e);
      }
    }
    async processQueue() {
      const pending = offlineJournal.getPendingJobs();
      if (pending.length === 0) return;

      this.isProcessing = true;
      for (const job of pending) {
        offlineJournal.updateJobState(job.jobId, 'SYNCING');

        // Format record to match target PostgreSQL table schema
        const dbRecord = formatRecordForTable(job.entityName, job);
        const targetTable = dbRecord.job_id ? 'offline_journal' : job.entityName;
        const res = await supabaseClient.upsertRecord(targetTable, dbRecord);

        if (res.success) {
          offlineJournal.updateJobState(job.jobId, 'SYNCED', { syncedAt: new Date().toISOString() });
        } else if (res.status === 404) {
          // Table does not exist in Supabase yet -> transition to WAITING_FOR_SCHEMA to stop background console spam
          offlineJournal.updateJobState(job.jobId, 'WAITING_FOR_SCHEMA', { lastError: 'Table missing in Supabase. Run supabase_schema.sql DDL script.' });
        } else {
          offlineJournal.updateJobState(job.jobId, 'ERROR', { lastError: res.error || 'Network error' });
        }
      }
      this.isProcessing = false;
      this.lastSyncTime = new Date();
      window.dispatchEvent(new CustomEvent('ros_sync_updated'));
    }
    ensureAllLocationsSynced() {
      const locs = offlineStore.getCollection('storage_locations') || [];
      if (!locs.length) return;
      const existingJobs = offlineJournal.getJobs();
      const queuedOrSyncedIds = new Set(
        existingJobs
          .filter(j => j.entityName === 'storage_locations' && j.payload)
          .map(j => j.payload.id || j.payload.locationCode)
      );

      locs.forEach(loc => {
        const key = loc.id || loc.locationCode;
        if (!queuedOrSyncedIds.has(key)) {
          offlineJournal.createSyncJob('UPLOAD_EVENT', loc.tenantId || '', 'storage_locations', { commandType: 'CREATE_STORAGE_LOCATION', eventType: 'StorageLocationCreated', ...loc }, { employeeName: 'System Worker', tenantId: loc.tenantId });
        }
      });

      // Reset any schema-waiting or failed location sync jobs back to QUEUED for immediate retry
      existingJobs.filter(j => j.entityName === 'storage_locations' && (j.syncState === 'WAITING_FOR_SCHEMA' || j.syncState === 'ERROR')).forEach(j => {
        offlineJournal.updateJobState(j.jobId, 'QUEUED');
      });
    }
    forceSyncNow() {
      // Reset all queued or schema-waiting jobs back to QUEUED for retry
      const jobs = offlineJournal.getJobs();
      jobs.filter(j => j.syncState === 'WAITING_FOR_SCHEMA' || j.syncState === 'ERROR').forEach(j => {
        offlineJournal.updateJobState(j.jobId, 'QUEUED');
      });
      this.processQueue();
    }
    getSyncState(tenantId = null) {
      const pending = offlineJournal.getPendingJobs(tenantId);
      const waiting = offlineJournal.getJobs(tenantId).filter(j => j.syncState === 'WAITING_FOR_SCHEMA');
      if (!this.isOnline) {
        return { status: 'OFFLINE', badgeClass: 'badge-warning', label: `🟡 Offline (${pending.length + waiting.length} Pending)` };
      }
      if (waiting.length > 0 && pending.length === 0) {
        return { status: 'WAITING_FOR_SCHEMA', badgeClass: 'badge-warning', label: `⚠️ Supabase Tables Missing (${waiting.length})` };
      }
      if (pending.length > 0) {
        return { status: 'SYNCING', badgeClass: 'badge-info', label: `🔄 Syncing (${pending.length} Jobs)` };
      }
      const timeStr = this.lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { status: 'SYNCED', badgeClass: 'badge-success', label: `🟢 Synced (${timeStr})` };
    }
  }
  const syncEngine = new SyncEngine();

  // Helper to attach Standardized Entity Metadata (PD-032)
  function attachStandardMetadata(obj, tenantId, session) {
    const now = new Date().toISOString();
    return {
      ...obj,
      tenantId,
      version: obj.version || 1,
      deviceId: getDeviceId(),
      createdBy: session ? session.employeeName : 'System Worker',
      modifiedBy: session ? session.employeeName : 'System Worker',
      correlationId: 'corr-' + Math.random().toString(36).substring(2, 7),
      createdAt: now,
      modifiedAt: now,
      syncState: 'QUEUED',
      cloudVersion: null,
      deletedAt: null
    };
  }

  // 🏛️ FROZEN PD-032: Typed Repository Abstraction Layer
  class InventoryRepository {
    getAll(tenantId) {
      return offlineStore.getCollection('inventory', tenantId) || [];
    }
    getByCode(itemCode, tenantId) {
      return this.getAll(tenantId).find(i => i.itemCode === itemCode) || null;
    }
    getById(id, tenantId) {
      return this.getAll(tenantId).find(i => i.id === id || i.uuid === id || i.itemCode === id) || null;
    }
    create(itemData, session) {
      const tenantId = session ? session.tenantId : (itemData.tenantId || '');

      // Auto-derive Product Family from Category
      let catObj = null;
      if (itemData.categoryCode) {
        catObj = categoryRepository.getByCode(itemData.categoryCode, tenantId);
      }
      const productFamilyCode = catObj ? catObj.productFamilyCode : (itemData.productFamilyCode || 'FAM-PRODUCE');
      const productFamilyName = PRODUCT_FAMILIES_REGISTRY[productFamilyCode] ? PRODUCT_FAMILIES_REGISTRY[productFamilyCode].name : (itemData.productFamilyName || 'Fruits & Vegetables');
      const categoryName = catObj ? catObj.categoryName : (itemData.categoryName || itemData.categoryCode || 'General');

      let newItem = {
        uuid: 'uuid-' + Math.random().toString(36).substring(2, 9),
        itemCode: itemData.itemCode || ('RM' + Math.floor(1000 + Math.random() * 9000)),
        itemName: itemData.itemName || 'Untitled Item',
        itemType: itemData.itemType || 'Raw Material',
        categoryCode: itemData.categoryCode || 'CAT-VEG',
        categoryName,
        productFamilyCode,
        productFamilyName,
        status: itemData.status || 'ACTIVE',
        ...itemData
      };
      // Overwrite derived fields to ensure Product Family integrity
      newItem.productFamilyCode = productFamilyCode;
      newItem.productFamilyName = productFamilyName;

      newItem = attachStandardMetadata(newItem, tenantId, session);

      // 4-Tier Pipeline: Command → Domain Event → Projection → Sync Job
      const commandType = 'CREATE_INVENTORY_ITEM';
      const eventType = 'InventoryItemCreated';

      offlineStore.appendItem('inventory', newItem);
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'inventory', { commandType, eventType, ...newItem }, session);
      logAudit(session ? session.employeeName : 'Admin', `Created Master Inventory Item "${newItem.itemName}" (${newItem.itemCode})`, tenantId);
      return newItem;
    }
    update(id, patch, session) {
      const tenantId = session ? session.tenantId : '';
      const list = offlineStore.getCollection('inventory') || [];
      const idx = list.findIndex(i => (i.id === id || i.uuid === id || i.itemCode === id) && (!tenantId || i.tenantId === tenantId));
      if (idx !== -1) {
        // Auto-derive Product Family if category is changed
        if (patch.categoryCode) {
          const catObj = categoryRepository.getByCode(patch.categoryCode, tenantId);
          if (catObj) {
            patch.categoryName = catObj.categoryName;
            patch.productFamilyCode = catObj.productFamilyCode;
            patch.productFamilyName = PRODUCT_FAMILIES_REGISTRY[catObj.productFamilyCode] ? PRODUCT_FAMILIES_REGISTRY[catObj.productFamilyCode].name : catObj.productFamilyName;
          }
        }
        const updated = {
          ...list[idx],
          ...patch,
          modifiedBy: session ? session.employeeName : 'Admin',
          modifiedAt: new Date().toISOString(),
          version: (list[idx].version || 1) + 1
        };
        list[idx] = updated;
        offlineStore.setCollection('inventory', list);
        offlineJournal.createSyncJob('UPDATE_INVENTORY_ITEM', tenantId, 'inventory', { id: updated.id || updated.uuid, patch }, session);
        logAudit(session ? session.employeeName : 'Admin', `Updated Master Inventory Item "${updated.itemName}" (${updated.itemCode})`, tenantId);
        return updated;
      }
      return null;
    }
  }

  class SupplierRepository {
    getAll(tenantId = null) {
      let sups = offlineStore.getCollection('suppliers', tenantId) || [];
      if (!sups || sups.length === 0) {
        sups = [
          { id: 'sup-001', supplierCode: 'SUP-001', supplierName: 'Prime Foods', contactPerson: 'Rajesh Sharma', phone: '+91 98200 11223', email: 'orders@primefoods.in', status: 'ACTIVE' },
          { id: 'sup-002', supplierCode: 'SUP-002', supplierName: 'Oceanic Fresh Seafood', contactPerson: 'Captain Fernandes', phone: '+91 98211 44556', email: 'sales@oceanicfresh.in', status: 'ACTIVE' },
          { id: 'sup-003', supplierCode: 'SUP-003', supplierName: 'Apex Dairy Products', contactPerson: 'Suresh Patel', phone: '+91 98333 77889', email: 'supply@apexdairy.com', status: 'ACTIVE' },
          { id: 'sup-004', supplierCode: 'SUP-004', supplierName: 'Green Harvest Farm Produce', contactPerson: 'Anil Deshmukh', phone: '+91 98444 99000', email: 'farm@greenharvest.in', status: 'ACTIVE' }
        ];
        offlineStore.setCollection('suppliers', sups);
      }
      return sups;
    }
    getByCode(supplierCode, tenantId = null) {
      return this.getAll(tenantId).find(s => s.supplierCode === supplierCode || s.id === supplierCode || s.supplierName === supplierCode) || null;
    }
    getById(id, tenantId = null) {
      return this.getAll(tenantId).find(s => s.id === id || s.supplierCode === id || s.supplierName === id) || null;
    }
    create(supplierData, session) {
      let newSupplier = {
        id: 'sup-' + Math.random().toString(36).substring(2, 7),
        status: 'ACTIVE',
        ...supplierData
      };
      newSupplier = attachStandardMetadata(newSupplier, session.tenantId, session);

      offlineStore.appendItem('suppliers', newSupplier);
      offlineJournal.createSyncJob('UPLOAD_EVENT', session.tenantId, 'suppliers', { commandType: 'CREATE_SUPPLIER', eventType: 'SupplierCreated', ...newSupplier }, session);
      logAudit(session.employeeName, `Created Supplier "${newSupplier.supplierName}"`, session.tenantId);
      return newSupplier;
    }
    update(id, patch, session) {
      const tenantId = session ? session.tenantId : '';
      const list = offlineStore.getCollection('suppliers') || [];
      const idx = list.findIndex(s => (s.id === id || s.supplierCode === id) && (!tenantId || s.tenantId === tenantId));
      if (idx !== -1) {
        const updated = {
          ...list[idx],
          ...patch,
          modifiedBy: session ? session.employeeName : 'Admin',
          modifiedAt: new Date().toISOString(),
          version: (list[idx].version || 1) + 1
        };
        list[idx] = updated;
        offlineStore.setCollection('suppliers', list);
        offlineJournal.createSyncJob('UPDATE_SUPPLIER', tenantId, 'suppliers', { id: updated.id, patch }, session);
        logAudit(session ? session.employeeName : 'Admin', `Updated Supplier "${updated.supplierName}" (${updated.supplierCode})`, tenantId);
        return updated;
      }
      return null;
    }
    archive(id, session) {
      const tenantId = session ? session.tenantId : '';
      const sup = this.getById(id, tenantId);
      if (!sup) return { success: false, error: 'Supplier not found.' };

      const matchingItems = (offlineStore.getCollection('inventory', tenantId) || []).filter(i => (i.preferredSupplierCode === sup.supplierCode || i.defaultSupplierCode === sup.supplierCode) && i.status !== 'ARCHIVED');

      if (matchingItems.length > 0) {
        return {
          success: false,
          error: `❌ Cannot archive supplier "${sup.supplierName}". This supplier is currently set as the Preferred Supplier for ${matchingItems.length} active inventory item(s) (${matchingItems.map(i => i.itemCode).join(', ')}).\nReassign supplier for these items before archiving.`
        };
      }

      this.update(sup.id, { status: 'ARCHIVED' }, session);
      logAudit(session ? session.employeeName : 'Admin', `Archived Supplier "${sup.supplierName}" (${sup.supplierCode})`, tenantId);
      return { success: true };
    }
  }

  class PurchaseOrderRepository {
    getAll(tenantId = null) {
      return offlineStore.getCollection('purchase_orders', tenantId) || [];
    }
    getByPoNumber(poNumber, tenantId = null) {
      return this.getAll(tenantId).find(p => p.poNumber === poNumber) || null;
    }
    getById(id, tenantId = null) {
      return this.getAll(tenantId).find(p => p.id === id || p.poNumber === id) || null;
    }
    create(poData, session) {
      const tenantId = session ? session.tenantId : (poData.tenantId || '');
      const existing = this.getAll(tenantId);
      const count = existing.length + 1;
      const poNum = poData.poNumber || (`PO-2026-${String(count).padStart(4, '0')}`);

      let newPo = {
        id: 'po-' + Math.random().toString(36).substring(2, 7),
        poNumber: poNum,
        tenantId,
        supplierCode: poData.supplierCode,
        supplierName: poData.supplierName,
        orderDate: poData.orderDate || new Date().toISOString().split('T')[0],
        expectedDeliveryDate: poData.expectedDeliveryDate || new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        destinationLocationCode: poData.destinationLocationCode || 'LOC-MWH',
        paymentTerms: poData.paymentTerms || 'Net 30',
        notes: poData.notes || '',
        items: poData.items || [],
        subtotal: poData.subtotal || 0,
        taxAmount: poData.taxAmount || 0,
        grandTotal: poData.grandTotal || 0,
        status: poData.status || 'DRAFT',
        createdBy: session ? session.employeeName : 'Inventory Manager',
        createdAt: new Date().toISOString(),
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedAt: null
      };

      newPo = attachStandardMetadata(newPo, tenantId, session);
      offlineStore.appendItem('purchase_orders', newPo);
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'purchase_orders', { commandType: 'CREATE_PURCHASE_ORDER', eventType: 'PurchaseOrderCreated', ...newPo }, session);
      logAudit(session ? session.employeeName : 'Admin', `Created Purchase Order "${newPo.poNumber}" (${newPo.supplierName})`, tenantId);
      return newPo;
    }
    update(id, patch, session) {
      const tenantId = session ? session.tenantId : '';
      const list = offlineStore.getCollection('purchase_orders') || [];
      const idx = list.findIndex(p => (p.id === id || p.poNumber === id) && (!tenantId || p.tenantId === tenantId));
      if (idx !== -1) {
        const updated = {
          ...list[idx],
          ...patch,
          modifiedBy: session ? session.employeeName : 'Admin',
          modifiedAt: new Date().toISOString(),
          version: (list[idx].version || 1) + 1
        };
        list[idx] = updated;
        offlineStore.setCollection('purchase_orders', list);
        offlineJournal.createSyncJob('UPDATE_PURCHASE_ORDER', tenantId, 'purchase_orders', { id: updated.id, patch }, session);
        logAudit(session ? session.employeeName : 'Admin', `Updated Purchase Order "${updated.poNumber}" (${updated.status})`, tenantId);
        return updated;
      }
      return null;
    }
  }
  const purchaseOrderRepository = new PurchaseOrderRepository();

  class GoodsReceiptRepository {
    getAll(tenantId = null) {
      return offlineStore.getCollection('goods_receipt_notes', tenantId) || [];
    }
    getByGrnNumber(grnNumber, tenantId = null) {
      return this.getAll(tenantId).find(g => g.grnNumber === grnNumber) || null;
    }
    getById(id, tenantId = null) {
      return this.getAll(tenantId).find(g => g.id === id || g.grnNumber === id) || null;
    }

    // 🔒 Idempotent Stock Creation Engine
    postGRN(grnData, session) {
      const tenantId = session ? session.tenantId : (grnData.tenantId || '');
      const postingId = grnData.postingId || ('post-' + Math.random().toString(36).substring(2, 9));

      // 1. Idempotency Check: Verify if postingId or grnNumber already posted
      const existingGrns = this.getAll(tenantId);
      const alreadyPosted = existingGrns.find(g => g.postingId === postingId || (grnData.grnNumber && g.grnNumber === grnData.grnNumber && g.status === 'POSTED'));
      if (alreadyPosted) {
        return { success: true, grn: alreadyPosted, idempotentRetry: true };
      }

      const isOpeningStock = grnData.documentType === 'OPENING_STOCK';
      const count = existingGrns.length + 1;
      const grnNum = grnData.grnNumber || (isOpeningStock ? `GRN-OPEN-2026-${String(count).padStart(4, '0')}` : `GRN-2026-${String(count).padStart(4, '0')}`);

      const grnRecord = {
        id: 'grn-' + Math.random().toString(36).substring(2, 7),
        grnNumber: grnNum,
        tenantId,
        postingId,
        documentType: isOpeningStock ? 'OPENING_STOCK' : 'PURCHASE_RECEIPT',
        poNumber: grnData.poNumber || (isOpeningStock ? 'DIRECT_RECEIPT' : ''),
        supplierCode: isOpeningStock ? null : (grnData.supplierCode || null),
        supplierName: isOpeningStock ? 'System Opening Stock Initialization' : (grnData.supplierName || 'Vendor'),
        receivingLocationCode: grnData.receivingLocationCode || 'LOC-MWH',
        receivedDate: grnData.receivedDate || new Date().toISOString().split('T')[0],
        vendorInvoiceNo: grnData.vendorInvoiceNo || (isOpeningStock ? 'OPENING_STOCK_INITIALIZATION' : ''),
        deliveryChallanNo: grnData.deliveryChallanNo || '',
        notes: grnData.notes || '',
        lines: grnData.lines || [],
        status: 'POSTED',
        postedBy: session ? session.employeeName : 'Inventory Manager',
        postedAt: new Date().toISOString(),
        inspectionStatus: grnData.inspectionStatus || 'PASSED'
      };

      // 2. Process Line Items: Generate Append-Only Stock Ledger Entries & Update Store Balances
      const ledgerList = offlineStore.getCollection('stock_ledger', tenantId) || [];
      const balanceList = offlineStore.getCollection('stock_balances', tenantId) || [];

      grnRecord.lines.forEach((line, idx) => {
        const acceptedQty = parseFloat(line.acceptedQty) || 0;
        const factor = parseFloat(line.conversionFactor) || 1;
        const acceptedBaseQty = acceptedQty * factor;
        const unitCost = parseFloat(line.actualPurchaseUnitPrice) || 0;
        const baseUnitCost = factor > 0 ? (unitCost / factor) : unitCost;
        const lineValuation = acceptedBaseQty * baseUnitCost;

        // Append Ledger Entry
        const ledgerEntry = {
          ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          transactionType: isOpeningStock ? 'OPENING_STOCK_INBOUND' : 'GOODS_RECEIPT_INBOUND',
          documentNo: grnNum,
          documentType: grnRecord.documentType,
          itemCode: line.itemCode,
          locationCode: grnRecord.receivingLocationCode,
          baseQuantity: acceptedBaseQty,
          baseUom: line.baseUom || 'KG',
          unitCost: baseUnitCost,
          totalValuation: lineValuation,
          batchNumber: line.batchNumber || `BATCH-${grnNum}-${idx + 1}`,
          expiryDate: line.expiryDate || null,
          postedBy: grnRecord.postedBy,
          timestamp: new Date().toISOString()
        };
        ledgerList.push(ledgerEntry);

        // Update Store Balance (stock_balances)
        let balIdx = balanceList.findIndex(b => b.itemCode === line.itemCode && b.locationCode === grnRecord.receivingLocationCode && (!tenantId || b.tenantId === tenantId));
        if (balIdx !== -1) {
          balanceList[balIdx].quantity = (parseFloat(balanceList[balIdx].quantity) || 0) + acceptedBaseQty;
          balanceList[balIdx].valuation = (parseFloat(balanceList[balIdx].valuation) || 0) + lineValuation;
          balanceList[balIdx].lastUpdatedAt = new Date().toISOString();
        } else {
          balanceList.push({
            id: 'bal-' + Math.random().toString(36).substring(2, 7),
            tenantId,
            itemCode: line.itemCode,
            locationCode: grnRecord.receivingLocationCode,
            quantity: acceptedBaseQty,
            baseUom: line.baseUom || 'KG',
            valuation: lineValuation,
            lastUpdatedAt: new Date().toISOString()
          });
        }

        // Update lastPurchasePrice on Master Inventory Item (Definition stays clean; currentStock is NOT mutated)
        const masterItem = inventoryRepository.getByCode(line.itemCode, tenantId);
        if (masterItem && unitCost > 0) {
          inventoryRepository.update(masterItem.id || masterItem.itemCode, {
            lastPurchasePrice: unitCost,
            unitValuation: baseUnitCost
          }, session);
        }
      });

      // Save Collections
      offlineStore.setCollection('stock_ledger', ledgerList);
      offlineStore.setCollection('stock_balances', balanceList);
      offlineStore.appendItem('goods_receipt_notes', attachStandardMetadata(grnRecord, tenantId, session));

      // 3. Update PO Completion Status (if linked to a PO)
      if (grnRecord.poNumber && grnRecord.poNumber !== 'DIRECT_RECEIPT') {
        const po = purchaseOrderRepository.getByPoNumber(grnRecord.poNumber, tenantId);
        if (po) {
          const allGrnsForPo = [...existingGrns, grnRecord].filter(g => g.poNumber === po.poNumber && g.status === 'POSTED');
          let totalOrdered = 0;
          let totalReceived = 0;

          po.items.forEach(poItem => {
            totalOrdered += (parseFloat(poItem.orderedQuantity) || 0);
            let itemRec = 0;
            allGrnsForPo.forEach(g => {
              g.lines.filter(l => l.itemCode === poItem.itemCode).forEach(l => {
                itemRec += (parseFloat(l.receivedQty) || 0);
              });
            });
            totalReceived += itemRec;
          });

          const newPoStatus = totalReceived >= totalOrdered ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED';
          purchaseOrderRepository.update(po.id || po.poNumber, { status: newPoStatus }, session);
        }
      }

      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'goods_receipt_notes', { commandType: 'POST_GOODS_RECEIPT', eventType: 'GoodsReceiptPosted', ...grnRecord }, session);
      logAudit(session ? session.employeeName : 'Admin', `Posted GRN "${grnNum}" (${grnRecord.documentType}) at ${grnRecord.receivingLocationCode}`, tenantId);

      return { success: true, grn: grnRecord, idempotentRetry: false };
    }
  }
  const goodsReceiptRepository = new GoodsReceiptRepository();

  // 🚚 Stock Transfer Engine (Atomic & Idempotent Paired Ledger Posting)
  class StockTransferRepository {
    getAll(tenantId = null) {
      return offlineStore.getCollection('stock_transfers', tenantId) || [];
    }
    postTransfer(data, session) {
      const tenantId = session ? session.tenantId : (data.tenantId || '');
      const postingId = data.postingId || ('post-trf-' + Math.random().toString(36).substring(2, 9));
      const existing = this.getAll(tenantId);
      const alreadyPosted = existing.find(t => t.postingId === postingId || (data.transferNo && t.transferNo === data.transferNo));
      if (alreadyPosted) return { success: true, transfer: alreadyPosted, idempotentRetry: true };

      const fromLoc = data.fromLocationCode;
      const toLoc = data.toLocationCode;
      if (fromLoc === toLoc) return { success: false, error: 'Source and destination locations cannot be identical.' };

      const balanceList = offlineStore.getCollection('stock_balances', tenantId) || [];
      const ledgerList = offlineStore.getCollection('stock_ledger', tenantId) || [];

      // 1. Negative Stock Enforcement
      for (const line of data.lines) {
        const reqQty = parseFloat(line.quantity) || 0;
        const srcBal = balanceList.find(b => b.itemCode === line.itemCode && b.locationCode === fromLoc && (!tenantId || b.tenantId === tenantId));
        const availQty = srcBal ? (parseFloat(srcBal.quantity) || 0) : 0;
        const masterItem = inventoryRepository.getByCode(line.itemCode, tenantId);
        const allowNeg = masterItem ? !!masterItem.allowNegativeStock : false;

        if (!allowNeg && availQty < reqQty) {
          return { success: false, error: `❌ Insufficient Stock for "${line.itemName || line.itemCode}" at ${fromLoc}. Available: ${availQty.toFixed(2)} ${line.baseUom || 'KG'}, Requested: ${reqQty.toFixed(2)} ${line.baseUom || 'KG'}.` };
        }
      }

      const count = existing.length + 1;
      const trfNo = data.transferNo || `TRF-2026-${String(count).padStart(4, '0')}`;
      const groupId = `GRP-${trfNo}`;

      const trfRecord = {
        id: 'trf-' + Math.random().toString(36).substring(2, 7),
        transferNo: trfNo,
        transactionGroupId: groupId,
        postingId,
        tenantId,
        fromLocationCode: fromLoc,
        toLocationCode: toLoc,
        transferDate: data.transferDate || new Date().toISOString().split('T')[0],
        notes: data.notes || '',
        lines: data.lines || [],
        status: 'COMPLETED',
        postedBy: session ? session.employeeName : 'Inventory Manager',
        postedAt: new Date().toISOString()
      };

      // 2. Atomic Paired Ledger Posting: TRANSFER_OUT (-Qty) & TRANSFER_IN (+Qty)
      trfRecord.lines.forEach((line, idx) => {
        const qty = parseFloat(line.quantity) || 0;
        const uom = line.baseUom || 'KG';
        const masterItem = inventoryRepository.getByCode(line.itemCode, tenantId) || {};
        const unitCost = parseFloat(masterItem.unitValuation) || parseFloat(masterItem.lastPurchasePrice) || 0;
        const val = qty * unitCost;

        // OUT Entry
        ledgerList.push({
          ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-TRFOUT-${idx + 1}`,
          tenantId,
          transactionType: 'TRANSFER_OUT',
          transactionGroupId: groupId,
          postingId: `${postingId}-out-${idx}`,
          documentNo: trfNo,
          itemCode: line.itemCode,
          locationCode: fromLoc,
          baseQuantity: -qty,
          baseUom: uom,
          unitCost,
          totalValuation: -val,
          postedBy: trfRecord.postedBy,
          timestamp: new Date().toISOString()
        });

        // IN Entry
        ledgerList.push({
          ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-TRFIN-${idx + 1}`,
          tenantId,
          transactionType: 'TRANSFER_IN',
          transactionGroupId: groupId,
          postingId: `${postingId}-in-${idx}`,
          documentNo: trfNo,
          itemCode: line.itemCode,
          locationCode: toLoc,
          baseQuantity: qty,
          baseUom: uom,
          unitCost,
          totalValuation: val,
          postedBy: trfRecord.postedBy,
          timestamp: new Date().toISOString()
        });

        // Update Source Balance
        let srcIdx = balanceList.findIndex(b => b.itemCode === line.itemCode && b.locationCode === fromLoc && (!tenantId || b.tenantId === tenantId));
        if (srcIdx !== -1) {
          balanceList[srcIdx].quantity = (parseFloat(balanceList[srcIdx].quantity) || 0) - qty;
          balanceList[srcIdx].valuation = Math.max(0, (parseFloat(balanceList[srcIdx].valuation) || 0) - val);
          balanceList[srcIdx].lastUpdatedAt = new Date().toISOString();
        }

        // Update Destination Balance
        let dstIdx = balanceList.findIndex(b => b.itemCode === line.itemCode && b.locationCode === toLoc && (!tenantId || b.tenantId === tenantId));
        if (dstIdx !== -1) {
          balanceList[dstIdx].quantity = (parseFloat(balanceList[dstIdx].quantity) || 0) + qty;
          balanceList[dstIdx].valuation = (parseFloat(balanceList[dstIdx].valuation) || 0) + val;
          balanceList[dstIdx].lastUpdatedAt = new Date().toISOString();
        } else {
          balanceList.push({
            id: 'bal-' + Math.random().toString(36).substring(2, 7),
            tenantId,
            itemCode: line.itemCode,
            locationCode: toLoc,
            quantity: qty,
            baseUom: uom,
            valuation: val,
            lastUpdatedAt: new Date().toISOString()
          });
        }
      });

      offlineStore.setCollection('stock_ledger', ledgerList);
      offlineStore.setCollection('stock_balances', balanceList);
      offlineStore.appendItem('stock_transfers', attachStandardMetadata(trfRecord, tenantId, session));
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'stock_transfers', { commandType: 'POST_STOCK_TRANSFER', eventType: 'StockTransferPosted', ...trfRecord }, session);
      logAudit(session ? session.employeeName : 'Admin', `Posted Stock Transfer "${trfNo}" from ${fromLoc} to ${toLoc}`, tenantId);

      return { success: true, transfer: trfRecord, idempotentRetry: false };
    }
  }
  const stockTransferRepository = new StockTransferRepository();

  // 📤 Stock Issue Engine (Operational Consumption)
  class StockIssueRepository {
    getAll(tenantId = null) {
      return offlineStore.getCollection('stock_issues', tenantId) || [];
    }
    postIssue(data, session) {
      const tenantId = session ? session.tenantId : (data.tenantId || '');
      const postingId = data.postingId || ('post-iss-' + Math.random().toString(36).substring(2, 9));
      const existing = this.getAll(tenantId);
      const alreadyPosted = existing.find(i => i.postingId === postingId || (data.issueNo && i.issueNo === data.issueNo));
      if (alreadyPosted) return { success: true, issue: alreadyPosted, idempotentRetry: true };

      const fromLoc = data.fromLocationCode;
      const balanceList = offlineStore.getCollection('stock_balances', tenantId) || [];
      const ledgerList = offlineStore.getCollection('stock_ledger', tenantId) || [];

      // Negative Stock Enforcement
      for (const line of data.lines) {
        const reqQty = parseFloat(line.quantity) || 0;
        const srcBal = balanceList.find(b => b.itemCode === line.itemCode && b.locationCode === fromLoc && (!tenantId || b.tenantId === tenantId));
        const availQty = srcBal ? (parseFloat(srcBal.quantity) || 0) : 0;
        const masterItem = inventoryRepository.getByCode(line.itemCode, tenantId);
        const allowNeg = masterItem ? !!masterItem.allowNegativeStock : false;

        if (!allowNeg && availQty < reqQty) {
          return { success: false, error: `❌ Insufficient Stock for "${line.itemName || line.itemCode}" at ${fromLoc}. Available: ${availQty.toFixed(2)} ${line.baseUom || 'KG'}, Requested: ${reqQty.toFixed(2)} ${line.baseUom || 'KG'}.` };
        }
      }

      const count = existing.length + 1;
      const issNo = data.issueNo || `ISS-2026-${String(count).padStart(4, '0')}`;

      const issRecord = {
        id: 'iss-' + Math.random().toString(36).substring(2, 7),
        issueNo: issNo,
        postingId,
        tenantId,
        fromLocationCode: fromLoc,
        issuedToDepartment: data.issuedToDepartment || 'Kitchen',
        issuedToPerson: data.issuedToPerson || '',
        issueDate: data.issueDate || new Date().toISOString().split('T')[0],
        notes: data.notes || '',
        lines: data.lines || [],
        status: 'COMPLETED',
        postedBy: session ? session.employeeName : 'Inventory Manager',
        postedAt: new Date().toISOString()
      };

      issRecord.lines.forEach((line, idx) => {
        const qty = parseFloat(line.quantity) || 0;
        const uom = line.baseUom || 'KG';
        const masterItem = inventoryRepository.getByCode(line.itemCode, tenantId) || {};
        const unitCost = parseFloat(masterItem.unitValuation) || parseFloat(masterItem.lastPurchasePrice) || 0;
        const val = qty * unitCost;

        ledgerList.push({
          ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-ISSOUT-${idx + 1}`,
          tenantId,
          transactionType: 'ISSUE_OUT',
          postingId: `${postingId}-${idx}`,
          documentNo: issNo,
          itemCode: line.itemCode,
          locationCode: fromLoc,
          baseQuantity: -qty,
          baseUom: uom,
          unitCost,
          totalValuation: -val,
          postedBy: issRecord.postedBy,
          timestamp: new Date().toISOString()
        });

        let srcIdx = balanceList.findIndex(b => b.itemCode === line.itemCode && b.locationCode === fromLoc && (!tenantId || b.tenantId === tenantId));
        if (srcIdx !== -1) {
          balanceList[srcIdx].quantity = (parseFloat(balanceList[srcIdx].quantity) || 0) - qty;
          balanceList[srcIdx].valuation = Math.max(0, (parseFloat(balanceList[srcIdx].valuation) || 0) - val);
          balanceList[srcIdx].lastUpdatedAt = new Date().toISOString();
        }
      });

      offlineStore.setCollection('stock_ledger', ledgerList);
      offlineStore.setCollection('stock_balances', balanceList);
      offlineStore.appendItem('stock_issues', attachStandardMetadata(issRecord, tenantId, session));
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'stock_issues', { commandType: 'POST_STOCK_ISSUE', eventType: 'StockIssuePosted', ...issRecord }, session);
      logAudit(session ? session.employeeName : 'Admin', `Posted Stock Issue "${issNo}" to ${issRecord.issuedToDepartment} at ${fromLoc}`, tenantId);

      return { success: true, issue: issRecord, idempotentRetry: false };
    }
  }
  const stockIssueRepository = new StockIssueRepository();

  // ⚖️ Stock Adjustment Engine (Controlled Wastage & Spoilage)
  class StockAdjustmentRepository {
    getAll(tenantId = null) {
      return offlineStore.getCollection('stock_adjustments', tenantId) || [];
    }
    postAdjustment(data, session) {
      const tenantId = session ? session.tenantId : (data.tenantId || '');
      const postingId = data.postingId || ('post-adj-' + Math.random().toString(36).substring(2, 9));
      const existing = this.getAll(tenantId);
      const alreadyPosted = existing.find(a => a.postingId === postingId || (data.adjustmentNo && a.adjustmentNo === data.adjustmentNo));
      if (alreadyPosted) return { success: true, adjustment: alreadyPosted, idempotentRetry: true };

      const locCode = data.locationCode;
      const reason = data.reasonCode || 'SPOILAGE';
      const balanceList = offlineStore.getCollection('stock_balances', tenantId) || [];
      const ledgerList = offlineStore.getCollection('stock_ledger', tenantId) || [];

      const count = existing.length + 1;
      const adjNo = data.adjustmentNo || `ADJ-2026-${String(count).padStart(4, '0')}`;

      const adjRecord = {
        id: 'adj-' + Math.random().toString(36).substring(2, 7),
        adjustmentNo: adjNo,
        postingId,
        tenantId,
        locationCode: locCode,
        reasonCode: reason,
        adjustmentDate: data.adjustmentDate || new Date().toISOString().split('T')[0],
        notes: data.notes || '',
        lines: data.lines || [],
        status: 'COMPLETED',
        postedBy: session ? session.employeeName : 'Inventory Manager',
        postedAt: new Date().toISOString()
      };

      adjRecord.lines.forEach((line, idx) => {
        const qty = parseFloat(line.quantity) || 0;
        const isDecrease = line.adjustmentType === 'DECREASE';
        const netQty = isDecrease ? -qty : qty;
        const uom = line.baseUom || 'KG';
        const masterItem = inventoryRepository.getByCode(line.itemCode, tenantId) || {};
        const unitCost = parseFloat(masterItem.unitValuation) || parseFloat(masterItem.lastPurchasePrice) || 0;
        const val = netQty * unitCost;

        ledgerList.push({
          ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-ADJ-${idx + 1}`,
          tenantId,
          transactionType: isDecrease ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
          postingId: `${postingId}-${idx}`,
          documentNo: adjNo,
          itemCode: line.itemCode,
          locationCode: locCode,
          baseQuantity: netQty,
          baseUom: uom,
          unitCost,
          totalValuation: val,
          reasonCode: reason,
          postedBy: adjRecord.postedBy,
          timestamp: new Date().toISOString()
        });

        let balIdx = balanceList.findIndex(b => b.itemCode === line.itemCode && b.locationCode === locCode && (!tenantId || b.tenantId === tenantId));
        if (balIdx !== -1) {
          balanceList[balIdx].quantity = (parseFloat(balanceList[balIdx].quantity) || 0) + netQty;
          balanceList[balIdx].valuation = Math.max(0, (parseFloat(balanceList[balIdx].valuation) || 0) + val);
          balanceList[balIdx].lastUpdatedAt = new Date().toISOString();
        } else if (!isDecrease) {
          balanceList.push({
            id: 'bal-' + Math.random().toString(36).substring(2, 7),
            tenantId,
            itemCode: line.itemCode,
            locationCode: locCode,
            quantity: qty,
            baseUom: uom,
            valuation: val,
            lastUpdatedAt: new Date().toISOString()
          });
        }
      });

      offlineStore.setCollection('stock_ledger', ledgerList);
      offlineStore.setCollection('stock_balances', balanceList);
      offlineStore.appendItem('stock_adjustments', attachStandardMetadata(adjRecord, tenantId, session));
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'stock_adjustments', { commandType: 'POST_STOCK_ADJUSTMENT', eventType: 'StockAdjustmentPosted', ...adjRecord }, session);
      logAudit(session ? session.employeeName : 'Admin', `Posted Stock Adjustment "${adjNo}" (${reason}) at ${locCode}`, tenantId);

      return { success: true, adjustment: adjRecord, idempotentRetry: false };
    }
  }
  const stockAdjustmentRepository = new StockAdjustmentRepository();

  // 📋 Physical Stock Count & Reconciliation Engine
  class StockCountRepository {
    getAll(tenantId = null) {
      return offlineStore.getCollection('stock_counts', tenantId) || [];
    }
    reconcileCount(data, session) {
      const tenantId = session ? session.tenantId : (data.tenantId || '');
      const postingId = data.postingId || ('post-cnt-' + Math.random().toString(36).substring(2, 9));
      const existing = this.getAll(tenantId);
      const alreadyPosted = existing.find(c => c.postingId === postingId || (data.countNo && c.countNo === data.countNo && c.status === 'RECONCILED'));
      if (alreadyPosted) return { success: true, countRecord: alreadyPosted, idempotentRetry: true };

      const locCode = data.locationCode;
      const count = existing.length + 1;
      const cntNo = data.countNo || `CNT-2026-${String(count).padStart(4, '0')}`;

      const adjLines = [];
      data.lines.forEach(l => {
        const sysQty = parseFloat(l.systemQuantity) || 0;
        const physQty = parseFloat(l.physicalQuantity) || 0;
        const variance = physQty - sysQty;
        if (Math.abs(variance) > 0.001) {
          adjLines.push({
            itemCode: l.itemCode,
            itemName: l.itemName,
            adjustmentType: variance < 0 ? 'DECREASE' : 'INCREASE',
            quantity: Math.abs(variance),
            baseUom: l.baseUom || 'KG'
          });
        }
      });

      // Post Audit Adjustment for Non-Zero Variances
      let adjResult = null;
      if (adjLines.length > 0) {
        adjResult = stockAdjustmentRepository.postAdjustment({
          adjustmentNo: `ADJ-CNT-${cntNo}`,
          postingId: `post-adj-${postingId}`,
          locationCode: locCode,
          reasonCode: 'STOCK_AUDIT_CORRECTION',
          notes: `Stock count reconciliation variance for audit session ${cntNo}`,
          lines: adjLines
        }, session);
      }

      const countRecord = {
        id: 'cnt-' + Math.random().toString(36).substring(2, 7),
        countNo: cntNo,
        postingId,
        tenantId,
        locationCode: locCode,
        countDate: data.countDate || new Date().toISOString().split('T')[0],
        notes: data.notes || '',
        lines: data.lines || [],
        status: 'RECONCILED',
        reconciledBy: session ? session.employeeName : 'Inventory Manager',
        reconciledAt: new Date().toISOString()
      };

      offlineStore.appendItem('stock_counts', attachStandardMetadata(countRecord, tenantId, session));
      logAudit(session ? session.employeeName : 'Admin', `Reconciled Physical Stock Count "${cntNo}" at ${locCode}`, tenantId);

      return { success: true, countRecord, adjResult, idempotentRetry: false };
    }
  }
  const stockCountRepository = new StockCountRepository();

  class TableRepository {
    getAll(tenantId) {
      return offlineStore.getCollection('tables_master', tenantId) || [];
    }
    create(tableData, session) {
      let newTable = {
        id: 'tbl-' + Math.random().toString(36).substring(2, 7),
        status: 'ACTIVE',
        ...tableData
      };
      newTable = attachStandardMetadata(newTable, session.tenantId, session);

      offlineStore.appendItem('tables_master', newTable);
      offlineJournal.createSyncJob('UPLOAD_EVENT', session.tenantId, 'tables_master', { commandType: 'CREATE_TABLE_ASSET', eventType: 'TableAssetCreated', ...newTable }, session);
      logAudit(session.employeeName, `Created Dining Table Asset "${newTable.tableCode}"`, session.tenantId);
      return newTable;
    }
  }

  class StaffRepository {
    getAll(tenantId) {
      return offlineStore.getCollection('employees', tenantId) || [];
    }
    create(employeeData, session) {
      let newEmp = {
        id: 'emp-' + Math.random().toString(36).substring(2, 7),
        status: 'ACTIVE',
        ...employeeData
      };
      newEmp = attachStandardMetadata(newEmp, session.tenantId, session);

      offlineStore.appendItem('employees', newEmp);
      offlineJournal.createSyncJob('UPLOAD_EVENT', session.tenantId, 'employees', { commandType: 'CREATE_STAFF_ACCOUNT', eventType: 'StaffAccountCreated', ...newEmp }, session);
      logAudit(session.employeeName, `Created Staff Account "${newEmp.name}" (${newEmp.employeeCode})`, session.tenantId);
      return newEmp;
    }
  }

  class TenantRepository {
    getById(tenantId) {
      return (offlineStore.getCollection('tenants') || []).find(t => t.tenantId === tenantId) || null;
    }
    getAll() {
      return offlineStore.getCollection('tenants') || [];
    }
    updateSection(tenantId, sectionKey, patchObj, session) {
      const tenant = this.getById(tenantId);
      if (!tenant) return;
      tenant[sectionKey] = { ...tenant[sectionKey], ...patchObj };
      tenant.lastUpdatedAt = new Date().toISOString();
      tenant.version = (tenant.version || 1) + 1;
      tenant.modifiedBy = session ? session.employeeName : 'Admin';
      tenant.modifiedAt = new Date().toISOString();

      offlineStore.updateItem('tenants', 'tenantId', tenant.tenantId, tenant);
      offlineJournal.createSyncJob('UPDATE_TENANT_SECTION', tenantId, 'tenants', { sectionKey, patchObj, version: tenant.version }, session);
      logAudit(session ? session.employeeName : 'Admin', `Updated Business Profile Section: ${sectionKey}`, tenantId);
    }
  }

  class StorageLocationRepository {
    getAll(tenantId = null) {
      return offlineStore.getCollection('storage_locations', tenantId) || [];
    }

    getByCode(locationCode, tenantId = null) {
      return this.getAll(tenantId).find(l => l.locationCode === locationCode) || null;
    }

    getById(id, tenantId = null) {
      return this.getAll(tenantId).find(l => l.id === id || l.locationCode === id) || null;
    }

    create(data, session) {
      const tenantId = session ? session.tenantId : (data.tenantId || '');
      let parentPath = '';
      if (data.parentLocationCode) {
        const parent = this.getByCode(data.parentLocationCode, tenantId);
        if (parent) {
          parentPath = (parent.path || parent.locationCode) + ' / ';
        }
      }

      let newLoc = {
        id: 'loc-' + Math.random().toString(36).substring(2, 7),
        locationCode: data.locationCode || ('LOC-' + Math.floor(100 + Math.random() * 900)),
        locationName: data.locationName || 'Storage Area',
        shortName: data.shortName || '',
        locationType: data.locationType || 'Store',
        level: data.level || 'Store',
        parentLocationCode: data.parentLocationCode || '',
        path: parentPath + (data.shortName || data.locationCode || 'LOC'),
        status: data.status || 'ACTIVE',
        description: data.description || '',
        purposes: data.purposes || ['Raw Materials'],
        condition: data.condition || 'Ambient',
        tempMin: data.tempMin || null,
        tempMax: data.tempMax || null,
        permissions: data.permissions || { receive: true, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: true },
        responsibleWorkspace: data.responsibleWorkspace || 'inventory',
        responsibleManager: data.responsibleManager || 'Inventory Manager',
        restrictedAccess: !!data.restrictedAccess,
        foodStorage: data.foodStorage !== false,
        alcoholStorage: !!data.alcoholStorage,
        building: data.building || '',
        floor: data.floor || '',
        room: data.room || '',
        notes: data.notes || ''
      };

      newLoc = attachStandardMetadata(newLoc, tenantId, session);
      offlineStore.appendItem('storage_locations', newLoc);
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'storage_locations', { commandType: 'CREATE_STORAGE_LOCATION', eventType: 'StorageLocationCreated', ...newLoc }, session);
      logAudit(session ? session.employeeName : 'Admin', `Created Storage Location "${newLoc.locationName}" (${newLoc.locationCode})`, tenantId);
      return newLoc;
    }

    update(id, patch, session) {
      const tenantId = session ? session.tenantId : '';
      const list = offlineStore.getCollection('storage_locations') || [];
      const idx = list.findIndex(l => (l.id === id || l.locationCode === id) && (!tenantId || l.tenantId === tenantId));
      if (idx !== -1) {
        const updated = {
          ...list[idx],
          ...patch,
          modifiedBy: session ? session.employeeName : 'Admin',
          modifiedAt: new Date().toISOString(),
          version: (list[idx].version || 1) + 1
        };

        if (patch.parentLocationCode !== undefined) {
          let parentPath = '';
          if (patch.parentLocationCode) {
            const parent = list.find(l => l.locationCode === patch.parentLocationCode);
            if (parent) parentPath = (parent.path || parent.locationCode) + ' / ';
          }
          updated.path = parentPath + (updated.shortName || updated.locationCode);
        }

        list[idx] = updated;
        offlineStore.setCollection('storage_locations', list);
        offlineJournal.createSyncJob('UPDATE_LOCATION', tenantId, 'storage_locations', { id: updated.id, patch }, session);
        logAudit(session ? session.employeeName : 'Admin', `Updated Storage Location "${updated.locationName}" (${updated.locationCode})`, tenantId);
        return updated;
      }
      return null;
    }

    archive(id, session) {
      const tenantId = session ? session.tenantId : '';
      const loc = this.getById(id, tenantId);
      if (!loc) return { success: false, error: 'Location not found.' };

      const children = (offlineStore.getCollection('storage_locations', tenantId) || []).filter(l => l.parentLocationCode === loc.locationCode && l.status !== 'ARCHIVED');
      if (children.length > 0) {
        return {
          success: false,
          error: `❌ Cannot archive "${loc.locationName}". ${children.length} active child location(s) exist under it (${children.map(c => c.locationCode).join(', ')}). Reassign or archive child locations first.`
        };
      }

      const itemsWithStock = (offlineStore.getCollection('inventory', tenantId) || []).filter(i => (i.defaultLocationId === loc.id || i.locationCode === loc.locationCode) && i.status !== 'ARCHIVED');
      if (itemsWithStock.length > 0) {
        return {
          success: false,
          error: `❌ Cannot archive "${loc.locationName}". ${itemsWithStock.length} inventory item(s) are assigned to this location. Reassign stock items first.`
        };
      }

      this.update(loc.id, { status: 'ARCHIVED' }, session);
      logAudit(session ? session.employeeName : 'Admin', `Archived Storage Location "${loc.locationName}" (${loc.locationCode})`, tenantId);
      return { success: true };
    }

    clearAll(session = null) {
      offlineStore.setCollection('storage_locations', []);
      logAudit(session ? session.employeeName : 'Admin', 'Cleared all storage locations from local storage', session ? session.tenantId : null);
    }

    initDefaultLocations(tenantId) {
      const defaultList = [
        {
          id: 'loc-1-' + tenantId,
          tenantId,
          locationCode: 'LOC-MWH',
          locationName: 'Main Warehouse',
          shortName: 'MWH',
          locationType: 'Warehouse',
          level: 'Warehouse',
          parentLocationCode: '',
          path: 'MWH',
          status: 'ACTIVE',
          description: 'Central receiving warehouse for all raw materials & packaging.',
          purposes: ['Raw Materials', 'Packaging', 'Consumables'],
          condition: 'Ambient',
          tempMin: 18,
          tempMax: 30,
          permissions: { receive: true, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: true },
          responsibleWorkspace: 'inventory',
          responsibleManager: 'Inventory Manager',
          restrictedAccess: false,
          foodStorage: true,
          alcoholStorage: false,
          building: 'Main Restaurant',
          floor: 'Ground Floor',
          room: 'Back of House 01',
          notes: 'Central receiving bay.'
        },
        {
          id: 'loc-2-' + tenantId,
          tenantId,
          locationCode: 'LOC-DRY',
          locationName: 'Dry Store',
          shortName: 'DRY',
          locationType: 'Store',
          level: 'Store',
          parentLocationCode: 'LOC-MWH',
          path: 'MWH / DRY',
          status: 'ACTIVE',
          description: 'Dry food items, spices, pulses, rice & flour storage.',
          purposes: ['Raw Materials'],
          condition: 'Ambient',
          tempMin: 20,
          tempMax: 28,
          permissions: { receive: true, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: true },
          responsibleWorkspace: 'inventory',
          responsibleManager: 'Inventory Manager',
          restrictedAccess: false,
          foodStorage: true,
          alcoholStorage: false,
          notes: 'Keep elevated on pallets.'
        },
        {
          id: 'loc-3-' + tenantId,
          tenantId,
          locationCode: 'LOC-CHILL',
          locationName: 'Walk-in Chiller',
          shortName: 'CHILL',
          locationType: 'Chiller',
          level: 'Store',
          parentLocationCode: 'LOC-MWH',
          path: 'MWH / CHILL',
          status: 'ACTIVE',
          description: 'Cold storage for dairy, vegetables, poultry & meat.',
          purposes: ['Raw Materials', 'Semi-Finished'],
          condition: 'Chilled',
          tempMin: 0,
          tempMax: 5,
          permissions: { receive: true, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: true },
          responsibleWorkspace: 'inventory',
          responsibleManager: 'Inventory Manager',
          restrictedAccess: true,
          foodStorage: true,
          alcoholStorage: false,
          notes: 'Temperature log checked twice daily.'
        },
        {
          id: 'loc-4-' + tenantId,
          tenantId,
          locationCode: 'LOC-FREEZE',
          locationName: 'Deep Freezer',
          shortName: 'FREEZE',
          locationType: 'Freezer',
          level: 'Store',
          parentLocationCode: 'LOC-MWH',
          path: 'MWH / FREEZE',
          status: 'ACTIVE',
          description: 'Deep freezing for seafood, frozen meat, ice cream.',
          purposes: ['Raw Materials'],
          condition: 'Frozen',
          tempMin: -24,
          tempMax: -18,
          permissions: { receive: true, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: true },
          responsibleWorkspace: 'inventory',
          responsibleManager: 'Inventory Manager',
          restrictedAccess: true,
          foodStorage: true,
          alcoholStorage: false,
          notes: 'Commercial deep freezer.'
        },
        {
          id: 'loc-5-' + tenantId,
          tenantId,
          locationCode: 'LOC-KITCHEN',
          locationName: 'Kitchen Store',
          shortName: 'KITCHEN',
          locationType: 'Kitchen Store',
          level: 'Store',
          parentLocationCode: 'LOC-MWH',
          path: 'MWH / KITCHEN',
          status: 'ACTIVE',
          description: 'Day-store located inside main kitchen line.',
          purposes: ['Raw Materials', 'Semi-Finished'],
          condition: 'Ambient',
          tempMin: null,
          tempMax: null,
          permissions: { receive: false, transferIn: true, transferOut: true, issue: true, production: true, count: true, adjustment: false },
          responsibleWorkspace: 'kitchen',
          responsibleManager: 'Head Chef',
          restrictedAccess: false,
          foodStorage: true,
          alcoholStorage: false,
          notes: 'Daily line consumption store.'
        },
        {
          id: 'loc-6-' + tenantId,
          tenantId,
          locationCode: 'LOC-BAR',
          locationName: 'Bar Store',
          shortName: 'BAR',
          locationType: 'Bar Store',
          level: 'Store',
          parentLocationCode: 'LOC-MWH',
          path: 'MWH / BAR',
          status: 'ACTIVE',
          description: 'Liquor, wine, beer, beverage & cocktail mixer storage.',
          purposes: ['Beverages'],
          condition: 'Ambient',
          tempMin: null,
          tempMax: null,
          permissions: { receive: false, transferIn: true, transferOut: true, issue: true, production: false, count: true, adjustment: false },
          responsibleWorkspace: 'bar',
          responsibleManager: 'Bar Manager',
          restrictedAccess: true,
          foodStorage: false,
          alcoholStorage: true,
          notes: 'Access restricted to Bar Manager.'
        }
      ];

      defaultList.forEach(item => {
        offlineStore.appendItem('storage_locations', item);
        offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'storage_locations', { commandType: 'CREATE_STORAGE_LOCATION', eventType: 'StorageLocationCreated', ...item }, { employeeName: 'System Pre-seed', tenantId });
      });
      return defaultList;
    }
  }

  class UomRepository {
    getAll() {
      let list = offlineStore.getCollection('inventory_uoms') || [];
      const canonicalList = Object.values(UOM_REGISTRY).map(u => ({
        id: 'uom-' + u.code.toLowerCase(),
        tenantId: '',
        uomCode: u.code,
        uomName: u.name,
        uomFamily: u.family,
        isBaseUnit: !!u.isBase,
        conversionFactor: u.baseRatio || 1,
        icon: u.icon,
        status: 'ACTIVE'
      }));

      if (!list || list.length === 0) {
        offlineStore.setCollection('inventory_uoms', canonicalList);
        return canonicalList;
      }

      const existingCodes = new Set(list.map(u => u.uomCode || u.code));
      let updated = false;
      canonicalList.forEach(cu => {
        if (!existingCodes.has(cu.uomCode)) {
          list.push(cu);
          updated = true;
        }
      });
      if (updated) {
        offlineStore.setCollection('inventory_uoms', list);
      }

      return list;
    }

    getByCode(code) {
      return this.getAll().find(u => u.uomCode === code || u.code === code) || null;
    }

    initCanonicalUoms() {
      const canonicalList = Object.values(UOM_REGISTRY).map(u => ({
        id: 'uom-' + u.code.toLowerCase(),
        tenantId: '',
        uomCode: u.code,
        uomName: u.name,
        uomFamily: u.family,
        isBaseUnit: !!u.isBase,
        conversionFactor: u.baseRatio || 1,
        icon: u.icon,
        status: 'ACTIVE'
      }));

      offlineStore.setCollection('inventory_uoms', canonicalList);
      canonicalList.forEach(item => {
        offlineJournal.createSyncJob('UPLOAD_EVENT', '', 'inventory_uoms', { commandType: 'PRESEED_UOM', eventType: 'UomPreseeded', ...item }, { employeeName: 'System Pre-seed', tenantId: '' });
      });

      return canonicalList;
    }
  }

  class CategoryRepository {
    getAll(tenantId = null) {
      let list = offlineStore.getCollection('inventory_categories', tenantId) || [];
      if (!list || list.length === 0) {
        list = offlineStore.getCollection('inventory_categories') || [];
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
      return this.getAll(tenantId).find(c => c.id === id || c.categoryCode === id) || null;
    }

    create(data, session) {
      const tenantId = session ? session.tenantId : (data.tenantId || '');
      const familyObj = PRODUCT_FAMILIES_REGISTRY[data.productFamilyCode] || PRODUCT_FAMILIES_REGISTRY['FAM-PRODUCE'];

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

      newCat = attachStandardMetadata(newCat, tenantId, session);
      offlineStore.appendItem('inventory_categories', newCat);
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'inventory_categories', { commandType: 'CREATE_CATEGORY', eventType: 'CategoryCreated', ...newCat }, session);
      logAudit(session ? session.employeeName : 'Admin', `Created Category "${newCat.categoryName}" (${newCat.categoryCode}) under ${newCat.productFamilyName}`, tenantId);
      return newCat;
    }

    update(id, patch, session) {
      const tenantId = session ? session.tenantId : '';
      const list = offlineStore.getCollection('inventory_categories') || [];
      const idx = list.findIndex(c => (c.id === id || c.categoryCode === id) && (!tenantId || c.tenantId === tenantId));
      if (idx !== -1) {
        if (patch.productFamilyCode && PRODUCT_FAMILIES_REGISTRY[patch.productFamilyCode]) {
          patch.productFamilyName = PRODUCT_FAMILIES_REGISTRY[patch.productFamilyCode].name;
        }
        const updated = {
          ...list[idx],
          ...patch,
          modifiedBy: session ? session.employeeName : 'Admin',
          modifiedAt: new Date().toISOString(),
          version: (list[idx].version || 1) + 1
        };
        list[idx] = updated;
        offlineStore.setCollection('inventory_categories', list);
        offlineJournal.createSyncJob('UPDATE_CATEGORY', tenantId, 'inventory_categories', { id: updated.id, patch }, session);
        logAudit(session ? session.employeeName : 'Admin', `Updated Category "${updated.categoryName}" (${updated.categoryCode})`, tenantId);
        return updated;
      }
      return null;
    }

    archive(id, session) {
      const tenantId = session ? session.tenantId : '';
      const cat = this.getById(id, tenantId);
      if (!cat) return { success: false, error: 'Category not found.' };

      // Multi-Entity Dependency Check: Active Inventory Items
      const matchingItems = (offlineStore.getCollection('inventory', tenantId) || []).filter(i => (i.categoryCode === cat.categoryCode || i.categoryId === cat.id) && i.status !== 'ARCHIVED');

      // Multi-Entity Dependency Check: Active Recipe Ingredients
      const matchingRecipes = (offlineStore.getCollection('recipes', tenantId) || []).filter(r => (r.categoryCode === cat.categoryCode) && r.status !== 'ARCHIVED');

      if (matchingItems.length > 0 || matchingRecipes.length > 0) {
        return {
          success: false,
          error: `❌ Cannot archive "${cat.categoryName}". This category is currently referenced by:\n• ${matchingItems.length} Active Inventory Item(s)\n• ${matchingRecipes.length} Recipe Ingredient(s)\n\nPlease reclassify or archive these items before archiving this category.`
        };
      }

      this.update(cat.id, { status: 'ARCHIVED' }, session);
      logAudit(session ? session.employeeName : 'Admin', `Archived Category "${cat.categoryName}" (${cat.categoryCode})`, tenantId);
      return { success: true };
    }

    initDefaultCategories(tenantId = 'ros-tenant-master') {
      const tid = tenantId || 'ros-tenant-master';
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

      const existing = offlineStore.getCollection('inventory_categories') || [];
      const merged = [...existing, ...defaultList];
      offlineStore.setCollection('inventory_categories', merged);

      return defaultList;
    }
  }

  const inventoryRepository = new InventoryRepository();
  const supplierRepository = new SupplierRepository();
  const storageLocationRepository = new StorageLocationRepository();
  const categoryRepository = new CategoryRepository();
  const uomRepository = new UomRepository();
  const tableRepository = new TableRepository();
  const staffRepository = new StaffRepository();
  const tenantRepository = new TenantRepository();

  // Legacy Tenant Model facade
  class TenantModel {
    getTenantById(tenantId) { return tenantRepository.getById(tenantId); }
    getPrimaryTenant() { return (offlineStore.getCollection('tenants') || [])[0] || null; }
    getAllTenants() { return tenantRepository.getAll(); }
    async createTenant({ name, currency = 'INR', timezone = 'Asia/Kolkata', adminName = 'Admin User', adminPin = '999999' }) {
      const cleanPin = String(adminPin).trim();
      const tenantId = 'tenant_' + Math.random().toString(36).substring(2, 9);
      const adminIdentityId = 'id-admin-' + Math.random().toString(36).substring(2, 7);
      const adminEmpId = 'emp-admin-' + Math.random().toString(36).substring(2, 7);
      const pinHash = await hashPin(cleanPin);

      offlineStore.appendItem('identities', { id: adminIdentityId, pinHash, tenantId, status: 'ACTIVE' });
      offlineStore.appendItem('employees', {
        id: adminEmpId,
        identityId: adminIdentityId,
        tenantId,
        employeeCode: 'EMP-00001',
        name: adminName,
        roleId: 'role-admin',
        workspaceDefault: 'admin',
        status: 'ACTIVE',
        timeline: [{ time: new Date().toISOString(), actor: 'Super Admin', action: `Created Admin Account for ${name}` }]
      });

      const baseUoms = [
        { id: 'uom-1-' + tenantId, tenantId, uomCode: 'KG', uomName: 'Kilogram', uomFamily: 'Weight', isBaseUnit: true, conversionFactor: 1 },
        { id: 'uom-2-' + tenantId, tenantId, uomCode: 'G', uomName: 'Gram', uomFamily: 'Weight', isBaseUnit: false, conversionFactor: 1000 },
        { id: 'uom-3-' + tenantId, tenantId, uomCode: 'LTR', uomName: 'Liter', uomFamily: 'Volume', isBaseUnit: true, conversionFactor: 1 },
        { id: 'uom-4-' + tenantId, tenantId, uomCode: 'ML', uomName: 'Milliliter', uomFamily: 'Volume', isBaseUnit: false, conversionFactor: 1000 },
        { id: 'uom-5-' + tenantId, tenantId, uomCode: 'PCS', uomName: 'Pieces', uomFamily: 'Count', isBaseUnit: true, conversionFactor: 1 },
        { id: 'uom-6-' + tenantId, tenantId, uomCode: 'DOZEN', uomName: 'Dozen', uomFamily: 'Count', isBaseUnit: false, conversionFactor: 12 }
      ];
      baseUoms.forEach(u => offlineStore.appendItem('inventory_uoms', u));

      offlineStore.appendItem('storage_locations', {
        id: 'loc-1-' + tenantId,
        tenantId,
        locationCode: 'LOC-MWH',
        locationName: 'Main Warehouse',
        parentLocationCode: '',
        storageType: 'Dry'
      });

      const newTenant = {
        tenantId,
        name,
        legalName: name + ' Hospitality Pvt Ltd',
        adminName,
        adminPin: cleanPin,
        profileVersion: 1,
        lastUpdatedBy: adminName,
        lastUpdatedAt: new Date().toISOString(),
        isSetupComplete: false,
        isOperationsStarted: false,
        identity: { name, legalName: name + ' Hospitality Pvt Ltd', shortDesc: 'Restaurant Tenant' },
        contact: { primaryPhone: '', secondaryPhone: '', email: '', website: '', whatsapp: '', emergencyContact: '' },
        address: { line1: '', line2: '', city: '', state: '', pinCode: '', country: 'India' },
        compliance: { isGstRegistered: true, gstin: '', pan: '', fssai: '', tradeLicence: '', fireNoc: '', liquorLicence: '', notes: '' },
        regional: { currency, currencySymbol: currency === 'INR' ? '₹' : '$', timezone, dateFormat: 'DD/MM/YYYY', timeFormat: '12 Hour', language: 'English' },
        branding: { logo: '', receiptLogo: '', favicon: '', primaryColor: '#10b981', accentColor: '#3b82f6' },
        businessPreferences: { restaurantType: 'Casual Dining', isVeg: false, isAlcoholServed: true, hasSmokingArea: false, isPetFriendly: true, hasOutdoorSeating: true },
        billingDefaults: { defaultTaxProfile: '5% GST', serviceChargeEnabled: true, serviceChargePercent: 5, roundBills: true, roundMethod: 'Nearest Integer', priceMode: 'Tax Exclusive' },
        receiptDefaults: { header: 'Welcome to ' + name, footer: '', thankYouMessage: 'Thank you!', receiptWidth: '80mm', showGst: true, showWaiter: true, showTable: true, showQr: true, showLogo: true }
      };

      offlineStore.appendItem('tenants', newTenant);
      offlineJournal.createSyncJob('CREATE_RESTAURANT_TENANT', tenantId, 'tenants', newTenant, { employeeName: 'Super Admin', employeeId: 'emp-superadmin' });
      logAudit(adminName, `Created Restaurant Tenant "${name}"`, tenantId);
      return newTenant;
    }
    async deleteTenant(tenantId) {
      // 1. Remove from all local collections
      const wipeCollection = (key, idProp = 'tenantId') => {
        const list = offlineStore.getCollection(key) || [];
        const updated = list.filter(item => item[idProp] !== tenantId && item.tenantId !== tenantId);
        offlineStore.setCollection(key, updated);
      };

      wipeCollection('tenants', 'tenantId');
      wipeCollection('employees', 'tenantId');
      wipeCollection('identities', 'tenantId');
      wipeCollection('dining_areas', 'tenantId');
      wipeCollection('tables_master', 'tenantId');
      wipeCollection('suppliers', 'tenantId');
      wipeCollection('inventory', 'tenantId');
      wipeCollection('inventory_categories', 'tenantId');
      wipeCollection('inventory_uoms', 'tenantId');
      wipeCollection('storage_locations', 'tenantId');
      wipeCollection('inventory_requests', 'tenantId');

      logAudit('Super Admin', `Deleted Restaurant Tenant ${tenantId}`, tenantId);

      // 2. Cascade Delete in Supabase REST API
      const tablesToWipe = ['tenants', 'employees', 'identities', 'dining_areas', 'tables_master', 'suppliers', 'inventory', 'audit_logs', 'offline_journal'];
      for (const tbl of tablesToWipe) {
        await supabaseClient.deleteRecords(tbl, `tenant_id=eq.${tenantId}`);
      }
    }
    updateSection(tenantId, sectionKey, patchObj) {
      const session = authEngine.getCurrentSession();
      tenantRepository.updateSection(tenantId, sectionKey, patchObj, session);
    }
  }
  const tenantModel = new TenantModel();

  // Auth Engine
  class AuthEngine {
    getCurrentSession() {
      try {
        const raw = sessionStorage.getItem('ros_session');
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    async authenticate(pinStr) {
      const cleanPin = String(pinStr).trim();
      const pinHash = await hashPin(cleanPin);
      const ids = offlineStore.getCollection('identities') || [];
      const emps = offlineStore.getCollection('employees') || [];
      const tenants = offlineStore.getCollection('tenants') || [];

      let identity = null;
      let emp = null;

      // 1. Super Admin PIN (888888)
      if (cleanPin === '888888') {
        emp = emps.find(e => e.roleId === 'role-superadmin') || {
          id: 'emp-superadmin',
          identityId: 'id-superadmin',
          tenantId: '',
          employeeCode: 'EMP-00001',
          name: 'Super Admin',
          roleId: 'role-superadmin',
          workspaceDefault: 'superadmin',
          status: 'ACTIVE'
        };
        identity = { id: emp.identityId, status: 'ACTIVE' };
      }

      // 2. Check if a Tenant Admin matches this PIN
      if (!emp) {
        const matchingTenant = tenants.find(t => String(t.adminPin).trim() === cleanPin);
        if (matchingTenant) {
          emp = emps.find(e => e.tenantId === matchingTenant.tenantId && e.roleId === 'role-admin');
          if (!emp) {
            emp = {
              id: 'emp-admin-' + matchingTenant.tenantId,
              identityId: 'id-admin-' + matchingTenant.tenantId,
              tenantId: matchingTenant.tenantId,
              employeeCode: 'EMP-00001',
              name: matchingTenant.adminName || 'Restaurant Admin',
              roleId: 'role-admin',
              workspaceDefault: 'admin',
              status: 'ACTIVE'
            };
            offlineStore.appendItem('employees', emp);
          }
          identity = { id: emp.identityId, status: 'ACTIVE' };
        }
      }

      // 3. Check Identity & Employee hash match
      if (!identity || !emp) {
        identity = ids.find(i => i.pinHash === pinHash);
        if (identity) {
          emp = emps.find(e => e.identityId === identity.id);
        }
      }

      // 4. Check Employees collection directly by pinDisplay, pin, or pinHash
      if (!emp) {
        emp = emps.find(e =>
          (e.pinDisplay && String(e.pinDisplay).trim() === cleanPin) ||
          (e.pin && String(e.pin).trim() === cleanPin) ||
          (e.pinHash && e.pinHash === pinHash)
        );
        if (emp) {
          identity = ids.find(i => i.id === emp.identityId) || { id: emp.identityId || ('id-' + emp.id), status: 'ACTIVE' };
          if (!ids.some(i => i.id === identity.id)) {
            offlineStore.appendItem('identities', { id: identity.id, pinHash, tenantId: emp.tenantId, status: 'ACTIVE' });
          }
        }
      }

      if (!identity || !emp) return { success: false, error: 'Invalid PIN. Access denied.' };
      if (identity.status === 'SUSPENDED') return { success: false, error: '❌ Account is SUSPENDED. Contact Manager.' };
      if (emp.status === 'SUSPENDED') return { success: false, error: '❌ Employee account is SUSPENDED.' };

      const roles = offlineStore.getCollection('roles') || [];
      const role = roles.find(r => r.id === emp.roleId) || (typeof ROLE_TEMPLATES !== 'undefined' && ROLE_TEMPLATES[emp.roleId]) || (typeof ROLE_TEMPLATES !== 'undefined' && ROLE_TEMPLATES['role-admin']);
      const targetTenantId = emp.tenantId || (tenants[0] ? tenants[0].tenantId : '');
      const targetTenant = tenants.find(t => t.tenantId === targetTenantId) || tenants[0] || null;

      const session = {
        tenantId: emp.roleId === 'role-superadmin' ? '' : targetTenantId,
        tenantName: emp.roleId === 'role-superadmin' ? 'System Control (Super Admin)' : (targetTenant ? targetTenant.name : 'Anchor Restaurant'),
        employeeId: emp.id,
        employeeCode: emp.employeeCode || 'EMP-00001',
        employeeName: emp.name,
        roleId: emp.roleId,
        roleName: emp.roleId === 'role-superadmin' ? 'Super Admin' : (role ? role.name : 'Staff'),
        workspace: emp.roleId === 'role-superadmin' ? 'superadmin' : (emp.workspaceDefault || (role ? role.defaultWorkspace : 'admin')),
        loginTime: new Date().toISOString()
      };
      sessionStorage.setItem('ros_session', JSON.stringify(session));
      logAudit(emp.name, `Logged in under workspace: ${session.workspace}`, targetTenantId);
      return { success: true, session };
    }

    logout() {
      const s = this.getCurrentSession();
      if (s) logAudit(s.employeeName, 'Logged out', s.tenantId);
      sessionStorage.removeItem('ros_session');
      window.location.hash = '';
    }
  }
  const authEngine = new AuthEngine();

  // Commissioning Engine
  class CommissioningEngine {
    evaluateReadiness(tenantId) {
      const areas = offlineStore.getCollection('dining_areas', tenantId) || [];
      const tables = tableRepository.getAll(tenantId);
      const emps = staffRepository.getAll(tenantId);
      const inv = inventoryRepository.getAll(tenantId);

      const activeAreas = areas.filter(a => a.status !== 'ARCHIVED');
      const activeTables = tables.filter(t => t.status !== 'ARCHIVED');
      const activeStaff = emps.filter(e => e.status === 'ACTIVE');

      const card1Done = true;
      const card2Done = activeAreas.length > 0;
      const card3Done = activeTables.length > 0;
      const card4Done = activeStaff.length > 0;

      const completed = [card1Done, card2Done, card3Done, card4Done].filter(Boolean).length;
      return {
        infraCompleted: completed,
        infraTotal: 4,
        infraCards: [
          { id: 'c1', title: 'Card 1 — Business Profile', status: 'COMPLETE', route: 'card1-full' },
          { id: 'c2', title: 'Card 2 — Dining Areas', status: card2Done ? 'COMPLETE' : 'INCOMPLETE', route: 'config-areas' },
          { id: 'c3', title: 'Card 3 — Dining Tables & Assets', status: card3Done ? 'COMPLETE' : 'INCOMPLETE', route: 'config-tables' },
          { id: 'c4', title: 'Card 4 — Staff & Access', status: card4Done ? 'COMPLETE' : 'INCOMPLETE', route: 'config-users' }
        ],
        activeStaffCount: activeStaff.length,
        masterItemsCount: inv.length,
        isReadyForService: completed === 4 && activeStaff.length >= 1
      };
    }
  }
  const commissioningEngine = new CommissioningEngine();

  // PinPadView
  class PinPadView {
    constructor({ onSuccess }) { this.onSuccess = onSuccess; this.currentPin = ''; }
    render() {
      const el = document.createElement('div');
      el.className = 'pin-pad-container animate-fade-in';
      this.container = el;
      this.update();
      return el;
    }
    update() {
      const dots = Array.from({ length: 6 }).map((_, i) => `<div class="pin-dot ${i < this.currentPin.length ? 'filled' : ''}"></div>`).join('');
      this.container.innerHTML = `
        <div style="text-align:center;">
          <h2 style="font-size:1.5rem;">Anchor RestaurantOS v1.0</h2>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-top:4px; line-height:1.4;">
            Enter your 6-digit Employee Security PIN to login (SuperAdmin PIN: <code>888888</code>)
          </p>
        </div>
        <div class="pin-display-dots">${dots}</div>
        <div class="pin-grid">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="keypad-btn" data-v="${n}">${n}</button>`).join('')}
          <button class="keypad-btn" data-a="clear" style="color:var(--status-danger);">C</button>
          <button class="keypad-btn" data-v="0">0</button>
          <button class="keypad-btn" data-a="back">⌫</button>
        </div>
      `;
      this.container.querySelectorAll('.keypad-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const v = btn.dataset.v; const a = btn.dataset.a;
          if (v && this.currentPin.length < 6) {
            this.currentPin += v;
            this.update();
            if (this.currentPin.length === 6) {
              const res = await authEngine.authenticate(this.currentPin);
              if (res.success && this.onSuccess) {
                const targetRoute = res.session.workspace || 'admin';
                window.location.hash = '#/' + targetRoute;
                this.onSuccess(res.session);
              } else { alert(res.error || 'Invalid PIN.'); this.currentPin = ''; this.update(); }
            }
          } else if (a === 'clear') { this.currentPin = ''; this.update(); }
          else if (a === 'back') { this.currentPin = this.currentPin.slice(0, -1); this.update(); }
        });
      });
    }
  }

  // Application Shell Router
  class ApplicationShell {
    constructor() {
      this.activeRoute = 'admin';
      this.activeSubView = 'dashboard';
      this.inventoryActiveTab = 'inv-dashboard';
      this.inventoryCategoryFilter = 'ALL';
      this.inventoryTypeFilter = 'ALL';
      this.inventorySearchQuery = '';
      this.liveInventorySearchQuery = '';
      this.liveInventoryLocationFilter = 'ALL';
      this.liveInventoryCategoryFilter = 'ALL';
      this.liveInventoryStatusFilter = 'ALL';
      this.liveInventorySort = 'VALUE_DESC';
      this.configGroupOpen = true;
      this.bindSyncBadgeListener();
      this.bindHashRouter();
    }

    bindSyncBadgeListener() {
      window.addEventListener('ros_sync_updated', () => {
        this.updateSyncBadgeUI();
      });
    }

    bindHashRouter() {
      window.addEventListener('hashchange', () => {
        this.processCurrentRoute();
      });
    }

    getRoleDefaultRoute(roleId, workspace) {
      if (roleId === 'role-superadmin') return 'superadmin';
      if (roleId === 'role-admin') return 'admin';
      if (roleId === 'role-inventory') return 'inventory';
      if (roleId === 'role-waiter') return 'waiter';
      if (roleId === 'role-chef') return 'kitchen';
      if (roleId === 'role-bar' || roleId === 'role-bartender') return 'bar';
      if (roleId === 'role-cashier') return 'cashier';
      return workspace || 'admin';
    }

    isRouteAuthorized(roleId, route) {
      if (roleId === 'role-superadmin') return true;
      if (roleId === 'role-admin') return route !== 'superadmin';
      if (roleId === 'role-inventory') return route === 'inventory';
      if (roleId === 'role-waiter') return route === 'waiter';
      if (roleId === 'role-chef') return route === 'kitchen';
      if (roleId === 'role-bar' || roleId === 'role-bartender') return route === 'bar';
      if (roleId === 'role-cashier') return route === 'cashier';
      return route === this.getRoleDefaultRoute(roleId);
    }

    processCurrentRoute() {
      const session = authEngine.getCurrentSession();
      if (!session) {
        this.render();
        return;
      }

      const defaultRoute = this.getRoleDefaultRoute(session.roleId, session.workspace);
      const rawHash = window.location.hash.replace(/^#\/?/, '').trim();

      if (!rawHash) {
        window.location.hash = '#/' + defaultRoute;
        return;
      }

      const parts = rawHash.split('/');
      let reqRoute = parts[0] || defaultRoute;
      let reqSubView = parts[1] || (reqRoute === 'admin' ? 'dashboard' : (reqRoute === 'inventory' ? 'inv-dashboard' : reqRoute));

      if (reqRoute === 'dashboard') reqRoute = defaultRoute;

      if (!this.isRouteAuthorized(session.roleId, reqRoute)) {
        alert(`⛔ Access Denied: Your account role (${session.roleName}) is not authorized to access '/${reqRoute}'. Redirecting to your assigned workspace.`);
        window.location.hash = '#/' + defaultRoute;
        return;
      }

      this.activeRoute = reqRoute;
      this.activeSubView = reqSubView;
      this.render();
    }

    navigateToSubView(subView) {
      const currentRoute = this.activeRoute || 'inventory';
      window.location.hash = '#/' + currentRoute + '/' + subView;
    }

    executeSavePo(status) {
      const session = authEngine.getCurrentSession();
      const supSel = document.querySelector('#inp-po-supplier');
      const selectedSupCode = supSel ? supSel.value : 'SUP-001';

      const allSuppliers = supplierRepository.getAll(session ? session.tenantId : null);
      const matchedSup = allSuppliers.find(s =>
        s.supplierCode === selectedSupCode ||
        s.id === selectedSupCode ||
        s.supplierName === selectedSupCode
      );

      const supplierCode = matchedSup ? (matchedSup.supplierCode || matchedSup.id) : selectedSupCode;
      const supplierName = matchedSup ? matchedSup.supplierName : selectedSupCode;

      const locSel = document.querySelector('#inp-po-location');
      const destinationLocationCode = locSel && locSel.value ? locSel.value : 'LOC-CHILL';

      const dateInp = document.querySelector('#inp-po-date');
      const orderDate = dateInp && dateInp.value ? dateInp.value : new Date().toISOString().split('T')[0];

      const delInp = document.querySelector('#inp-po-del-date');
      const expectedDeliveryDate = delInp && delInp.value ? delInp.value : new Date(Date.now() + 172800000).toISOString().split('T')[0];

      const termsInp = document.querySelector('#inp-po-terms');
      const paymentTerms = termsInp && termsInp.value ? termsInp.value : 'Net 30 Days';

      if (!this.poDraftLines || !this.poDraftLines.length) {
        alert('❌ Please add at least 1 item line to the Purchase Order before saving.');
        return;
      }

      let subtotal = 0;
      this.poDraftLines.forEach(l => subtotal += (parseFloat(l.orderedQuantity) * parseFloat(l.purchaseUnitPrice)));

      const po = purchaseOrderRepository.create({
        supplierCode,
        supplierName,
        destinationLocationCode,
        orderDate,
        expectedDeliveryDate,
        paymentTerms,
        items: this.poDraftLines,
        subtotal,
        grandTotal: subtotal,
        status
      }, session);

      alert(`🎉 Purchase Order ${po.poNumber} created successfully with status: ${status}!`);
      this.poDraftLines = [];
      this.navigateToSubView('inv-po');
    }

    bindGlobalDelegatedEvents() {
      if (this._globalDelegatedBound) return;
      this._globalDelegatedBound = true;

      document.addEventListener('change', (e) => {
        if (!e.target) return;

        // 1. Supplier change on PO form
        if (e.target.id === 'inp-po-supplier') {
          const supSel = e.target;
          const selectedSupCode = supSel.value;
          const itemSel = document.querySelector('#inp-po-line-item');
          const priceInp = document.querySelector('#inp-po-line-price');
          const filterStatusEl = document.querySelector('#po-supplier-filter-status');
          if (!itemSel) return;

          const session = authEngine.getCurrentSession();
          const allItems = inventoryRepository.getAll(session ? session.tenantId : null);
          const allSuppliers = supplierRepository.getAll(session ? session.tenantId : null);

          // Find supplier object by code, id, or name
          const matchedSup = allSuppliers.find(s =>
            s.supplierCode === selectedSupCode ||
            s.id === selectedSupCode ||
            s.supplierName === selectedSupCode
          );

          const supCodeToMatch = matchedSup ? (matchedSup.supplierCode || matchedSup.id || matchedSup.supplierName) : selectedSupCode;
          const supNameToMatch = matchedSup ? matchedSup.supplierName : selectedSupCode;

          // Filter items mapped to selected supplier matching code, name, or ID
          let mapped = allItems.filter(i => {
            const pref = String(i.preferredSupplierCode || '').toLowerCase().trim();
            const def = String(i.defaultSupplierCode || '').toLowerCase().trim();
            const targetCode = String(supCodeToMatch || '').toLowerCase().trim();
            const targetName = String(supNameToMatch || '').toLowerCase().trim();
            const targetVal = String(selectedSupCode || '').toLowerCase().trim();

            return (targetCode && (pref === targetCode || def === targetCode)) ||
              (targetName && (pref === targetName || def === targetName)) ||
              (targetVal && (pref === targetVal || def === targetVal));
          });

          const isFiltered = mapped.length > 0;
          const displayItems = isFiltered ? mapped : allItems;

          itemSel.innerHTML = displayItems.map(i => `
            <option value="${i.itemCode}">
              ${i.itemName} (${i.itemCode}) — ₹${(parseFloat(i.lastPurchasePrice) || 0).toFixed(2)} / ${i.purchaseUom || i.baseUom || 'KG'}
            </option>
          `).join('');

          if (displayItems.length > 0) {
            itemSel.value = displayItems[0].itemCode;
            if (priceInp) priceInp.value = (parseFloat(displayItems[0].lastPurchasePrice) || 0).toFixed(2);
          }

          if (filterStatusEl) {
            if (isFiltered) {
              filterStatusEl.style.color = 'var(--status-success)';
              filterStatusEl.innerHTML = `✔ Showing ${mapped.length} item(s) mapped to <strong>${supNameToMatch} (${supCodeToMatch})</strong>`;
            } else {
              filterStatusEl.style.color = 'var(--status-warning)';
              filterStatusEl.innerHTML = `ℹ️ Showing full catalog (${allItems.length} items) — no specific items mapped to <strong>${supNameToMatch} (${supCodeToMatch})</strong>`;
            }
          }
        }

        // 2. Item change on PO form
        if (e.target.id === 'inp-po-line-item') {
          const selectedCode = e.target.value;
          const priceInp = document.querySelector('#inp-po-line-price');
          const session = authEngine.getCurrentSession();
          if (selectedCode && priceInp) {
            const itemObj = inventoryRepository.getByCode(selectedCode, session ? session.tenantId : null);
            if (itemObj) {
              priceInp.value = (parseFloat(itemObj.lastPurchasePrice) || 0).toFixed(2);
            }
          }
        }
      });

      document.addEventListener('click', (e) => {
        if (!e.target) return;

        // Save Draft Button
        const saveDraftBtn = e.target.closest('#btn-save-po-draft');
        if (saveDraftBtn) {
          e.preventDefault();
          this.executeSavePo('DRAFT');
          return;
        }

        // Approve & Submit PO Button
        const approveSubmitBtn = e.target.closest('#btn-approve-po-submit');
        if (approveSubmitBtn) {
          e.preventDefault();
          this.executeSavePo('APPROVED');
          return;
        }

        // Cancel / Back to PO List Button
        const cancelBtn = e.target.closest('#btn-cancel-po-form') || e.target.closest('#btn-back-to-po-list');
        if (cancelBtn) {
          e.preventDefault();
          this.poDraftLines = [];
          this.navigateToSubView('inv-po');
          return;
        }

        // + Add Line Button
        const addBtn = e.target.closest('#btn-add-po-line');
        if (addBtn) {
          e.preventDefault();
          const itemSel = document.querySelector('#inp-po-line-item');
          const qtyInp = document.querySelector('#inp-po-line-qty');
          const priceInp = document.querySelector('#inp-po-line-price');
          const addFeedbackEl = document.querySelector('#po-add-line-feedback');
          const session = authEngine.getCurrentSession();

          if (!itemSel || !itemSel.value) {
            alert('❌ Please select an item from the dropdown.');
            return;
          }

          const selectedCode = itemSel.value;
          const itemObj = inventoryRepository.getByCode(selectedCode, session ? session.tenantId : null);
          if (!itemObj) {
            alert(`❌ Master item ${selectedCode} not found in Master Inventory.`);
            return;
          }

          const qty = parseFloat(qtyInp ? qtyInp.value : 10) || 10;
          const price = parseFloat(priceInp ? priceInp.value : itemObj.lastPurchasePrice) || (itemObj.lastPurchasePrice || 0);

          if (qty <= 0) {
            alert('❌ Quantity must be greater than 0.');
            return;
          }

          this.poDraftLines = this.poDraftLines || [];
          this.poDraftLines.push({
            itemCode: itemObj.itemCode,
            itemName: itemObj.itemName,
            purchaseUom: itemObj.purchaseUom || itemObj.baseUom || 'KG',
            orderedQuantity: qty,
            purchaseUnitPrice: price,
            lineTotal: qty * price
          });

          // Update PO Lines Table
          const tbody = document.querySelector('#po-lines-tbody');
          const grandTotalEl = document.querySelector('#po-grand-total-display');
          if (tbody) {
            let grandTotal = 0;
            tbody.innerHTML = this.poDraftLines.map((l, idx) => {
              const lineTot = l.orderedQuantity * l.purchaseUnitPrice;
              grandTotal += lineTot;
              return `
                <tr style="border-bottom:1px solid var(--border-subtle); background:rgba(16,185,129,0.04);">
                  <td style="padding:8px; font-weight:600;">${l.itemName} <span style="font-size:0.75rem; color:var(--text-muted);">(${l.itemCode})</span></td>
                  <td style="padding:8px;"><span class="badge badge-info">${l.purchaseUom}</span></td>
                  <td style="padding:8px; font-weight:700;">${l.orderedQuantity}</td>
                  <td style="padding:8px;">₹${l.purchaseUnitPrice.toFixed(2)}</td>
                  <td style="padding:8px; font-weight:700; color:var(--status-success);">₹${lineTot.toFixed(2)}</td>
                  <td style="padding:8px; text-align:right;">
                    <button type="button" class="btn-remove-po-line" data-idx="${idx}" style="padding:2px 8px; font-size:0.75rem; background:var(--status-danger); color:#fff; border:none; border-radius:4px; cursor:pointer;">✕ Remove</button>
                  </td>
                </tr>
              `;
            }).join('');
            if (grandTotalEl) grandTotalEl.textContent = `₹${grandTotal.toFixed(2)}`;
          }

          if (addFeedbackEl) {
            addFeedbackEl.style.color = 'var(--status-success)';
            addFeedbackEl.innerHTML = `✅ Added <strong>${qty} ${itemObj.purchaseUom || itemObj.baseUom || 'KG'}</strong> of <strong>${itemObj.itemName}</strong> to Order! (Total Lines: ${this.poDraftLines.length})`;
            setTimeout(() => { addFeedbackEl.innerHTML = ''; }, 4000);
          }
        }

        // Remove Line Button
        const removeBtn = e.target.closest('.btn-remove-po-line');
        if (removeBtn) {
          e.preventDefault();
          const idx = parseInt(removeBtn.dataset.idx, 10);
          if (this.poDraftLines && !isNaN(idx)) {
            this.poDraftLines.splice(idx, 1);

            const tbody = document.querySelector('#po-lines-tbody');
            const grandTotalEl = document.querySelector('#po-grand-total-display');
            if (tbody) {
              let grandTotal = 0;
              tbody.innerHTML = this.poDraftLines.map((l, i) => {
                const lineTot = l.orderedQuantity * l.purchaseUnitPrice;
                grandTotal += lineTot;
                return `
                  <tr style="border-bottom:1px solid var(--border-subtle); background:rgba(16,185,129,0.04);">
                    <td style="padding:8px; font-weight:600;">${l.itemName} <span style="font-size:0.75rem; color:var(--text-muted);">(${l.itemCode})</span></td>
                    <td style="padding:8px;"><span class="badge badge-info">${l.purchaseUom}</span></td>
                    <td style="padding:8px; font-weight:700;">${l.orderedQuantity}</td>
                    <td style="padding:8px;">₹${l.purchaseUnitPrice.toFixed(2)}</td>
                    <td style="padding:8px; font-weight:700; color:var(--status-success);">₹${lineTot.toFixed(2)}</td>
                    <td style="padding:8px; text-align:right;">
                      <button type="button" class="btn-remove-po-line" data-idx="${i}" style="padding:2px 8px; font-size:0.75rem; background:var(--status-danger); color:#fff; border:none; border-radius:4px; cursor:pointer;">✕ Remove</button>
                    </td>
                  </tr>
                `;
              }).join('');
              if (grandTotalEl) grandTotalEl.textContent = `₹${grandTotal.toFixed(2)}`;
            }
          }
        }
      });
    }

    init() {
      this.appEl = document.getElementById('app');
      window.addEventListener('hashchange', () => this.processCurrentRoute());
      this.bindGlobalDelegatedEvents();
      this.processCurrentRoute();
    }

    render() {
      const session = authEngine.getCurrentSession();
      if (!session) {
        this.appEl.innerHTML = '<div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:var(--space-md); overflow-y:auto; -webkit-overflow-scrolling:touch;" id="pin-mount"></div>';
        const pin = new PinPadView({ onSuccess: () => this.processCurrentRoute() });
        this.appEl.querySelector('#pin-mount').appendChild(pin.render());
        return;
      }

      const tenant = tenantRepository.getById(session.tenantId);
      const syncState = syncEngine.getSyncState(session.tenantId);

      this.appEl.innerHTML = `
        <div class="flex-col h-full" style="min-height:100vh;">
          <header class="app-header">
            <div class="flex items-center gap-md" style="flex-wrap:wrap;">
              <div style="font-weight:700; font-size:1.25rem; color:var(--accent-primary);">Anchor BusinessOS</div>
              <span class="badge badge-info">${(tenant?.name || session?.tenantName || session?.workspace || 'Anchor OS').toUpperCase()}</span>
              <span class="badge badge-warning" style="font-size:0.75rem;">/${this.activeRoute}</span>
            </div>
            <div class="flex items-center gap-md" style="flex-wrap:wrap;">
              <!-- ⚡ FROZEN PD-032 Live Header Sync Status Badge -->
              <span id="header-sync-badge" class="badge ${syncState.badgeClass}" style="padding:6px 12px; font-size:0.8rem; font-weight:600; cursor:pointer;" title="Click to open Developer Sync Console">
                ${syncState.label}
              </span>
              <span style="font-weight:600;">${session.employeeName} (${session.roleName})</span>
              <button class="btn-secondary" id="btn-logout" style="color:var(--status-danger);">🔒 Logout</button>
            </div>
          </header>
          <div class="app-layout-body">
            <aside class="app-sidebar flex-col gap-sm">
              ${this.renderSidebarHTML(session)}
            </aside>
            <main class="app-main" id="main-mount"></main>
          </div>
          <div id="modal-container-mount"></div>
        </div>
      `;
      this.bindHeader();
      this.mountMain(session);
    }

    updateSyncBadgeUI() {
      const session = authEngine.getCurrentSession();
      if (!session) return;
      const badgeEl = this.appEl.querySelector('#header-sync-badge');
      if (badgeEl) {
        const syncState = syncEngine.getSyncState(session.tenantId);
        badgeEl.className = `badge ${syncState.badgeClass}`;
        badgeEl.textContent = syncState.label;
      }
    }

    renderSidebarHTML(session) {
      const isCrossWorkspace = session.roleId === 'role-admin' || session.roleId === 'role-superadmin';
      let mainNavHTML = '';

      if (this.activeRoute === 'superadmin') {
        mainNavHTML = `
          <button class="btn-secondary nav-btn ${this.activeSubView === 'superadmin' ? 'active' : ''}" data-v="superadmin" style="text-align:left;">👑 Super Admin Console</button>
          <button class="btn-secondary nav-btn ${this.activeSubView === 'dev-sync' ? 'active' : ''}" data-v="dev-sync" style="text-align:left; font-size:0.85rem; margin-top:8px;">🛠️ Developer Sync Console</button>
        `;
      } else if (this.activeRoute === 'waiter') {
        mainNavHTML = `
          <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px; padding-left:4px;">🍽️ WAITER WORKSPACE</div>
          <button class="btn-secondary nav-btn ${this.activeSubView === 'waiter' || this.activeSubView === 'dashboard' ? 'active' : ''}" data-v="dashboard" style="text-align:left; font-weight:600;">🍽️ Floor Map & Tables</button>
          <button class="btn-secondary nav-btn ${this.activeSubView === 'kots' ? 'active' : ''}" data-v="kots" style="text-align:left; font-size:0.85rem;">📋 Active Orders / KOTs</button>
        `;
      } else if (this.activeRoute === 'kitchen') {
        mainNavHTML = `
          <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px; padding-left:4px;">👨‍🍳 KITCHEN WORKSPACE</div>
          <button class="btn-secondary nav-btn ${this.activeSubView === 'kitchen' || this.activeSubView === 'dashboard' ? 'active' : ''}" data-v="dashboard" style="text-align:left; font-weight:600;">👨‍🍳 KDS Ticket Queue</button>
        `;
      } else if (this.activeRoute === 'bar') {
        mainNavHTML = `
          <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px; padding-left:4px;">🍺 BAR WORKSPACE</div>
          <button class="btn-secondary nav-btn ${this.activeSubView === 'bar' || this.activeSubView === 'dashboard' ? 'active' : ''}" data-v="dashboard" style="text-align:left; font-weight:600;">🍺 BDS Drink Queue</button>
        `;
      } else if (this.activeRoute === 'cashier') {
        mainNavHTML = `
          <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px; padding-left:4px;">🧾 CASHIER WORKSPACE</div>
          <button class="btn-secondary nav-btn ${this.activeSubView === 'cashier' || this.activeSubView === 'dashboard' ? 'active' : ''}" data-v="dashboard" style="text-align:left; font-weight:600;">🧾 Checkout Counter</button>
        `;
      } else if (this.activeRoute === 'inventory') {
        mainNavHTML = this.renderInventorySidebarHTML();
      } else {
        mainNavHTML = this.renderAdminSidebarHTML(session);
      }

      let switcherHTML = '';
      if (isCrossWorkspace) {
        switcherHTML = `
          <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border-subtle);">
            <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:6px; padding-left:4px;">🔄 WORKSPACE SWITCHER</div>
            <button class="btn-secondary nav-route-btn ${this.activeRoute === 'admin' ? 'active' : ''}" data-r="admin" style="text-align:left; font-size:0.8rem; padding:6px 8px; margin-bottom:2px;">⚙ Admin Center</button>
            <button class="btn-secondary nav-route-btn ${this.activeRoute === 'waiter' ? 'active' : ''}" data-r="waiter" style="text-align:left; font-size:0.8rem; padding:6px 8px; margin-bottom:2px;">🍽️ Waiter Floor</button>
            <button class="btn-secondary nav-route-btn ${this.activeRoute === 'kitchen' ? 'active' : ''}" data-r="kitchen" style="text-align:left; font-size:0.8rem; padding:6px 8px; margin-bottom:2px;">👨‍🍳 Kitchen KDS</button>
            <button class="btn-secondary nav-route-btn ${this.activeRoute === 'bar' ? 'active' : ''}" data-r="bar" style="text-align:left; font-size:0.8rem; padding:6px 8px; margin-bottom:2px;">🍺 Bar BDS</button>
            <button class="btn-secondary nav-route-btn ${this.activeRoute === 'cashier' ? 'active' : ''}" data-r="cashier" style="text-align:left; font-size:0.8rem; padding:6px 8px; margin-bottom:2px;">🧾 Cashier Counter</button>
            <button class="btn-secondary nav-route-btn ${this.activeRoute === 'inventory' ? 'active' : ''}" data-r="inventory" style="text-align:left; font-size:0.8rem; padding:6px 8px;">📦 Inventory</button>
          </div>
        `;
      }
      return mainNavHTML + switcherHTML;
    }

    renderAdminSidebarHTML(session) {
      if (session.workspace === 'superadmin') {
        return `
          <button class="btn-secondary nav-btn ${this.activeSubView === 'superadmin' ? 'active' : ''}" data-v="superadmin" style="text-align:left;">👑 Super Admin Console</button>
          <button class="btn-secondary nav-btn ${this.activeSubView === 'dev-sync' ? 'active' : ''}" data-v="dev-sync" style="text-align:left; font-size:0.85rem; margin-top:8px;">🛠️ Developer Sync Console</button>
        `;
      }
      return `
        <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px; padding-left:4px;">ADMIN NAVIGATION</div>
        
        <button class="btn-secondary nav-btn ${this.activeSubView === 'dashboard' ? 'active' : ''}" data-v="dashboard" style="text-align:left; font-weight:600;">
          🏠 Dashboard
        </button>

        <div style="margin:4px 0;">
          <button class="btn-secondary" id="btn-toggle-config-group" style="width:100%; text-align:left; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
            <span>⚙ Configuration</span>
            <span>${this.configGroupOpen ? '▾' : '▸'}</span>
          </button>
          ${this.configGroupOpen ? `
            <div class="flex-col gap-xs" style="padding-left:12px; margin-top:4px; border-left:2px solid var(--border-subtle);">
              <button class="btn-secondary nav-btn ${this.activeSubView === 'card1-full' ? 'active' : ''}" data-v="card1-full" style="text-align:left; font-size:0.85rem;">• Business Profile</button>
              <button class="btn-secondary nav-btn ${this.activeSubView === 'config-areas' ? 'active' : ''}" data-v="config-areas" style="text-align:left; font-size:0.85rem;">• Dining Areas</button>
              <button class="btn-secondary nav-btn ${this.activeSubView === 'config-tables' ? 'active' : ''}" data-v="config-tables" style="text-align:left; font-size:0.85rem;">• Tables</button>
              <button class="btn-secondary nav-btn ${this.activeSubView === 'config-users' ? 'active' : ''}" data-v="config-users" style="text-align:left; font-size:0.85rem;">• Staff & Access</button>
              <button class="btn-secondary nav-btn ${this.activeSubView === 'config-devices' ? 'active' : ''}" data-v="config-devices" style="text-align:left; font-size:0.85rem;">• Devices & Printers</button>
              <button class="btn-secondary nav-btn ${this.activeSubView === 'config-payments' ? 'active' : ''}" data-v="config-payments" style="text-align:left; font-size:0.85rem;">• Payment Configuration</button>
            </div>
          ` : ''}
        </div>

        <button class="btn-secondary nav-btn ${this.activeSubView === 'commissioning' ? 'active' : ''}" data-v="commissioning" style="text-align:left; font-weight:600;">
          📊 Commissioning
        </button>

        <button class="btn-secondary nav-btn ${this.activeSubView === 'audit' ? 'active' : ''}" data-v="audit" style="text-align:left; font-weight:600;">
          📋 Audit Log
        </button>

        <button class="btn-secondary nav-btn ${this.activeSubView === 'dev-sync' ? 'active' : ''}" data-v="dev-sync" style="text-align:left; font-size:0.8rem; margin-top:12px;">
          🛠️ Developer Sync Console
        </button>
      `;
    }

    renderInventorySidebarHTML() {
      const v = this.activeSubView;
      return `
        <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px; padding-left:4px;">📦 INVENTORY WORKSPACE</div>

        <button class="btn-secondary nav-btn ${v === 'inv-dashboard' || v === 'dashboard' ? 'active' : ''}" data-v="inv-dashboard" style="text-align:left; font-weight:600;">
          🏠 Dashboard
        </button>

        <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin:10px 0 2px 4px;">MASTER DATA</div>
        <button class="btn-secondary nav-btn ${v === 'inv-master' ? 'active' : ''}" data-v="inv-master" style="text-align:left; font-size:0.85rem;">📦 Master Inventory</button>
        <button class="btn-secondary nav-btn ${v === 'inv-categories' ? 'active' : ''}" data-v="inv-categories" style="text-align:left; font-size:0.85rem;">🏷 Categories & Families</button>
        <button class="btn-secondary nav-btn ${v === 'inv-uom' ? 'active' : ''}" data-v="inv-uom" style="text-align:left; font-size:0.85rem;">📏 Units of Measure</button>
        <button class="btn-secondary nav-btn ${v === 'inv-locations' ? 'active' : ''}" data-v="inv-locations" style="text-align:left; font-size:0.85rem;">🏬 Storage Locations</button>
        <button class="btn-secondary nav-btn ${v === 'inv-suppliers' ? 'active' : ''}" data-v="inv-suppliers" style="text-align:left; font-size:0.85rem;">🏢 Suppliers Master</button>

        <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin:10px 0 2px 4px;">OPERATIONS</div>
        <button class="btn-secondary nav-btn ${v === 'inv-grn' || v === 'inv-receipts' || v === 'inv-receiving' ? 'active' : ''}" data-v="inv-grn" style="text-align:left; font-size:0.85rem;">📥 Goods Receiving / GRN</button>
        <button class="btn-secondary nav-btn ${v === 'inv-issues' ? 'active' : ''}" data-v="inv-issues" style="text-align:left; font-size:0.85rem;">📤 Stock Issues</button>
        <button class="btn-secondary nav-btn ${v === 'inv-transfers' ? 'active' : ''}" data-v="inv-transfers" style="text-align:left; font-size:0.85rem;">🔄 Stock Transfers</button>
        <button class="btn-secondary nav-btn ${v === 'inv-adjustments' ? 'active' : ''}" data-v="inv-adjustments" style="text-align:left; font-size:0.85rem;">📊 Stock Adjustments</button>
        <button class="btn-secondary nav-btn ${v === 'inv-counts' || v === 'inv-count' ? 'active' : ''}" data-v="inv-counts" style="text-align:left; font-size:0.85rem;">📦 Stock Count</button>
        <button class="btn-secondary nav-btn ${v === 'inv-alerts' ? 'active' : ''}" data-v="inv-alerts" style="text-align:left; font-size:0.85rem;">⚠ Low Stock Alerts</button>
        <button class="btn-secondary nav-btn ${v === 'inv-requests' ? 'active' : ''}" data-v="inv-requests" style="text-align:left; font-size:0.85rem;">✅ Inventory Requests</button>

        <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin:10px 0 2px 4px;">PROCUREMENT</div>
        <button class="btn-secondary nav-btn ${v === 'inv-po' || v === 'inv-pos' ? 'active' : ''}" data-v="inv-po" style="text-align:left; font-size:0.85rem;">📄 Purchase Orders</button>
        <button class="btn-secondary nav-btn ${v === 'inv-grn' || v === 'inv-receiving' ? 'active' : ''}" data-v="inv-grn" style="text-align:left; font-size:0.85rem;">🚚 Goods Receiving Studio</button>

        <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin:10px 0 2px 4px;">TOOLS</div>
        <button class="btn-secondary nav-btn ${v === 'inv-import' ? 'active' : ''}" data-v="inv-import" style="text-align:left; font-size:0.85rem;">⚡ Bulk Import (CANON-11)</button>
        <button class="btn-secondary nav-btn ${v === 'inv-export' ? 'active' : ''}" data-v="inv-export" style="text-align:left; font-size:0.85rem;">📤 Export Data</button>
        <button class="btn-secondary nav-btn ${v === 'inv-history' ? 'active' : ''}" data-v="inv-history" style="text-align:left; font-size:0.85rem;">📜 Audit History</button>
        <button class="btn-secondary nav-btn ${v === 'dev-sync' ? 'active' : ''}" data-v="dev-sync" style="text-align:left; font-size:0.8rem; margin-top:8px;">🛠️ Developer Sync Console</button>
      `;
    }

    bindHeader() {
      this.appEl.querySelector('#btn-logout').addEventListener('click', () => { authEngine.logout(); this.render(); });

      const syncBadge = this.appEl.querySelector('#header-sync-badge');
      if (syncBadge) {
        syncBadge.addEventListener('click', () => {
          window.location.hash = '#/' + (this.activeRoute || 'admin') + '/dev-sync';
        });
      }

      const toggleBtn = this.appEl.querySelector('#btn-toggle-config-group');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          this.configGroupOpen = !this.configGroupOpen;
          this.render();
        });
      }

      this.appEl.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = btn.dataset.v;
          if (v) {
            window.location.hash = '#/' + (this.activeRoute || 'admin') + '/' + v;
          }
        });
      });

      this.appEl.querySelectorAll('.nav-route-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = btn.dataset.r;
          if (r) {
            window.location.hash = '#/' + r;
          }
        });
      });
    }

    mountMain(session) {
      const mount = this.appEl.querySelector('#main-mount');
      const readiness = commissioningEngine.evaluateReadiness(session.tenantId);

      // 🛠️ Developer Sync Console View
      if (this.activeSubView === 'dev-sync') {
        this.renderDeveloperSyncConsole(mount, session);
        return;
      }

      // Role Workspace Routes
      if (this.activeRoute === 'waiter') {
        this.renderWaiterWorkspace(mount, session);
        return;
      }
      if (this.activeRoute === 'kitchen') {
        this.renderKitchenWorkspace(mount, session);
        return;
      }
      if (this.activeRoute === 'bar') {
        this.renderBarWorkspace(mount, session);
        return;
      }
      if (this.activeRoute === 'cashier') {
        this.renderCashierWorkspace(mount, session);
        return;
      }
      if (this.activeRoute === 'inventory' || session.workspace === 'inventory' || this.activeSubView.startsWith('inv-')) {
        this.renderInventoryWorkspace(mount, session);
        return;
      }

      // Super Admin Console View
      if (this.activeRoute === 'superadmin' || session.workspace === 'superadmin' || this.activeSubView === 'superadmin') {
        const tenants = tenantRepository.getAll();
        mount.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <div>
              <h2 style="font-size:1.75rem;">Super Admin Console</h2>
              <p style="color:var(--text-muted); font-size:0.875rem;">Multi-Tenant Onboarding & System Control (PIN 888888)</p>
            </div>
            <button class="btn-secondary" id="btn-reset-db" style="color:var(--status-danger); border-color:var(--status-danger); font-weight:700; padding:10px 18px;">
              🗑️ Reset All Data & Start Fresh Slate
            </button>
          </div>

          <div class="grid-2col-responsive">
            <div>
              <h3>Active Restaurant Tenants (${tenants.length})</h3>
              <div class="flex-col gap-sm" style="margin-top:12px;">
                ${tenants.length ? tenants.map(t => `
                  <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1);">
                    <div>
                      <h4 style="font-size:1.1rem; margin:0;">${t.name}</h4>
                      <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">ID: ${t.tenantId} • ${t.regional ? t.regional.currency : 'INR'}</p>
                      <div style="font-size:0.82rem; margin-top:6px; background:var(--bg-surface-2); padding:4px 8px; border-radius:4px; display:inline-block;">
                        👤 Admin: <strong>${t.adminName || 'Admin'}</strong> | 🔑 PIN: <strong style="color:var(--status-success); font-size:0.95rem;">${t.adminPin || '999999'}</strong>
                      </div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                      <button class="btn-primary btn-switch-admin" data-pin="${t.adminPin || '999999'}" style="padding:6px 12px; font-size:0.85rem; font-weight:700;">
                        ⚡ Switch to Admin
                      </button>
                      <button class="btn-secondary btn-delete-tenant" data-id="${t.tenantId}" style="color:var(--status-danger); padding:6px 10px;">Delete</button>
                    </div>
                  </div>
                `).join('') : `
                  <div class="card" style="background:var(--bg-surface-1); padding:24px; text-align:center; color:var(--text-muted);">
                    <div style="font-size:1.5rem; margin-bottom:8px;">🏛️ Clean Slate</div>
                    <div>No restaurant tenants exist. Use the form on the right to onboard your first restaurant!</div>
                  </div>
                `}
              </div>
            </div>
            <div class="card" style="background:var(--bg-surface-1);">
              <h3>✨ Onboard New Restaurant Tenant</h3>
              <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
                <div>
                  <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Restaurant Name</label>
                  <input type="text" id="inp-sa-name" placeholder="e.g. Coastal Bistro" style="width:100%;">
                </div>
                <div class="grid grid-cols-2 gap-sm">
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Currency</label>
                    <select id="inp-sa-curr" style="width:100%;">
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Timezone</label>
                    <select id="inp-sa-tz" style="width:100%;">
                      <option value="Asia/Kolkata">Asia/Kolkata</option>
                      <option value="America/New_York">America/New_York</option>
                    </select>
                  </div>
                </div>

                <div style="border-top:1px solid var(--border-subtle); padding-top:12px; margin-top:4px;">
                  <div style="font-size:0.85rem; font-weight:600; margin-bottom:8px;">Admin Credentials Setup</div>
                  <div>
                    <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Admin Name</label>
                    <input type="text" id="inp-sa-admin-name" placeholder="e.g. Priya Mehta" style="width:100%;">
                  </div>
                  <div style="margin-top:8px;">
                    <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Admin PIN (Set Custom 6-Digits)</label>
                    <input type="text" id="inp-sa-admin-pin" placeholder="e.g. 999999" maxlength="6" style="width:100%;">
                  </div>
                </div>

                <button class="btn-primary" id="btn-sa-submit" style="margin-top:12px; padding:12px; font-weight:600;">
                  ✨ Create Restaurant & Admin Account
                </button>
              </div>
            </div>
          </div>
        `;

        mount.querySelector('#btn-reset-db').addEventListener('click', () => {
          if (confirm('⚠️ DANGER: Completely wipe all local restaurant data, dining areas, tables, staff accounts, and inventory master records, leaving a 100% clean slate?\n\nProceed with full data wipe?')) {
            offlineStore.resetAllData();
            alert('🧹 Database clean wipe complete! Starting fresh slate with Super Admin (PIN 888888)...');
            location.reload();
          }
        });

        mount.querySelectorAll('.btn-switch-admin').forEach(btn => {
          btn.addEventListener('click', async () => {
            const pin = btn.dataset.pin;
            const res = await authEngine.authenticate(pin);
            if (res.success) {
              this.activeSubView = 'dashboard';
              this.render();
            } else {
              alert(res.error || 'Failed to switch to Admin workspace.');
            }
          });
        });

        mount.querySelectorAll('.btn-delete-tenant').forEach(btn => {
          btn.addEventListener('click', () => {
            const tid = btn.dataset.id;
            if (confirm(`Delete restaurant tenant ${tid}?`)) {
              tenantModel.deleteTenant(tid);
              alert('Restaurant tenant deleted!');
              this.render();
            }
          });
        });

        mount.querySelector('#btn-sa-submit').addEventListener('click', async () => {
          const name = mount.querySelector('#inp-sa-name').value.trim();
          const currency = mount.querySelector('#inp-sa-curr').value;
          const timezone = mount.querySelector('#inp-sa-tz').value;
          const adminName = mount.querySelector('#inp-sa-admin-name').value.trim();
          const adminPin = mount.querySelector('#inp-sa-admin-pin').value.trim();

          if (!name || !adminName || !adminPin || adminPin.length !== 6) {
            alert('❌ Please enter a valid Restaurant Name, Admin Name, and 6-Digit Admin PIN.');
            return;
          }

          try {
            const created = await tenantModel.createTenant({ name, currency, timezone, adminName, adminPin });
            alert(`🎉 Restaurant "${created.name}" created!\nLog out and log in with Admin PIN "${adminPin}".`);
            this.render();
          } catch (err) {
            alert(`❌ ${err.message}`);
          }
        });
        return;
      }

      // 📦 Milestone 1: Inventory Manager Dedicated Workspace
      if (session.workspace === 'inventory' || this.activeSubView.startsWith('inv-')) {
        this.renderInventoryWorkspace(mount, session);
        return;
      }

      // 1. 🏠 Admin Dashboard View
      if (this.activeSubView === 'dashboard') {
        const tenant = tenantRepository.getById(session.tenantId) || tenantModel.getPrimaryTenant();
        const isLive = tenant && tenant.isOperationsStarted;

        mount.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 style="font-size:1.75rem;">Good Morning, ${session.employeeName} 👋</h2>
              <p style="color:var(--text-muted); font-size:0.875rem;">${tenant ? tenant.name : 'Restaurant'} • Admin Command Center</p>
            </div>
            <button class="btn-primary" id="btn-goto-comm" style="padding:10px 18px;">
              📊 Commissioning Control Tower (${readiness.infraCompleted}/${readiness.infraTotal}) →
            </button>
          </div>

          <div class="grid-2col-responsive" style="margin-top:20px;">
            <div>
              <div class="card" style="background:var(--bg-surface-2); padding:18px; border-left:4px solid ${isLive ? 'var(--status-success)' : 'var(--status-warning)'};">
                <div style="font-size:0.8rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">RESTAURANT OPERATIONAL STATUS</div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                  <div>
                    <h3 style="font-size:1.4rem; margin:0;">${isLive ? '🚀 Restaurant Running Normally' : '⚙️ Configuration in Progress'}</h3>
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">
                      ${isLive ? 'Live service active. Workspaces online.' : 'Answer: What still needs to be configured before go-live?'}
                    </p>
                  </div>
                  <span class="badge ${isLive ? 'badge-success' : 'badge-warning'}" style="font-size:0.9rem; padding:6px 12px;">
                    ${isLive ? 'LIVE OPERATIONAL' : `${readiness.infraCompleted}/${readiness.infraTotal} Configured`}
                  </span>
                </div>
              </div>

              <h3 style="margin-top:20px;">Configuration Progress Checklist</h3>
              <div class="grid grid-cols-2 gap-md" style="margin-top:12px;">
                ${readiness.infraCards.map(c => `
                  <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1);">
                    <div>
                      <div style="font-weight:600;">${c.title}</div>
                      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Status: ${c.status}</div>
                    </div>
                    <button class="btn-secondary btn-goto-card" data-v="${c.route}">Manage →</button>
                  </div>
                `).join('')}
              </div>
            </div>

            <div>
              <div class="card" style="background:var(--bg-surface-1);">
                <h4 style="font-size:1rem;">Quick Action Shortcuts</h4>
                <div class="flex-col gap-xs" style="margin-top:12px;">
                  <button class="btn-secondary nav-btn" data-v="card1-full" style="text-align:left;">⚙ Edit Business Identity</button>
                  <button class="btn-secondary nav-btn" data-v="config-areas" style="text-align:left;">🏛 Manage Dining Areas</button>
                  <button class="btn-secondary nav-btn" data-v="config-tables" style="text-align:left;">🍽 Manage Dining Assets</button>
                  <button class="btn-secondary nav-btn" data-v="config-users" style="text-align:left;">👤 Manage Staff Accounts</button>
                  <button class="btn-secondary nav-btn" data-v="dev-sync" style="text-align:left;">🛠️ Developer Sync Console</button>
                </div>
              </div>
            </div>
          </div>
        `;

        mount.querySelector('#btn-goto-comm').addEventListener('click', () => { this.activeSubView = 'commissioning'; this.render(); });
        mount.querySelectorAll('.btn-goto-card').forEach(b => {
          b.addEventListener('click', () => { this.activeSubView = b.dataset.v; this.render(); });
        });
        return;
      }

      // Card 1 Full Page
      if (this.activeSubView === 'card1-full') {
        this.renderCard1FullPage(mount, session);
        return;
      }

      // Card 2 Dining Areas
      if (this.activeSubView === 'config-areas') {
        this.renderConfigAreas(mount, session);
        return;
      }

      // Card 3 Dining Tables
      if (this.activeSubView === 'config-tables') {
        this.renderConfigTables(mount, session);
        return;
      }

      // Card 4 Staff & Access
      if (this.activeSubView === 'config-users') {
        this.renderConfigStaff(mount, session);
        return;
      }

      // Devices
      if (this.activeSubView === 'config-devices') {
        this.renderConfigDevices(mount);
        return;
      }

      // Payments
      if (this.activeSubView === 'config-payments') {
        this.renderConfigPayments(mount);
        return;
      }

      // Commissioning Control Tower
      if (this.activeSubView === 'commissioning') {
        mount.innerHTML = `
          <h2>📊 Commissioning Control Tower</h2>
          <p style="color:var(--text-muted); font-size:0.875rem;">Operational readiness check & dependency evaluation.</p>
          <div class="card" style="margin-top:16px;">
            <h3>Infrastructure Configuration: ${readiness.infraCompleted}/${readiness.infraTotal}</h3>
            <p>Active Staff Accounts: <strong>${readiness.activeStaffCount}</strong></p>
            <p>Master Inventory Items: <strong>${readiness.masterItemsCount}</strong></p>
          </div>
        `;
        return;
      }

      // Audit Log View
      if (this.activeSubView === 'audit') {
        const logs = offlineStore.getCollection('audit_logs', session.tenantId) || [];
        mount.innerHTML = `
          <h2>📋 System Audit Log</h2>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Immutable record of actions with Correlation IDs.</p>

          <div class="card">
            <h3>Audit Events Log</h3>
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-top:8px;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left;">
                  <th style="padding:8px;">Time</th><th style="padding:8px;">User</th><th style="padding:8px;">Action</th><th style="padding:8px;">Correlation ID</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:8px;">${l.time}</td>
                    <td style="padding:8px; font-weight:600;">${l.user}</td>
                    <td style="padding:8px;">${l.action}</td>
                    <td style="padding:8px; font-family:monospace; color:var(--text-muted);">${l.correlationId}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        return;
      }
    }

    // 🛠️ FROZEN PD-032 & PD-034: Developer Sync Console View Implementation
    renderDeveloperSyncConsole(mount, session) {
      const tenantId = session.tenantId;
      const syncState = syncEngine.getSyncState(tenantId);
      const jobs = offlineJournal.getJobs(tenantId);
      const pendingJobs = offlineJournal.getPendingJobs(tenantId);
      const missingSchemaJobs = jobs.filter(j => j.syncState === 'WAITING_FOR_SCHEMA');

      mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 style="font-size:1.75rem; margin:0;">🛠️ Developer Sync Console</h2>
              <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">
                PD-032 Offline First & PD-034 Live Supabase Cloud Sync Integration
              </p>
            </div>
            <div style="display:flex; gap:10px;">
              <button class="btn-primary" id="btn-force-sync" style="font-weight:600;">🔄 Force Sync to Supabase</button>
              <button class="btn-secondary" id="btn-retry-failed" style="font-weight:600;">🔁 Retry Failed Jobs</button>
            </div>
          </div>

          ${missingSchemaJobs.length ? `
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--status-warning);">
              <div style="font-weight:700; font-size:0.95rem; color:var(--status-warning);">⚠️ HTTP 404: PostgreSQL Tables Missing in Supabase</div>
              <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">
                Supabase returns HTTP 404 when requested tables (such as <code>tenants</code>, <code>dining_areas</code>, or <code>tables_master</code>) have not been created in your Supabase project yet.<br>
                <strong>Local operations continue with 0ms wait time.</strong> Background polling has been paused to keep your console clean.
              </p>
              <div style="margin-top:10px; font-size:0.85rem; background:var(--bg-surface-1); padding:10px; border-radius:6px;">
                <strong>1-Step Fix:</strong> Copy all code from <code>supabase_schema.sql</code> and paste it into your <strong>Supabase SQL Editor</strong>, then click <strong>RUN</strong>. Afterward, click <strong>🔄 Force Sync to Supabase</strong> above!
              </div>
            </div>
          ` : ''}

          <!-- Cloud Connection Credentials Box -->
          <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--accent-primary);">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">CONNECTED SUPABASE CLOUD ENDPOINT</div>
            <div style="font-size:0.95rem; font-weight:700; font-family:monospace; margin-top:4px; color:var(--status-success);">
              https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
              Auth Mode: Anonymous JWT Bearer Token • Dynamic Schema Sync Active
            </div>
          </div>

          <!-- Diagnostic Metric Cards -->
          <div class="grid-responsive-4">
            <div class="card" style="background:var(--bg-surface-1);">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">DEVICE ID</div>
              <div style="font-size:1.1rem; font-weight:700; font-family:monospace; margin-top:6px; color:var(--accent-primary);">${getDeviceId()}</div>
            </div>
            <div class="card" style="background:var(--bg-surface-1);">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">RESTAURANT TENANT ID</div>
              <div style="font-size:1.1rem; font-weight:700; font-family:monospace; margin-top:6px;">${tenantId || 'GLOBAL'}</div>
            </div>
            <div class="card" style="background:var(--bg-surface-1);">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">CONNECTION STATUS</div>
              <div style="font-size:1.2rem; font-weight:700; margin-top:4px;"><span class="badge ${syncState.badgeClass}">${syncState.label}</span></div>
            </div>
            <div class="card" style="background:var(--bg-surface-1);">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">PENDING SYNC JOBS</div>
              <div style="font-size:1.5rem; font-weight:700; color:${pendingJobs.length > 0 ? 'var(--status-warning)' : 'var(--status-success)'}; margin-top:2px;">${pendingJobs.length}</div>
            </div>
          </div>

          <!-- Offline Journal Table -->
          <div class="card" style="background:var(--bg-surface-1);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h3 style="margin:0;">📜 Offline Journal (${jobs.length} Sync Jobs)</h3>
              <span style="font-size:0.8rem; color:var(--text-muted);">Standard 6-State Entity Sync Lifecycle</span>
            </div>
            ${jobs.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Job ID</th>
                    <th style="padding:8px;">Job Type</th>
                    <th style="padding:8px;">Entity Table</th>
                    <th style="padding:8px;">Payload Details</th>
                    <th style="padding:8px;">Actor</th>
                    <th style="padding:8px;">Sync State</th>
                    <th style="padding:8px;">Diagnostics / Error</th>
                  </tr>
                </thead>
                <tbody>
                  ${jobs.map(j => {
        const p = j.payload || {};
        let summary = '-';
        if (p.tableCode) summary = `Table Code: <strong>${p.tableCode}</strong> (${p.seats || 4} seats)`;
        else if (p.areaName) summary = `Area: <strong>${p.areaName}</strong> (${p.areaCode})`;
        else if (p.itemName) summary = `Item: <strong>${p.itemName}</strong> (${p.itemCode})`;
        else if (p.name) summary = `Name: <strong>${p.name}</strong>`;
        else if (p.supplierName) summary = `Supplier: <strong>${p.supplierName}</strong>`;
        else summary = JSON.stringify(p).substring(0, 30);

        let badgeClass = 'badge-warning';
        if (j.syncState === 'SYNCED') badgeClass = 'badge-success';
        if (j.syncState === 'ERROR') badgeClass = 'badge-danger';
        if (j.syncState === 'SYNCING') badgeClass = 'badge-info';

        return `
                      <tr style="border-bottom:1px solid var(--border-subtle);">
                        <td style="padding:8px; font-family:monospace; font-weight:600;">${j.jobId}</td>
                        <td style="padding:8px; font-weight:700;">${j.jobType}</td>
                        <td style="padding:8px;"><span class="badge badge-info">${j.entityName}</span></td>
                        <td style="padding:8px;">${summary}</td>
                        <td style="padding:8px;">${j.actor}</td>
                        <td style="padding:8px;">
                          <span class="badge ${badgeClass}">${j.syncState}</span>
                        </td>
                        <td style="padding:8px; font-size:0.75rem; color:${j.lastError ? 'var(--status-danger)' : 'var(--text-muted)'}; font-family:monospace;">
                          ${j.lastError || (j.syncState === 'SYNCED' ? '✔ HTTP 201 Success' : 'Pending')}
                        </td>
                      </tr>
                    `;
      }).join('')}
                </tbody>
              </table>
            ` : `
              <div style="padding:24px; text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">
                ✔ Offline Journal is empty. Perform CRUD operations in any workspace to record infrastructure sync jobs!
              </div>
            `}
          </div>
        </div>
      `;

      mount.querySelector('#btn-force-sync').addEventListener('click', async () => {
        syncEngine.forceSyncNow();
        alert('🔄 Force Sync executed against Supabase REST API!');
        this.renderDeveloperSyncConsole(mount, session);
      });

      mount.querySelector('#btn-retry-failed').addEventListener('click', () => {
        const jobs = offlineJournal.getJobs(session.tenantId);
        jobs.filter(j => j.syncState === 'ERROR').forEach(j => offlineJournal.updateJobState(j.jobId, 'QUEUED'));
        syncEngine.forceSyncNow();
        alert('🔁 Retried all failed jobs!');
        this.renderDeveloperSyncConsole(mount, session);
      });
    }

    // 📦 Milestone 1: Dedicated Inventory Manager Workspace Implementation
    renderInventoryWorkspace(mount, session) {
      const tenantId = session.tenantId;
      const items = inventoryRepository.getAll(tenantId);
      const categories = offlineStore.getCollection('inventory_categories', tenantId) || [];
      const uoms = uomRepository.getAll();
      const locations = offlineStore.getCollection('storage_locations', tenantId) || [];
      const suppliers = supplierRepository.getAll(tenantId);
      const requests = offlineStore.getCollection('inventory_requests', tenantId) || [];
      const history = offlineStore.getCollection('import_history', tenantId) || [];
      const balances = offlineStore.getCollection('stock_balances', tenantId) || [];

      const itemsInStockCount = balances.length > 0
        ? new Set(balances.filter(b => (parseFloat(b.quantity) || 0) > 0 && (!tenantId || b.tenantId === tenantId)).map(b => b.itemCode)).size
        : items.filter(i => (parseFloat(i.currentStock !== undefined ? i.currentStock : i.openingStock) || 0) > 0).length;

      const lowStockItems = items.filter(i => {
        const itemBalances = balances.filter(b => b.itemCode === i.itemCode && (!tenantId || b.tenantId === tenantId));
        const currentQty = itemBalances.length
          ? itemBalances.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0)
          : (i.currentStock !== undefined ? i.currentStock : (i.openingStock !== undefined ? i.openingStock : 0));
        return currentQty <= (i.reorderLevel || 0);
      });

      const totalValuation = balances.length
        ? balances.reduce((sum, b) => sum + (parseFloat(b.valuation) || 0), 0)
        : items.reduce((sum, i) => {
          const factor = parseFloat(i.conversionFactor) || 1;
          const purPrice = parseFloat(i.lastPurchasePrice) || 0;
          const unitCost = parseFloat(i.unitValuation) || (factor > 0 ? (purPrice / factor) : purPrice);
          const qty = parseFloat(i.currentStock !== undefined ? i.currentStock : (i.openingStock !== undefined ? i.openingStock : 0));
          return sum + (unitCost * qty);
        }, 0);
      const activeTab = this.activeSubView || 'inv-dashboard';

      mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div style="background:var(--bg-surface-1); padding:20px; border-radius:8px; border:1px solid var(--border-subtle);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
              <div>
                <h2 style="font-size:1.6rem; margin:0;">📦 INVENTORY MANAGER WORKSPACE</h2>
                <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Role: ${session.employeeName} (${session.roleName}) • Supabase Cloud Connected</p>
              </div>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button class="btn-primary" id="btn-hdr-create-po" style="padding:8px 16px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border:none; color:#fff; cursor:pointer;">
                  📋 + Create Purchase Order
                </button>
                <button class="btn-primary" id="btn-hdr-create-grn" style="padding:8px 16px; font-weight:700; background:linear-gradient(135deg, var(--status-success), #059669); border:none; color:#fff; cursor:pointer;">
                  📥 + Post GRN
                </button>
                <button class="btn-secondary" id="btn-inv-add-modal" style="padding:8px 16px; font-weight:600;">
                  + Add Master Item
                </button>
              </div>
            </div>

            <!-- Top Metric Cards -->
            <div class="grid-responsive-6" style="margin-bottom:16px;">
              <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">ITEMS IN STOCK</div>
                <div style="font-size:1.5rem; font-weight:700; color:var(--status-success); margin-top:4px;">${itemsInStockCount}</div>
              </div>
              <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">LOW STOCK ALERTS</div>
                <div style="font-size:1.5rem; font-weight:700; color:${lowStockItems.length > 0 ? 'var(--status-danger)' : 'var(--status-success)'}; margin-top:4px;">${lowStockItems.length}</div>
              </div>
              <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">ITEM REQUESTS</div>
                <div style="font-size:1.5rem; font-weight:700; color:var(--status-warning); margin-top:4px;">${requests.filter(r => r.status === 'PENDING').length} Pending</div>
              </div>
              <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">SUPPLIERS</div>
                <div style="font-size:1.5rem; font-weight:700; margin-top:4px;">${suppliers.length}</div>
              </div>
              <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">LOCATIONS</div>
                <div style="font-size:1.5rem; font-weight:700; margin-top:4px;">${locations.length}</div>
              </div>
              <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL VALUATION</div>
                <div style="font-size:1.2rem; font-weight:700; color:var(--status-success); margin-top:4px;">₹${totalValuation.toLocaleString('en-IN')}</div>
              </div>
            </div>

            <!-- Grouped & Fully Responsive Subtab Navigation Bar -->
            <div style="border-top:1px solid var(--border-subtle); padding-top:14px; display:flex; flex-direction:column; gap:10px;">
              
              <!-- Section 1: Overview & Live Balances -->
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:var(--bg-surface-2); padding:8px 12px; border-radius:8px; border:1px solid var(--border-subtle);">
                <span style="font-size:0.72rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; min-width:85px;">📊 OVERVIEW:</span>
                <div style="display:flex; gap:6px; flex-wrap:wrap; flex:1;">
                  <button type="button" class="btn-subtab ${activeTab === 'inv-dashboard' || activeTab === 'dashboard' ? 'active-subtab' : ''}" data-subtab="inv-dashboard" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-dashboard' || activeTab === 'dashboard' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-dashboard' || activeTab === 'dashboard' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    📊 Dashboard
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-live-stock' || activeTab === 'inv-live-balances' ? 'active-subtab' : ''}" data-subtab="inv-live-stock" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-live-stock' || activeTab === 'inv-live-balances' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-live-stock' || activeTab === 'inv-live-balances' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    📦 Live Store Balances
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-alerts' ? 'active-subtab' : ''}" data-subtab="inv-alerts" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-alerts' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-alerts' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    ⚠️ Low Stock Alerts ${lowStockItems.length > 0 ? `<span class="badge badge-danger" style="font-size:0.7rem; padding:1px 5px; margin-left:3px;">${lowStockItems.length}</span>` : ''}
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-ledger' ? 'active-subtab' : ''}" data-subtab="inv-ledger" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-ledger' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-ledger' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    📜 Stock Ledger
                  </button>
                </div>
              </div>

              <!-- Section 2: Stock Movements & Operations -->
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:var(--bg-surface-2); padding:8px 12px; border-radius:8px; border:1px solid var(--border-subtle);">
                <span style="font-size:0.72rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; min-width:85px;">🔄 MOVEMENTS:</span>
                <div style="display:flex; gap:6px; flex-wrap:wrap; flex:1;">
                  <button type="button" class="btn-subtab ${activeTab === 'inv-po' || activeTab === 'inv-po-form' ? 'active-subtab' : ''}" data-subtab="inv-po" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-po' || activeTab === 'inv-po-form' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-po' || activeTab === 'inv-po-form' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    📋 Purchase Orders
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-grn' || activeTab === 'inv-grn-form' ? 'active-subtab' : ''}" data-subtab="inv-grn" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-grn' || activeTab === 'inv-grn-form' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-grn' || activeTab === 'inv-grn-form' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    📥 Goods Receiving (GRN)
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-transfers' ? 'active-subtab' : ''}" data-subtab="inv-transfers" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-transfers' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-transfers' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    🚚 Transfers
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-issues' ? 'active-subtab' : ''}" data-subtab="inv-issues" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-issues' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-issues' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    📤 Stock Issues
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-adjustments' ? 'active-subtab' : ''}" data-subtab="inv-adjustments" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-adjustments' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-adjustments' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    ⚖️ Adjustments
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-counts' ? 'active-subtab' : ''}" data-subtab="inv-counts" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-counts' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-counts' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    📋 Audit Count
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-requests' ? 'active-subtab' : ''}" data-subtab="inv-requests" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-requests' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-requests' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    ✅ Item Requests ${requests.filter(r => r.status === 'PENDING').length > 0 ? `<span class="badge badge-warning" style="font-size:0.7rem; padding:1px 5px; margin-left:3px;">${requests.filter(r => r.status === 'PENDING').length}</span>` : ''}
                  </button>
                </div>
              </div>

              <!-- Section 3: Master Data & Setup -->
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:var(--bg-surface-2); padding:8px 12px; border-radius:8px; border:1px solid var(--border-subtle);">
                <span style="font-size:0.72rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; min-width:85px;">⚙️ SETUP:</span>
                <div style="display:flex; gap:6px; flex-wrap:wrap; flex:1;">
                  <button type="button" class="btn-subtab ${activeTab === 'inv-categories' ? 'active-subtab' : ''}" data-subtab="inv-categories" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-categories' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-categories' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    🏷 Categories & Families
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-uom' ? 'active-subtab' : ''}" data-subtab="inv-uom" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-uom' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-uom' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    📐 UOM Master
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-locations' ? 'active-subtab' : ''}" data-subtab="inv-locations" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-locations' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-locations' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    🏬 Storage Locations
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-suppliers' ? 'active-subtab' : ''}" data-subtab="inv-suppliers" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-suppliers' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-suppliers' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    🏢 Suppliers Master
                  </button>
                  <button type="button" class="btn-subtab ${activeTab === 'inv-import' ? 'active-subtab' : ''}" data-subtab="inv-import" style="padding:6px 12px; font-size:0.8rem; font-weight:600; border-radius:6px; border:1px solid var(--border-subtle); background:${activeTab === 'inv-import' ? 'var(--accent-primary)' : 'var(--bg-surface-1)'}; color:${activeTab === 'inv-import' ? '#fff' : 'var(--text-primary)'}; cursor:pointer; white-space:nowrap;">
                    ⚡ Import Suite
                  </button>
                </div>
              </div>

            </div>
          </div>

          <main class="card" style="padding:20px; background:var(--bg-surface-1);">
            ${this.renderInventoryTabBody(activeTab, items, categories, uoms, locations, suppliers, requests, history, session, balances)}
          </main>
        </div>
      `;

      const addBtn = mount.querySelector('#btn-inv-add-modal');
      if (addBtn) {
        addBtn.addEventListener('click', () => this.openAddMasterItemModal(session));
      }

      const hdrPoBtn = mount.querySelector('#btn-hdr-create-po');
      if (hdrPoBtn) {
        hdrPoBtn.addEventListener('click', () => {
          this.poDraftLines = [];
          this.navigateToSubView('inv-po-form');
        });
      }

      const hdrGrnBtn = mount.querySelector('#btn-hdr-create-grn');
      if (hdrGrnBtn) {
        hdrGrnBtn.addEventListener('click', () => {
          this.selectedPoForGrn = null;
          this.currentGrnLines = null;
          this.navigateToSubView('inv-grn-form');
        });
      }

      this.bindInventoryTabEvents(mount, session);
      this.bindInventoryMasterDataEvents(mount, session);
    }

    bindInventoryTabEvents(mount, session) {
      // Subtab Navigation
      mount.querySelectorAll('.btn-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
          this.navigateToSubView(btn.dataset.subtab);
        });
      });

      // Master Item Actions & Bulk Import
      const btnTriggerImportMaster = mount.querySelector('#btn-trigger-import-master');
      const inputImportMaster = mount.querySelector('#file-import-master-inventory');
      if (btnTriggerImportMaster && inputImportMaster) {
        btnTriggerImportMaster.addEventListener('click', (e) => {
          e.preventDefault();
          inputImportMaster.click();
        });
        inputImportMaster.addEventListener('change', (e) => {
          e.preventDefault();
          if (e.target.files && e.target.files[0]) {
            this.handleMasterInventoryFileUpload(e.target.files[0], session);
            e.target.value = '';
          }
        });
      }

      const btnCancelImport = mount.querySelector('#btn-cancel-import');
      const btnConfirmImport = mount.querySelector('#btn-confirm-commit-import');
      if (btnCancelImport) {
        btnCancelImport.addEventListener('click', (e) => {
          e.preventDefault();
          this.stagedMasterItems = null;
          this.activeSubView = 'inv-master';
          this.render();
        });
      }
      if (btnConfirmImport) {
        btnConfirmImport.addEventListener('click', (e) => {
          e.preventDefault();
          this.commitStagedMasterItems(session);
        });
      }

      const btnOpenForm = mount.querySelector('#btn-open-master-form');
      if (btnOpenForm) {
        btnOpenForm.addEventListener('click', (e) => {
          e.preventDefault();
          this.editingMasterItemId = null;
          this.activeSubView = 'inv-master-form';
          this.render();
        });
      }

      const btnDlSample = mount.querySelector('#btn-dl-sample-template');
      if (btnDlSample) {
        btnDlSample.addEventListener('click', (e) => {
          e.preventDefault();
          this.downloadSampleMasterInventoryTemplate();
        });
      }

      const btnExportCsv = mount.querySelector('#btn-export-master-csv');
      if (btnExportCsv) {
        btnExportCsv.addEventListener('click', (e) => {
          e.preventDefault();
          this.exportMasterInventoryToCSV(session);
        });
      }

      const btnBackCat = mount.querySelector('#btn-back-to-catalog');
      const btnFormCancel = mount.querySelector('#btn-form-cancel');
      const btnFormSave = mount.querySelector('#btn-form-save');

      if (btnBackCat) {
        btnBackCat.addEventListener('click', (e) => {
          e.preventDefault();
          this.activeSubView = 'inv-master';
          this.render();
        });
      }

      mount.querySelectorAll('.master-item-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
          e.preventDefault();
          this.selectedMasterItemCode = row.dataset.code;
          this.activeSubView = 'inv-master-detail';
          this.render();
        });
      });

      mount.querySelectorAll('.btn-view-master-detail').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.selectedMasterItemCode = btn.dataset.code;
          this.activeSubView = 'inv-master-detail';
          this.render();
        });
      });

      mount.querySelectorAll('.btn-edit-master-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.editingMasterItemId = btn.dataset.id;
          this.activeSubView = 'inv-master-form';
          this.render();
        });
      });

      const btnBackDetail = mount.querySelector('#btn-back-from-detail');
      if (btnBackDetail) {
        btnBackDetail.addEventListener('click', (e) => {
          e.preventDefault();
          this.activeSubView = 'inv-master';
          this.render();
        });
      }

      const btnEditDetail = mount.querySelector('#btn-edit-from-detail');
      if (btnEditDetail) {
        btnEditDetail.addEventListener('click', (e) => {
          e.preventDefault();
          this.editingMasterItemId = btnEditDetail.dataset.id;
          this.activeSubView = 'inv-master-form';
          this.render();
        });
      }

      if (btnFormCancel) {
        btnFormCancel.addEventListener('click', (e) => {
          e.preventDefault();
          this.activeSubView = 'inv-master';
          this.render();
        });
      }

      if (btnFormSave) {
        btnFormSave.addEventListener('click', (e) => {
          e.preventDefault();
          const itemCode = mount.querySelector('#inp-pg-code').value.trim();
          const itemName = mount.querySelector('#inp-pg-name').value.trim();
          const itemType = mount.querySelector('#inp-pg-type').value;
          const categoryCode = mount.querySelector('#inp-pg-cat').value;
          const baseUom = mount.querySelector('#inp-pg-base-uom').value;
          const purchaseUomRaw = mount.querySelector('#inp-pg-purchase-uom').value;
          const purchaseUom = purchaseUomRaw || baseUom;
          const conversionFactor = parseFloat(mount.querySelector('#inp-pg-factor').value) || 1;
          const defaultLocationCode = mount.querySelector('#inp-pg-def-loc').value;
          const initialStockQty = parseFloat(mount.querySelector('#inp-pg-init-stock') ? mount.querySelector('#inp-pg-init-stock').value : 0) || 0;
          const preferredSupplierCode = mount.querySelector('#inp-pg-pref-sup') ? mount.querySelector('#inp-pg-pref-sup').value : '';
          const lastPurchasePrice = parseFloat(mount.querySelector('#inp-pg-pur-price') ? mount.querySelector('#inp-pg-pur-price').value : 0) || 0;
          const reorderLevel = parseFloat(mount.querySelector('#inp-pg-reorder-lvl') ? mount.querySelector('#inp-pg-reorder-lvl').value : 0) || 0;

          if (!itemName || !itemCode) {
            alert('❌ Please enter a valid Item Name and Item Code.');
            return;
          }

          const baseUnitCost = conversionFactor > 0 ? (lastPurchasePrice / conversionFactor) : lastPurchasePrice;

          const itemPayload = {
            itemCode,
            itemName,
            itemType,
            categoryCode,
            baseUom,
            purchaseUom,
            conversionFactor,
            defaultLocationCode,
            allowedLocationCodes: [defaultLocationCode],
            openingStock: initialStockQty,
            currentStock: initialStockQty,
            preferredSupplierCode,
            defaultSupplierCode: preferredSupplierCode,
            lastPurchasePrice,
            unitValuation: baseUnitCost,
            reorderLevel,
            status: 'ACTIVE'
          };

          if (this.editingMasterItemId) {
            inventoryRepository.update(this.editingMasterItemId, itemPayload, session);
            alert(`🎉 Master Inventory Item "${itemName}" (${itemCode}) updated successfully!`);
          } else {
            const existing = inventoryRepository.getByCode(itemCode, session.tenantId);
            if (existing) {
              alert(`❌ Duplicate Item Code "${itemCode}"! Item Code must be unique.`);
              return;
            }
            inventoryRepository.create(itemPayload, session);
            alert(`🎉 Master Inventory Item "${itemName}" (${itemCode}) created successfully!`);
          }

          this.editingMasterItemId = null;
          this.activeSubView = 'inv-master';
          this.render();
        });
      }

      // PO Actions
      const btnOpenPoForm = mount.querySelector('#btn-open-po-form');
      if (btnOpenPoForm) {
        btnOpenPoForm.addEventListener('click', (e) => {
          e.preventDefault();
          this.poDraftLines = [];
          this.activeSubView = 'inv-po-form';
          this.render();
        });
      }

      mount.querySelectorAll('.btn-po-filter').forEach(btn => {
        btn.addEventListener('click', () => {
          this.poStatusFilter = btn.dataset.status;
          this.render();
        });
      });

      mount.querySelectorAll('.btn-approve-po').forEach(btn => {
        btn.addEventListener('click', () => {
          const poCode = btn.dataset.po;
          purchaseOrderRepository.update(poCode, { status: 'APPROVED', approvedBy: session ? session.employeeName : 'Manager', approvedAt: new Date().toISOString() }, session);
          alert(`✔ Purchase Order ${poCode} Approved! Now available for Goods Receiving.`);
          this.render();
        });
      });

      const btnBackPo = mount.querySelector('#btn-back-to-po-list');
      const btnCancelPo = mount.querySelector('#btn-cancel-po-form');
      [btnBackPo, btnCancelPo].forEach(b => {
        if (b) b.addEventListener('click', () => {
          this.navigateToSubView('inv-po');
        });
      });

      // Dynamic Supplier-Based Item Dropdown Filtering
      const supSel = mount.querySelector('#inp-po-supplier');
      const itemSel = mount.querySelector('#inp-po-line-item');
      const priceInp = mount.querySelector('#inp-po-line-price');
      const filterStatusEl = mount.querySelector('#po-supplier-filter-status');
      const addFeedbackEl = mount.querySelector('#po-add-line-feedback');

      if (supSel && itemSel) {
        const syncPrice = () => {
          const selectedCode = itemSel.value;
          if (selectedCode) {
            const itemObj = inventoryRepository.getByCode(selectedCode, session ? session.tenantId : null);
            if (itemObj && priceInp) {
              priceInp.value = (parseFloat(itemObj.lastPurchasePrice) || 0).toFixed(2);
            }
          }
        };

        const updateItemsForSupplier = () => {
          const selectedSupCode = supSel.value;
          const supName = (supSel.selectedIndex >= 0 && supSel.options[supSel.selectedIndex])
            ? supSel.options[supSel.selectedIndex].text.split(' (')[0]
            : selectedSupCode;

          const allItems = inventoryRepository.getAll(session ? session.tenantId : null);

          // Filter items mapped to selected supplier
          let mapped = allItems.filter(i =>
            i.preferredSupplierCode === selectedSupCode ||
            i.defaultSupplierCode === selectedSupCode
          );

          const isFiltered = mapped.length > 0;
          const displayItems = isFiltered ? mapped : allItems;

          itemSel.innerHTML = displayItems.map(i => `
            <option value="${i.itemCode}">
              ${i.itemName} (${i.itemCode}) — ₹${(parseFloat(i.lastPurchasePrice) || 0).toFixed(2)} / ${i.purchaseUom || i.baseUom || 'KG'}
            </option>
          `).join('');

          if (displayItems.length > 0) {
            itemSel.value = displayItems[0].itemCode;
          }

          if (filterStatusEl) {
            if (isFiltered) {
              filterStatusEl.style.color = 'var(--status-success)';
              filterStatusEl.innerHTML = `✔ Showing ${mapped.length} item(s) mapped to <strong>${supName}</strong>`;
            } else {
              filterStatusEl.style.color = 'var(--status-warning)';
              filterStatusEl.innerHTML = `ℹ️ Showing full catalog (${allItems.length} items) — no specific items mapped to <strong>${supName}</strong>`;
            }
          }

          syncPrice();
        };

        updateItemsForSupplier();
        supSel.addEventListener('change', updateItemsForSupplier);
        itemSel.addEventListener('change', syncPrice);
        itemSel.addEventListener('input', syncPrice);
      }

      // Add PO Line Button & PO Dynamic Form Rendering
      const btnSaveDraft = mount.querySelector('#btn-save-po-draft');
      const btnApproveSubmit = mount.querySelector('#btn-approve-po-submit');

      const savePo = (status) => {
        const supSel = mount.querySelector('#inp-po-supplier');
        const supplierCode = supSel && supSel.value ? supSel.value : 'SUP-001';
        const supplierName = (supSel && supSel.selectedIndex >= 0 && supSel.options[supSel.selectedIndex])
          ? supSel.options[supSel.selectedIndex].text.split(' (')[0]
          : 'Prime Foods';

        const locSel = mount.querySelector('#inp-po-location');
        const destinationLocationCode = locSel && locSel.value ? locSel.value : 'LOC-CHILL';

        const dateInp = mount.querySelector('#inp-po-date');
        const orderDate = dateInp && dateInp.value ? dateInp.value : new Date().toISOString().split('T')[0];

        const delInp = mount.querySelector('#inp-po-del-date');
        const expectedDeliveryDate = delInp && delInp.value ? delInp.value : new Date(Date.now() + 172800000).toISOString().split('T')[0];

        const termsInp = mount.querySelector('#inp-po-terms');
        const paymentTerms = termsInp && termsInp.value ? termsInp.value : 'Net 30 Days';

        if (!this.poDraftLines || !this.poDraftLines.length) {
          alert('❌ Please add at least 1 item line to the Purchase Order.');
          return;
        }

        let subtotal = 0;
        this.poDraftLines.forEach(l => subtotal += (parseFloat(l.orderedQuantity) * parseFloat(l.purchaseUnitPrice)));

        const po = purchaseOrderRepository.create({
          supplierCode,
          supplierName,
          destinationLocationCode,
          orderDate,
          expectedDeliveryDate,
          paymentTerms,
          items: this.poDraftLines,
          subtotal,
          grandTotal: subtotal,
          status
        }, session);

        alert(`🎉 Purchase Order ${po.poNumber} created successfully with status: ${status}!`);
        this.poDraftLines = [];
        this.navigateToSubView('inv-po');
      };

      if (btnSaveDraft) btnSaveDraft.addEventListener('click', () => savePo('DRAFT'));
      if (btnApproveSubmit) btnApproveSubmit.addEventListener('click', () => savePo('APPROVED'));

      const btnAddPoLine = mount.querySelector('#btn-add-po-line');
      if (btnAddPoLine) {
        this.poDraftLines = this.poDraftLines || [];
        const renderPoLines = () => {
          const tbody = mount.querySelector('#po-lines-tbody');
          const grandTotalEl = mount.querySelector('#po-grand-total-display');
          if (!tbody) return;

          let grandTotal = 0;
          tbody.innerHTML = this.poDraftLines.map((l, idx) => {
            const lineTot = l.orderedQuantity * l.purchaseUnitPrice;
            grandTotal += lineTot;
            return `
              <tr style="border-bottom:1px solid var(--border-subtle); background:rgba(16,185,129,0.04);">
                <td style="padding:8px; font-weight:600;">${l.itemName} <span style="font-size:0.75rem; color:var(--text-muted);">(${l.itemCode})</span></td>
                <td style="padding:8px;"><span class="badge badge-info">${l.purchaseUom}</span></td>
                <td style="padding:8px; font-weight:700;">${l.orderedQuantity}</td>
                <td style="padding:8px;">₹${l.purchaseUnitPrice.toFixed(2)}</td>
                <td style="padding:8px; font-weight:700; color:var(--status-success);">₹${lineTot.toFixed(2)}</td>
                <td style="padding:8px; text-align:right;">
                  <button type="button" class="btn-remove-po-line" data-idx="${idx}" style="padding:2px 8px; font-size:0.75rem; background:var(--status-danger); color:#fff; border:none; border-radius:4px; cursor:pointer;">✕ Remove</button>
                </td>
              </tr>
            `;
          }).join('');

          if (grandTotalEl) grandTotalEl.textContent = `₹${grandTotal.toFixed(2)}`;

          tbody.querySelectorAll('.btn-remove-po-line').forEach(btn => {
            btn.addEventListener('click', () => {
              const i = parseInt(btn.dataset.idx, 10);
              this.poDraftLines.splice(i, 1);
              renderPoLines();
            });
          });
        };

        // Render initially
        renderPoLines();

        btnAddPoLine.addEventListener('click', () => {
          const currentItemSel = mount.querySelector('#inp-po-line-item');
          const currentQtyInp = mount.querySelector('#inp-po-line-qty');
          const currentPriceInp = mount.querySelector('#inp-po-line-price');

          if (!currentItemSel || !currentItemSel.value) {
            alert('❌ Please select an item from the dropdown.');
            return;
          }

          const selectedCode = currentItemSel.value;
          const itemObj = inventoryRepository.getByCode(selectedCode, session ? session.tenantId : null);

          if (!itemObj) {
            alert(`❌ Master item ${selectedCode} not found.`);
            return;
          }

          const itemCode = itemObj.itemCode;
          const itemName = itemObj.itemName;
          const purchaseUom = itemObj.purchaseUom || itemObj.baseUom || 'KG';
          const qty = parseFloat(currentQtyInp ? currentQtyInp.value : 10) || 10;
          const price = parseFloat(currentPriceInp ? currentPriceInp.value : itemObj.lastPurchasePrice) || (itemObj.lastPurchasePrice || 0);

          if (qty <= 0) {
            alert('❌ Quantity must be greater than 0.');
            return;
          }

          this.poDraftLines.push({
            itemCode,
            itemName,
            purchaseUom,
            orderedQuantity: qty,
            purchaseUnitPrice: price,
            lineTotal: qty * price
          });

          renderPoLines();

          if (addFeedbackEl) {
            addFeedbackEl.style.color = 'var(--status-success)';
            addFeedbackEl.innerHTML = `✅ Added <strong>${qty} ${purchaseUom}</strong> of <strong>${itemName}</strong> to Order! (Total Items: ${this.poDraftLines.length})`;
            setTimeout(() => { addFeedbackEl.innerHTML = ''; }, 4000);
          }
        });
      }

      // GRN Actions
      const btnOpenOpeningGrn = mount.querySelector('#btn-open-opening-stock-grn');
      if (btnOpenOpeningGrn) {
        btnOpenOpeningGrn.addEventListener('click', () => {
          this.grnDocumentType = 'OPENING_STOCK';
          this.selectedPoForGrn = null;
          this.activeSubView = 'inv-grn-form';
          this.render();
        });
      }

      mount.querySelectorAll('.btn-receive-po-grn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.grnDocumentType = 'PURCHASE_RECEIPT';
          this.selectedPoForGrn = btn.dataset.po;
          this.activeSubView = 'inv-grn-form';
          this.render();
        });
      });

      const btnBackGrn = mount.querySelector('#btn-back-to-grn-list');
      if (btnBackGrn) {
        btnBackGrn.addEventListener('click', () => {
          this.activeSubView = 'inv-grn';
          this.render();
        });
      }

      // Dynamic GRN Inspection Grid Handler & Commit Posting
      const btnCommitGrn = mount.querySelector('#btn-commit-post-grn');
      if (btnCommitGrn) {
        const tbody = mount.querySelector('#grn-inspection-tbody');
        const lines = this.currentGrnLines || [];
        const isOpening = this.grnDocumentType === 'OPENING_STOCK';
        const items = inventoryRepository.getAll(session ? session.tenantId : null);

        if (isOpening && lines.length === 0) {
          items.forEach(mi => {
            lines.push({
              itemCode: mi.itemCode,
              itemName: mi.itemName,
              purchaseUom: mi.purchaseUom || mi.baseUom || 'KG',
              baseUom: mi.baseUom || 'KG',
              conversionFactor: mi.conversionFactor || 1,
              orderedQty: 10,
              receivedQty: 10,
              acceptedQty: 10,
              rejectedQty: 0,
              rejectionReason: 'None',
              batchNumber: `BATCH-OPEN-${mi.itemCode}`,
              expiryDate: new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0],
              actualPurchaseUnitPrice: mi.lastPurchasePrice || 0
            });
          });
          this.currentGrnLines = lines;
        }

        const renderGrnGrid = () => {
          if (!tbody) return;
          tbody.innerHTML = lines.map((l, idx) => `
            <tr style="border-bottom:1px solid var(--border-subtle);">
              <td style="padding:6px; font-weight:600;">${l.itemName} <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${l.itemCode}</div></td>
              <td style="padding:6px;"><span class="badge badge-info">${l.purchaseUom}</span></td>
              <td style="padding:6px;">${l.orderedQty}</td>
              <td style="padding:6px;"><input type="number" step="0.01" class="grn-rec-qty" data-idx="${idx}" value="${l.receivedQty}" style="width:70px; font-size:0.8rem; padding:4px;"></td>
              <td style="padding:6px;"><input type="number" step="0.01" class="grn-acc-qty" data-idx="${idx}" value="${l.acceptedQty}" style="width:70px; font-size:0.8rem; padding:4px;"></td>
              <td style="padding:6px; font-weight:700; color:${l.rejectedQty > 0 ? 'var(--status-danger)' : 'var(--text-muted)'};" id="grn-rej-val-${idx}">${l.rejectedQty}</td>
              <td style="padding:6px;">
                <select class="grn-rej-reason" data-idx="${idx}" style="font-size:0.78rem; padding:4px;">
                  <option value="None" ${l.rejectionReason === 'None' ? 'selected' : ''}>None</option>
                  <option value="Damaged Packaging" ${l.rejectionReason === 'Damaged Packaging' ? 'selected' : ''}>Damaged Packaging</option>
                  <option value="Spoiled / Quality Breach" ${l.rejectionReason === 'Spoiled / Quality Breach' ? 'selected' : ''}>Spoiled / Quality Breach</option>
                  <option value="Wrong Specifications" ${l.rejectionReason === 'Wrong Specifications' ? 'selected' : ''}>Wrong Specs</option>
                </select>
              </td>
              <td style="padding:6px;"><input type="text" class="grn-batch" data-idx="${idx}" value="${l.batchNumber}" style="width:100px; font-size:0.78rem; padding:4px;"></td>
              <td style="padding:6px;"><input type="date" class="grn-exp" data-idx="${idx}" value="${l.expiryDate}" style="font-size:0.78rem; padding:4px;"></td>
              <td style="padding:6px;"><input type="number" step="0.01" class="grn-price" data-idx="${idx}" value="${l.actualPurchaseUnitPrice}" style="width:80px; font-size:0.8rem; padding:4px;"></td>
            </tr>
          `).join('');

          tbody.querySelectorAll('.grn-rec-qty').forEach(inp => {
            inp.addEventListener('input', (e) => {
              const i = parseInt(e.target.dataset.idx, 10);
              lines[i].receivedQty = parseFloat(e.target.value) || 0;
              lines[i].rejectedQty = Math.max(0, lines[i].receivedQty - lines[i].acceptedQty);
              const rejEl = tbody.querySelector(`#grn-rej-val-${i}`);
              if (rejEl) rejEl.textContent = lines[i].rejectedQty;
            });
          });

          tbody.querySelectorAll('.grn-acc-qty').forEach(inp => {
            inp.addEventListener('input', (e) => {
              const i = parseInt(e.target.dataset.idx, 10);
              lines[i].acceptedQty = parseFloat(e.target.value) || 0;
              lines[i].rejectedQty = Math.max(0, lines[i].receivedQty - lines[i].acceptedQty);
              const rejEl = tbody.querySelector(`#grn-rej-val-${i}`);
              if (rejEl) rejEl.textContent = lines[i].rejectedQty;
            });
          });

          tbody.querySelectorAll('.grn-rej-reason').forEach(sel => {
            sel.addEventListener('change', (e) => {
              const i = parseInt(e.target.dataset.idx, 10);
              lines[i].rejectionReason = e.target.value;
            });
          });

          tbody.querySelectorAll('.grn-batch').forEach(inp => {
            inp.addEventListener('input', (e) => {
              const i = parseInt(e.target.dataset.idx, 10);
              lines[i].batchNumber = e.target.value;
            });
          });

          tbody.querySelectorAll('.grn-exp').forEach(inp => {
            inp.addEventListener('input', (e) => {
              const i = parseInt(e.target.dataset.idx, 10);
              lines[i].expiryDate = e.target.value;
            });
          });

          tbody.querySelectorAll('.grn-price').forEach(inp => {
            inp.addEventListener('input', (e) => {
              const i = parseInt(e.target.dataset.idx, 10);
              lines[i].actualPurchaseUnitPrice = parseFloat(e.target.value) || 0;
            });
          });
        };

        renderGrnGrid();

        btnCommitGrn.addEventListener('click', () => {
          const receivingLocationCode = mount.querySelector('#inp-grn-location').value;
          const receivedDate = mount.querySelector('#inp-grn-date').value;
          const vendorInvoiceNo = mount.querySelector('#inp-grn-invoice').value;
          const deliveryChallanNo = mount.querySelector('#inp-grn-challan').value;

          if (!lines.length) {
            alert('❌ No line items found to post GRN.');
            return;
          }

          const res = goodsReceiptRepository.postGRN({
            documentType: isOpening ? 'OPENING_STOCK' : 'PURCHASE_RECEIPT',
            poNumber: this.selectedPoForGrn || (isOpening ? 'DIRECT_RECEIPT' : ''),
            receivingLocationCode,
            receivedDate,
            vendorInvoiceNo,
            deliveryChallanNo,
            lines
          }, session);

          if (res.success) {
            alert(`🎉 GRN ${res.grn.grnNumber} Posted Successfully!\n🔒 Stock Ledger & Store Balances updated cleanly at ${receivingLocationCode}.`);
            this.currentGrnLines = null;
            this.selectedPoForGrn = null;
            this.activeSubView = 'inv-grn';
            this.render();
          }
        });
      }

      // Transfer Events
      const btnOpenTrfModal = mount.querySelector('#btn-open-transfer-modal');
      const trfPanel = mount.querySelector('#transfer-form-panel');
      if (btnOpenTrfModal && trfPanel) {
        btnOpenTrfModal.addEventListener('click', () => {
          trfPanel.style.display = trfPanel.style.display === 'none' ? 'block' : 'none';
        });
      }
      const btnCancelTrf = mount.querySelector('#btn-cancel-trf-form');
      if (btnCancelTrf && trfPanel) {
        btnCancelTrf.addEventListener('click', () => { trfPanel.style.display = 'none'; });
      }

      const btnAddTrfLine = mount.querySelector('#btn-add-trf-line');
      if (btnAddTrfLine) {
        this.trfDraftLines = this.trfDraftLines || [];
        const renderTrfLines = () => {
          const tbody = mount.querySelector('#trf-lines-tbody');
          if (!tbody) return;
          tbody.innerHTML = this.trfDraftLines.map((l, idx) => `
            <tr style="border-bottom:1px solid var(--border-subtle);">
              <td style="padding:6px; font-weight:600;">${l.itemName} (${l.itemCode})</td>
              <td style="padding:6px; font-weight:700;">${l.quantity} ${l.baseUom}</td>
              <td style="padding:6px; text-align:right;">
                <button type="button" class="btn-rm-trf" data-idx="${idx}" style="padding:2px 6px; font-size:0.75rem; background:var(--status-danger); color:#fff; border:none; border-radius:4px; cursor:pointer;">✕</button>
              </td>
            </tr>
          `).join('');

          tbody.querySelectorAll('.btn-rm-trf').forEach(b => {
            b.addEventListener('click', () => {
              this.trfDraftLines.splice(parseInt(b.dataset.idx, 10), 1);
              renderTrfLines();
            });
          });
        };
        renderTrfLines();

        btnAddTrfLine.addEventListener('click', () => {
          const itemSel = mount.querySelector('#inp-trf-line-item');
          const qtyInp = mount.querySelector('#inp-trf-line-qty');
          if (!itemSel) return;
          const opt = itemSel.options[itemSel.selectedIndex];
          const itemCode = opt.value;
          const itemName = opt.text.split(' (')[0];
          const qty = parseFloat(qtyInp ? qtyInp.value : 10) || 10;
          const mi = inventoryRepository.getByCode(itemCode, session ? session.tenantId : null) || {};

          this.trfDraftLines.push({ itemCode, itemName, quantity: qty, baseUom: mi.baseUom || 'KG' });
          renderTrfLines();
        });

        const btnCommitTrf = mount.querySelector('#btn-commit-trf');
        if (btnCommitTrf) {
          btnCommitTrf.addEventListener('click', () => {
            const fromLoc = mount.querySelector('#inp-trf-from-loc').value;
            const toLoc = mount.querySelector('#inp-trf-to-loc').value;
            const trfDate = mount.querySelector('#inp-trf-date').value;

            if (!this.trfDraftLines.length) {
              alert('❌ Please add at least 1 line item to the transfer.');
              return;
            }

            const res = stockTransferRepository.postTransfer({
              fromLocationCode: fromLoc,
              toLocationCode: toLoc,
              transferDate: trfDate,
              lines: this.trfDraftLines
            }, session);

            if (res.success) {
              alert(`🎉 Stock Transfer ${res.transfer.transferNo} posted cleanly!\n🔒 Paired ledger entries created for ${fromLoc} -> ${toLoc}.`);
              this.trfDraftLines = [];
              this.activeSubView = 'inv-transfers';
              this.render();
            } else {
              alert(res.error);
            }
          });
        }
      }

      // Issue Events
      const btnOpenIssModal = mount.querySelector('#btn-open-issue-modal');
      const issPanel = mount.querySelector('#issue-form-panel');
      if (btnOpenIssModal && issPanel) {
        btnOpenIssModal.addEventListener('click', () => {
          issPanel.style.display = issPanel.style.display === 'none' ? 'block' : 'none';
        });
      }
      const btnCancelIss = mount.querySelector('#btn-cancel-iss-form');
      if (btnCancelIss && issPanel) {
        btnCancelIss.addEventListener('click', () => { issPanel.style.display = 'none'; });
      }

      const btnAddIssLine = mount.querySelector('#btn-add-iss-line');
      if (btnAddIssLine) {
        this.issDraftLines = this.issDraftLines || [];
        const renderIssLines = () => {
          const tbody = mount.querySelector('#iss-lines-tbody');
          if (!tbody) return;
          tbody.innerHTML = this.issDraftLines.map((l, idx) => `
            <tr style="border-bottom:1px solid var(--border-subtle);">
              <td style="padding:6px; font-weight:600;">${l.itemName} (${l.itemCode})</td>
              <td style="padding:6px; font-weight:700;">${l.quantity} ${l.baseUom}</td>
              <td style="padding:6px; text-align:right;">
                <button type="button" class="btn-rm-iss" data-idx="${idx}" style="padding:2px 6px; font-size:0.75rem; background:var(--status-danger); color:#fff; border:none; border-radius:4px; cursor:pointer;">✕</button>
              </td>
            </tr>
          `).join('');
          tbody.querySelectorAll('.btn-rm-iss').forEach(b => {
            b.addEventListener('click', () => {
              this.issDraftLines.splice(parseInt(b.dataset.idx, 10), 1);
              renderIssLines();
            });
          });
        };
        renderIssLines();

        btnAddIssLine.addEventListener('click', () => {
          const itemSel = mount.querySelector('#inp-iss-line-item');
          const qtyInp = mount.querySelector('#inp-iss-line-qty');
          if (!itemSel) return;
          const opt = itemSel.options[itemSel.selectedIndex];
          const itemCode = opt.value;
          const itemName = opt.text.split(' (')[0];
          const qty = parseFloat(qtyInp ? qtyInp.value : 5) || 5;
          const mi = inventoryRepository.getByCode(itemCode, session ? session.tenantId : null) || {};

          this.issDraftLines.push({ itemCode, itemName, quantity: qty, baseUom: mi.baseUom || 'KG' });
          renderIssLines();
        });

        const btnCommitIss = mount.querySelector('#btn-commit-iss');
        if (btnCommitIss) {
          btnCommitIss.addEventListener('click', () => {
            const fromLoc = mount.querySelector('#inp-iss-from-loc').value;
            const dept = mount.querySelector('#inp-iss-dept').value;
            const person = mount.querySelector('#inp-iss-person').value;
            const issDate = mount.querySelector('#inp-iss-date') ? mount.querySelector('#inp-iss-date').value : new Date().toISOString().split('T')[0];

            if (!this.issDraftLines.length) {
              alert('❌ Please add at least 1 line item to the issue.');
              return;
            }

            const res = stockIssueRepository.postIssue({
              fromLocationCode: fromLoc,
              issuedToDepartment: dept,
              issuedToPerson: person,
              issueDate: issDate,
              lines: this.issDraftLines
            }, session);

            if (res.success) {
              alert(`🎉 Stock Issue ${res.issue.issueNo} posted!\n🔒 Consumption ledgered for ${dept} at ${fromLoc}.`);
              this.issDraftLines = [];
              this.activeSubView = 'inv-issues';
              this.render();
            } else {
              alert(res.error);
            }
          });
        }
      }

      // Adjustment Events
      const btnOpenAdjModal = mount.querySelector('#btn-open-adj-modal');
      const adjPanel = mount.querySelector('#adj-form-panel');
      if (btnOpenAdjModal && adjPanel) {
        btnOpenAdjModal.addEventListener('click', () => {
          adjPanel.style.display = adjPanel.style.display === 'none' ? 'block' : 'none';
        });
      }
      const btnCancelAdj = mount.querySelector('#btn-cancel-adj-form');
      if (btnCancelAdj && adjPanel) {
        btnCancelAdj.addEventListener('click', () => { adjPanel.style.display = 'none'; });
      }

      const btnAddAdjLine = mount.querySelector('#btn-add-adj-line');
      if (btnAddAdjLine) {
        this.adjDraftLines = this.adjDraftLines || [];
        const renderAdjLines = () => {
          const tbody = mount.querySelector('#adj-lines-tbody');
          if (!tbody) return;
          tbody.innerHTML = this.adjDraftLines.map((l, idx) => `
            <tr style="border-bottom:1px solid var(--border-subtle);">
              <td style="padding:6px; font-weight:600;">${l.itemName} (${l.itemCode})</td>
              <td style="padding:6px;"><span class="badge ${l.adjustmentType === 'DECREASE' ? 'badge-danger' : 'badge-success'}">${l.adjustmentType}</span></td>
              <td style="padding:6px; font-weight:700;">${l.quantity} ${l.baseUom}</td>
              <td style="padding:6px; text-align:right;">
                <button type="button" class="btn-rm-adj" data-idx="${idx}" style="padding:2px 6px; font-size:0.75rem; background:var(--status-danger); color:#fff; border:none; border-radius:4px; cursor:pointer;">✕</button>
              </td>
            </tr>
          `).join('');
          tbody.querySelectorAll('.btn-rm-adj').forEach(b => {
            b.addEventListener('click', () => {
              this.adjDraftLines.splice(parseInt(b.dataset.idx, 10), 1);
              renderAdjLines();
            });
          });
        };
        renderAdjLines();

        btnAddAdjLine.addEventListener('click', () => {
          const itemSel = mount.querySelector('#inp-adj-line-item');
          const typeSel = mount.querySelector('#inp-adj-line-type');
          const qtyInp = mount.querySelector('#inp-adj-line-qty');
          if (!itemSel) return;
          const opt = itemSel.options[itemSel.selectedIndex];
          const itemCode = opt.value;
          const itemName = opt.text.split(' (')[0];
          const adjType = typeSel.value;
          const qty = parseFloat(qtyInp ? qtyInp.value : 2) || 2;
          const mi = inventoryRepository.getByCode(itemCode, session ? session.tenantId : null) || {};

          this.adjDraftLines.push({ itemCode, itemName, adjustmentType: adjType, quantity: qty, baseUom: mi.baseUom || 'KG' });
          renderAdjLines();
        });

        const btnCommitAdj = mount.querySelector('#btn-commit-adj');
        if (btnCommitAdj) {
          btnCommitAdj.addEventListener('click', () => {
            const locCode = mount.querySelector('#inp-adj-loc').value;
            const reasonCode = mount.querySelector('#inp-adj-reason').value;
            const adjDate = mount.querySelector('#inp-adj-date').value;

            if (!this.adjDraftLines.length) {
              alert('❌ Please add at least 1 line item to the adjustment.');
              return;
            }

            const res = stockAdjustmentRepository.postAdjustment({
              locationCode: locCode,
              reasonCode,
              adjustmentDate: adjDate,
              lines: this.adjDraftLines
            }, session);

            if (res.success) {
              alert(`🎉 Stock Adjustment ${res.adjustment.adjustmentNo} posted!\n🔒 Controlled adjustment (${reasonCode}) ledgered for ${locCode}.`);
              this.adjDraftLines = [];
              this.activeSubView = 'inv-adjustments';
              this.render();
            } else {
              alert(res.error);
            }
          });
        }
      }

      // Count Events
      const btnOpenCntModal = mount.querySelector('#btn-open-count-modal');
      const cntPanel = mount.querySelector('#count-form-panel');
      if (btnOpenCntModal && cntPanel) {
        btnOpenCntModal.addEventListener('click', () => {
          cntPanel.style.display = cntPanel.style.display === 'none' ? 'block' : 'none';
          if (cntPanel.style.display === 'block') {
            const locSel = mount.querySelector('#inp-cnt-loc');
            const tbody = mount.querySelector('#cnt-grid-tbody');
            const items = inventoryRepository.getAll(session ? session.tenantId : null);
            const balances = offlineStore.getCollection('stock_balances', session ? session.tenantId : null) || [];

            const renderCntGrid = () => {
              const locCode = locSel.value;
              this.cntLines = items.map(mi => {
                const bal = balances.find(b => b.itemCode === mi.itemCode && b.locationCode === locCode);
                const sysQty = bal ? (parseFloat(bal.quantity) || 0) : 0;
                return {
                  itemCode: mi.itemCode,
                  itemName: mi.itemName,
                  systemQuantity: sysQty,
                  physicalQuantity: sysQty,
                  baseUom: mi.baseUom || 'KG'
                };
              });

              tbody.innerHTML = this.cntLines.map((l, idx) => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:6px; font-weight:600;">${l.itemName} <span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">(${l.itemCode})</span></td>
                  <td style="padding:6px; font-weight:700;">${l.systemQuantity.toFixed(2)} ${l.baseUom}</td>
                  <td style="padding:6px;"><input type="number" step="0.01" class="cnt-phys-input" data-idx="${idx}" value="${l.physicalQuantity}" style="width:80px; font-size:0.8rem; padding:4px;"></td>
                  <td style="padding:6px; font-weight:700;" id="cnt-var-val-${idx}">0.00 ${l.baseUom}</td>
                </tr>
              `).join('');

              tbody.querySelectorAll('.cnt-phys-input').forEach(inp => {
                inp.addEventListener('input', (e) => {
                  const i = parseInt(e.target.dataset.idx, 10);
                  this.cntLines[i].physicalQuantity = parseFloat(e.target.value) || 0;
                  const diff = this.cntLines[i].physicalQuantity - this.cntLines[i].systemQuantity;
                  const varEl = tbody.querySelector(`#cnt-var-val-${i}`);
                  if (varEl) {
                    varEl.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} ${this.cntLines[i].baseUom}`;
                    varEl.style.color = Math.abs(diff) > 0.001 ? (diff < 0 ? 'var(--status-danger)' : 'var(--status-success)') : 'var(--text-muted)';
                  }
                });
              });
            };

            renderCntGrid();
            locSel.addEventListener('change', renderCntGrid);
          }
        });
      }
      const btnCancelCnt = mount.querySelector('#btn-cancel-cnt-form');
      if (btnCancelCnt && cntPanel) {
        btnCancelCnt.addEventListener('click', () => { cntPanel.style.display = 'none'; });
      }

      const btnCommitCnt = mount.querySelector('#btn-commit-cnt');
      if (btnCommitCnt) {
        btnCommitCnt.addEventListener('click', () => {
          const locCode = mount.querySelector('#inp-cnt-loc').value;
          const cntDate = mount.querySelector('#inp-cnt-date').value;

          const res = stockCountRepository.reconcileCount({
            locationCode: locCode,
            countDate: cntDate,
            lines: this.cntLines || []
          }, session);

          if (res.success) {
            alert(`🎉 Physical Stock Audit ${res.countRecord.countNo} Reconciled Successfully!\n🔒 Automatic ledger variance adjustment posted for ${locCode}.`);
            this.cntLines = null;
            this.activeSubView = 'inv-counts';
            this.render();
          }
        });
      }

      // Alert PO Generator Trigger
      mount.querySelectorAll('.btn-alert-create-po').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.dataset.code;
          const mi = inventoryRepository.getByCode(code, session ? session.tenantId : null);
          if (mi) {
            this.poDraftLines = [{
              itemCode: mi.itemCode,
              itemName: mi.itemName,
              purchaseUom: mi.purchaseUom || mi.baseUom || 'KG',
              orderedQuantity: mi.reorderLevel || 10,
              purchaseUnitPrice: mi.lastPurchasePrice || 0,
              lineTotal: (mi.reorderLevel || 10) * (mi.lastPurchasePrice || 0)
            }];
            this.activeSubView = 'inv-po-form';
            this.render();
          }
        });
      });

      // Ledger Filter Change Event
      const selLedgerType = mount.querySelector('#inp-ledger-filter-type');
      if (selLedgerType) {
        selLedgerType.addEventListener('change', (e) => {
          this.ledgerFilterType = e.target.value;
          this.render();
        });
      }
    }

    renderInventoryTabBody(tabKey, items, categories, uoms, locations, suppliers, requests, history, session, balances = []) {
      if (tabKey === 'inv-dashboard' || tabKey === 'dashboard') {
        const tenantId = session ? session.tenantId : '';
        const activeBalances = balances.filter(b => (parseFloat(b.quantity) || 0) !== 0 && (!tenantId || b.tenantId === tenantId));
        const lowStock = items.map(i => {
          const itemBalances = activeBalances.filter(b => b.itemCode === i.itemCode);
          const currentQty = itemBalances.length
            ? itemBalances.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0)
            : (parseFloat(i.currentStock !== undefined ? i.currentStock : i.openingStock) || 0);
          return { ...i, currentQty };
        }).filter(i => i.currentQty <= (parseFloat(i.reorderLevel) || 0));
        const pendingReqs = requests.filter(r => r.status === 'PENDING');
        const locationSnapshots = locations.map(loc => {
          const locBalances = activeBalances.filter(b => b.locationCode === loc.locationCode);
          const locationValue = locBalances.reduce((sum, b) => sum + (parseFloat(b.valuation) || 0), 0);
          const itemCount = new Set(locBalances.map(b => b.itemCode)).size;
          const lastUpdated = locBalances.reduce((latest, b) => {
            const stamp = b.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0;
            return stamp > latest ? stamp : latest;
          }, 0);
          return { ...loc, locBalances, locationValue, itemCount, lastUpdated };
        }).sort((a, b) => b.locationValue - a.locationValue);
        const itemStockRows = activeBalances.map(b => {
          const item = items.find(i => i.itemCode === b.itemCode) || {};
          const loc = locations.find(l => l.locationCode === b.locationCode) || {};
          return {
            itemCode: b.itemCode,
            itemName: item.itemName || b.itemCode,
            categoryCode: item.categoryCode || '--',
            locationCode: b.locationCode,
            locationName: loc.locationName || b.locationCode,
            quantity: parseFloat(b.quantity) || 0,
            baseUom: b.baseUom || item.baseUom || '',
            valuation: parseFloat(b.valuation) || 0,
            lastUpdatedAt: b.lastUpdatedAt
          };
        }).sort((a, b) => b.valuation - a.valuation).slice(0, 12);

        return `
          <h3>Inventory Manager Dashboard</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Daily operational hub, live store balances, and stock health status.</p>

          <div class="card" style="background:var(--bg-surface-2); padding:18px; margin-bottom:20px; border-left:4px solid var(--accent-primary);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
              <div>
                <h4 style="margin:0; color:var(--accent-primary);">Location-wise Live Inventory</h4>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-top:2px;">Bird's-eye view sourced from live stock_balances updated by GRN, transfers, issues, counts, and adjustments.</p>
              </div>
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="badge badge-success" style="font-size:0.78rem;">${activeBalances.length} active store balances</span>
                <button type="button" class="btn-primary btn-subtab" data-subtab="inv-live-stock" style="font-size:0.8rem; padding:6px 14px;">
                  🔍 View Detailed Live Inventory →
                </button>
              </div>
            </div>

            ${activeBalances.length ? `
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:18px;">
                ${locationSnapshots.map(l => `
                  <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:6px; padding:14px;">
                    <div style="display:flex; justify-content:space-between; gap:8px; align-items:start;">
                      <div>
                        <div style="font-weight:700;">${l.locationName || l.locationCode}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${l.locationCode} ${l.locationType ? '- ' + l.locationType : ''}</div>
                      </div>
                      <span class="badge ${l.itemCount ? 'badge-success' : 'badge-secondary'}">${l.itemCount} items</span>
                    </div>
                    <div style="font-size:1.25rem; font-weight:700; color:var(--status-success); margin-top:10px;">Rs. ${l.locationValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">${l.lastUpdated ? 'Updated ' + new Date(l.lastUpdated).toLocaleString() : 'No posted stock yet'}</div>
                  </div>
                `).join('')}
              </div>

              <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
                  <thead>
                    <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-1);">
                      <th style="padding:9px;">Item</th>
                      <th style="padding:9px;">Location</th>
                      <th style="padding:9px;">Qty On Hand</th>
                      <th style="padding:9px;">Valuation</th>
                      <th style="padding:9px;">Last Movement</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemStockRows.map(r => `
                      <tr style="border-bottom:1px solid var(--border-subtle);">
                        <td style="padding:9px; font-weight:700;">${r.itemName}<div style="font-size:0.72rem; color:var(--text-muted); font-family:monospace;">${r.itemCode} - ${r.categoryCode}</div></td>
                        <td style="padding:9px;"><span class="badge badge-info">${r.locationName} (${r.locationCode})</span></td>
                        <td style="padding:9px; font-weight:700; color:var(--status-success);">${r.quantity.toFixed(3)} ${r.baseUom}</td>
                        <td style="padding:9px; font-weight:700;">Rs. ${r.valuation.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                        <td style="padding:9px; color:var(--text-muted);">${r.lastUpdatedAt ? new Date(r.lastUpdatedAt).toLocaleString() : '--'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div style="padding:22px; text-align:center; color:var(--text-muted); background:var(--bg-surface-1); border-radius:6px;">
                No live stock balances yet. Post a GRN or opening stock receipt and this view will populate by receiving location.
              </div>
            `}
          </div>
          
          <div class="grid-2col-responsive">
            <div>
              <div style="background:var(--bg-surface-2); padding:16px; border-radius:8px; border:1px solid var(--border-subtle); margin-bottom:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <h4 style="margin:0;">✅ Pending Inter-Workspace Inventory Requests (${pendingReqs.length})</h4>
                  <span class="badge badge-warning">Kitchen & Bar Requests</span>
                </div>
                <div style="margin-top:10px;">
                  ${pendingReqs.length ? pendingReqs.map(r => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:12px; border-radius:6px; margin-top:8px;">
                      <div>
                        <div style="font-weight:700;">${r.itemName} (${r.suggestedCategory})</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">Requested by <strong>${r.requestedBy}</strong> (${r.workspace}) • UOM: ${r.suggestedUom}</div>
                      </div>
                      <button class="btn-primary btn-approve-req" data-id="${r.requestId}" data-name="${r.itemName}" data-cat="${r.suggestedCategory}" data-uom="${r.suggestedUom}" style="font-size:0.8rem; padding:6px 14px;">
                        ✔ Approve & Create Master Item
                      </button>
                    </div>
                  `).join('') : `<div style="color:var(--text-muted); padding:12px;">✔ No pending inventory requests.</div>`}
                </div>
              </div>

              <h4>Low Stock Alerts (${lowStock.length})</h4>
              <div style="margin-top:10px;">
                ${lowStock.length ? `
                  <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                    <thead>
                      <tr style="border-bottom:1px solid var(--border-subtle); text-align:left;">
                        <th style="padding:8px;">Code</th><th style="padding:8px;">Item Name</th><th style="padding:8px;">Type</th><th style="padding:8px;">Stock</th><th style="padding:8px;">Reorder Level</th><th style="padding:8px;">Default Supplier</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${lowStock.map(i => `
                        <tr style="border-bottom:1px solid var(--border-subtle);">
                          <td style="padding:8px; font-weight:600;">${i.itemCode}</td>
                          <td style="padding:8px;">${i.itemName}</td>
                          <td style="padding:8px;"><span class="badge badge-warning">${i.itemType}</span></td>
                          <td style="padding:8px; font-weight:700; color:var(--status-danger);">${i.currentQty.toFixed(2)} ${i.baseUom}</td>
                          <td style="padding:8px;">${i.reorderLevel} ${i.baseUom}</td>
                          <td style="padding:8px;">${i.defaultSupplierCode}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                ` : `<div style="color:var(--text-muted); padding:16px; background:var(--bg-surface-2); border-radius:6px;">✔ All stock levels normal.</div>`}
              </div>
            </div>

            <div>
              <div class="card" style="background:var(--bg-surface-2);">
                <h4>Category Breakdown</h4>
                <div class="flex-col gap-xs" style="margin-top:10px; font-size:0.85rem;">
                  ${categories.map(c => {
          const count = items.filter(i => i.categoryCode === c.categoryCode).length;
          return `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border-subtle);">
                      <span>${c.categoryName}</span><span style="font-weight:700;">${count} items</span>
                    </div>`;
        }).join('')}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      if (tabKey === 'inv-live-stock' || tabKey === 'inv-live-balances') {
        const tenantId = session ? session.tenantId : '';
        const activeBalances = balances.filter(b => (!tenantId || b.tenantId === tenantId));

        let stockLines = [];
        if (activeBalances.length > 0) {
          stockLines = activeBalances.map(b => {
            const item = items.find(i => i.itemCode === b.itemCode) || {};
            const loc = locations.find(l => l.locationCode === b.locationCode) || {};
            const qty = parseFloat(b.quantity) || 0;
            const factor = parseFloat(item.conversionFactor) || 1;
            const purPrice = parseFloat(item.lastPurchasePrice) || 0;
            const unitCost = parseFloat(b.unitCost !== undefined ? b.unitCost : (item.unitValuation || (factor > 0 ? purPrice / factor : purPrice) || 0));
            const valuation = b.valuation !== undefined ? parseFloat(b.valuation) : (qty * unitCost);
            const reorderLevel = parseFloat(item.reorderLevel) || 0;

            let status = 'IN_STOCK';
            if (qty <= 0) {
              status = 'OUT_OF_STOCK';
            } else if (qty <= reorderLevel) {
              status = 'LOW_STOCK';
            }

            return {
              id: b.id || `${b.itemCode}_${b.locationCode}`,
              itemCode: b.itemCode,
              itemName: item.itemName || b.itemCode,
              categoryCode: item.categoryCode || 'UNASSIGNED',
              locationCode: b.locationCode,
              locationName: loc.locationName || b.locationCode,
              locationType: loc.locationType || 'Storage',
              quantity: qty,
              baseUom: b.baseUom || item.baseUom || 'PCS',
              unitCost: unitCost,
              valuation: valuation,
              reorderLevel: reorderLevel,
              status: status,
              lastUpdatedAt: b.lastUpdatedAt || b.updatedAt || ''
            };
          });
        } else {
          stockLines = items.map(i => {
            const qty = parseFloat(i.currentStock !== undefined ? i.currentStock : (i.openingStock || 0));
            const factor = parseFloat(i.conversionFactor) || 1;
            const purPrice = parseFloat(i.lastPurchasePrice) || 0;
            const unitCost = parseFloat(i.unitValuation) || (factor > 0 ? (purPrice / factor) : purPrice) || 0;
            const valuation = qty * unitCost;
            const reorderLevel = parseFloat(i.reorderLevel) || 0;

            let status = 'IN_STOCK';
            if (qty <= 0) {
              status = 'OUT_OF_STOCK';
            } else if (qty <= reorderLevel) {
              status = 'LOW_STOCK';
            }

            return {
              id: i.id || i.itemCode,
              itemCode: i.itemCode,
              itemName: i.itemName,
              categoryCode: i.categoryCode || 'UNASSIGNED',
              locationCode: i.defaultLocationCode || 'MAIN-WH',
              locationName: i.defaultLocationName || 'Main Warehouse',
              locationType: 'Warehouse',
              quantity: qty,
              baseUom: i.baseUom || 'PCS',
              unitCost: unitCost,
              valuation: valuation,
              reorderLevel: reorderLevel,
              status: status,
              lastUpdatedAt: i.updatedAt || ''
            };
          });
        }

        const searchQuery = (this.liveInventorySearchQuery || '').toLowerCase().trim();
        const locFilter = this.liveInventoryLocationFilter || 'ALL';
        const catFilter = this.liveInventoryCategoryFilter || 'ALL';
        const statusFilter = this.liveInventoryStatusFilter || 'ALL';
        const sortOption = this.liveInventorySort || 'VALUE_DESC';

        let filteredLines = stockLines.filter(line => {
          if (searchQuery) {
            const q = searchQuery;
            const matchName = (line.itemName || '').toLowerCase().includes(q);
            const matchCode = (line.itemCode || '').toLowerCase().includes(q);
            const matchCat = (line.categoryCode || '').toLowerCase().includes(q);
            const matchLoc = (line.locationName || '').toLowerCase().includes(q) || (line.locationCode || '').toLowerCase().includes(q);
            if (!matchName && !matchCode && !matchCat && !matchLoc) return false;
          }
          if (locFilter !== 'ALL' && line.locationCode !== locFilter) return false;
          if (catFilter !== 'ALL' && line.categoryCode !== catFilter) return false;
          if (statusFilter !== 'ALL' && line.status !== statusFilter) return false;
          return true;
        });

        filteredLines.sort((a, b) => {
          if (sortOption === 'VALUE_DESC') return b.valuation - a.valuation;
          if (sortOption === 'VALUE_ASC') return a.valuation - b.valuation;
          if (sortOption === 'QTY_DESC') return b.quantity - a.quantity;
          if (sortOption === 'QTY_ASC') return a.quantity - b.quantity;
          if (sortOption === 'NAME_ASC') return a.itemName.localeCompare(b.itemName);
          if (sortOption === 'DATE_DESC') {
            const tA = a.lastUpdatedAt ? new Date(a.lastUpdatedAt).getTime() : 0;
            const tB = b.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0;
            return tB - tA;
          }
          return 0;
        });

        const totalValuationAll = stockLines.reduce((sum, l) => sum + l.valuation, 0);
        const totalValuationFiltered = filteredLines.reduce((sum, l) => sum + l.valuation, 0);
        const totalQtyFiltered = filteredLines.reduce((sum, l) => sum + l.quantity, 0);
        const lowStockCount = stockLines.filter(l => l.status === 'LOW_STOCK').length;
        const outOfStockCount = stockLines.filter(l => l.status === 'OUT_OF_STOCK').length;
        const uniqueItemsCount = new Set(stockLines.map(l => l.itemCode)).size;
        const activeLocationsCount = new Set(stockLines.map(l => l.locationCode)).size;

        return `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">📦 Detailed Live Store Balances & Valuation</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Comprehensive single-pane inventory view across all store locations, categories, and stock movement logs.
              </p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button type="button" class="btn-primary" id="btn-export-live-inv-csv" style="padding:8px 14px; font-size:0.85rem; font-weight:600; cursor:pointer;">
                📥 Export Detailed Inventory (CSV)
              </button>
            </div>
          </div>

          <!-- KPI Metric Summary Bar -->
          <div class="grid-responsive-4" style="margin-bottom:20px;">
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Total Valuation</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">
                Rs. ${totalValuationAll.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Stock Lines</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;">
                ${stockLines.length} (${uniqueItemsCount} Unique Items)
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Active Locations</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-secondary); margin-top:2px;">
                ${activeLocationsCount} Stores
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Reorder & Out of Stock</div>
              <div style="font-size:1.4rem; font-weight:700; color:${(lowStockCount + outOfStockCount) > 0 ? 'var(--status-danger)' : 'var(--status-success)'}; margin-top:2px;">
                ${lowStockCount} Low / ${outOfStockCount} Out
              </div>
            </div>
          </div>

          <!-- Controls & Multi-Filter Bar -->
          <div class="card" style="background:var(--bg-surface-2); padding:14px; margin-bottom:16px; border:1px solid var(--border-subtle);">
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px; align-items:end;">
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">🔍 Search Item / Loc</label>
                <input type="text" id="inp-live-inv-search" value="${this.liveInventorySearchQuery || ''}" placeholder="Filter by Code, Name, Loc..." style="width:100%; font-size:0.85rem; padding:6px 10px;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">🏬 Storage Location</label>
                <select id="sel-live-inv-loc" style="width:100%; font-size:0.85rem; padding:6px 10px;">
                  <option value="ALL" ${locFilter === 'ALL' ? 'selected' : ''}>All Locations (${locations.length})</option>
                  ${locations.map(l => `
                    <option value="${l.locationCode}" ${locFilter === l.locationCode ? 'selected' : ''}>${l.locationName} (${l.locationCode})</option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">🏷 Category</label>
                <select id="sel-live-inv-cat" style="width:100%; font-size:0.85rem; padding:6px 10px;">
                  <option value="ALL" ${catFilter === 'ALL' ? 'selected' : ''}>All Categories (${categories.length})</option>
                  ${categories.map(c => `
                    <option value="${c.categoryCode}" ${catFilter === c.categoryCode ? 'selected' : ''}>${c.categoryName} (${c.categoryCode})</option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">⚠️ Stock Health Status</label>
                <select id="sel-live-inv-status" style="width:100%; font-size:0.85rem; padding:6px 10px;">
                  <option value="ALL" ${statusFilter === 'ALL' ? 'selected' : ''}>All Stock Statuses</option>
                  <option value="IN_STOCK" ${statusFilter === 'IN_STOCK' ? 'selected' : ''}>✔ In Stock</option>
                  <option value="LOW_STOCK" ${statusFilter === 'LOW_STOCK' ? 'selected' : ''}>⚠️ Low Stock / Reorder</option>
                  <option value="OUT_OF_STOCK" ${statusFilter === 'OUT_OF_STOCK' ? 'selected' : ''}>🔴 Out of Stock</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">🔀 Sort Order</label>
                <select id="sel-live-inv-sort" style="width:100%; font-size:0.85rem; padding:6px 10px;">
                  <option value="VALUE_DESC" ${sortOption === 'VALUE_DESC' ? 'selected' : ''}>Valuation: High → Low</option>
                  <option value="VALUE_ASC" ${sortOption === 'VALUE_ASC' ? 'selected' : ''}>Valuation: Low → High</option>
                  <option value="QTY_DESC" ${sortOption === 'QTY_DESC' ? 'selected' : ''}>Quantity: High → Low</option>
                  <option value="QTY_ASC" ${sortOption === 'QTY_ASC' ? 'selected' : ''}>Quantity: Low → High</option>
                  <option value="NAME_ASC" ${sortOption === 'NAME_ASC' ? 'selected' : ''}>Item Name: A → Z</option>
                  <option value="DATE_DESC" ${sortOption === 'DATE_DESC' ? 'selected' : ''}>Last Movement: Newest</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Table View for Large Inventory -->
          <div style="overflow-x:auto; background:var(--bg-surface-1); border-radius:6px; border:1px solid var(--border-subtle);">
            <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
              <thead>
                <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left;">
                  <th style="padding:10px;">Item Code & Name</th>
                  <th style="padding:10px;">Category</th>
                  <th style="padding:10px;">Location</th>
                  <th style="padding:10px;">Qty On Hand</th>
                  <th style="padding:10px;">Unit Rate</th>
                  <th style="padding:10px;">Total Valuation</th>
                  <th style="padding:10px;">Status</th>
                  <th style="padding:10px;">Last Movement</th>
                </tr>
              </thead>
              <tbody>
                ${filteredLines.length ? filteredLines.map(line => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:10px;">
                      <div style="font-weight:700;">${line.itemName}</div>
                      <div style="font-size:0.72rem; color:var(--text-muted); font-family:monospace;">${line.itemCode}</div>
                    </td>
                    <td style="padding:10px;">
                      <span class="badge badge-info" style="font-size:0.75rem;">${line.categoryCode}</span>
                    </td>
                    <td style="padding:10px;">
                      <div style="font-weight:600;">${line.locationName}</div>
                      <div style="font-size:0.72rem; color:var(--text-muted);">${line.locationCode} (${line.locationType})</div>
                    </td>
                    <td style="padding:10px; font-weight:700; font-size:0.95rem; color:${line.quantity <= 0 ? 'var(--status-danger)' : 'var(--text-primary)'};">
                      ${line.quantity.toFixed(3)} ${line.baseUom}
                    </td>
                    <td style="padding:10px; color:var(--text-muted);">
                      Rs. ${line.unitCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })} / ${line.baseUom}
                    </td>
                    <td style="padding:10px; font-weight:700; color:var(--status-success); font-size:0.95rem;">
                      Rs. ${line.valuation.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td style="padding:10px;">
                      ${line.status === 'OUT_OF_STOCK' ? '<span class="badge badge-danger">🔴 Out of Stock</span>' :
                        (line.status === 'LOW_STOCK' ? `<span class="badge badge-warning">⚠️ Low Stock (Min: ${line.reorderLevel})</span>` :
                        '<span class="badge badge-success">✔ In Stock</span>')}
                    </td>
                    <td style="padding:10px; font-size:0.78rem; color:var(--text-muted);">
                      ${line.lastUpdatedAt ? new Date(line.lastUpdatedAt).toLocaleString() : '--'}
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted);">
                      No live stock balances match the selected filters.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>

          <!-- Footer Summary -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-top:14px; font-size:0.82rem; color:var(--text-muted);">
            <div>
              Showing <strong>${filteredLines.length}</strong> of <strong>${stockLines.length}</strong> live store stock lines.
            </div>
            <div style="display:flex; gap:16px;">
              <span>Total Quantity: <strong>${totalQtyFiltered.toFixed(2)}</strong></span>
              <span>Filtered Valuation: <strong style="color:var(--status-success);">Rs. ${totalValuationFiltered.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
            </div>
          </div>
        `;
      }

      if (tabKey === 'inv-po' || tabKey === 'inv-pos') {
        return this.renderPurchaseOrdersPage(session);
      }

      if (tabKey === 'inv-po-form') {
        return this.renderCreatePoFormPage(items, suppliers, locations, session);
      }

      if (tabKey === 'inv-grn' || tabKey === 'inv-receiving' || tabKey === 'inv-receipts') {
        return this.renderGoodsReceivingPage(session);
      }

      if (tabKey === 'inv-grn-form') {
        return this.renderReceiveGoodsGrnStudioPage(session);
      }

      if (tabKey === 'inv-transfers') {
        return this.renderStockTransfersPage(session);
      }

      if (tabKey === 'inv-issues') {
        return this.renderStockIssuesPage(session);
      }

      if (tabKey === 'inv-adjustments') {
        return this.renderStockAdjustmentsPage(session);
      }

      if (tabKey === 'inv-counts' || tabKey === 'inv-count') {
        return this.renderStockCountsPage(session);
      }

      if (tabKey === 'inv-alerts') {
        return this.renderLowStockAlertsPage(session);
      }

      if (tabKey === 'inv-ledger') {
        return this.renderStockLedgerExplorerPage(session);
      }

      if (tabKey === 'inv-master-form') {
        return this.renderMasterItemFormPage(items, categories, uoms, locations, suppliers, session);
      }

      if (tabKey === 'inv-master-detail') {
        return this.renderMasterItemDetailPage(session);
      }

      if (tabKey === 'inv-master-import-preview') {
        return this.renderMasterInventoryImportPreview(session);
      }

      if (tabKey === 'inv-master') {
        const filtered = items.filter(i => {
          if (this.inventoryTypeFilter !== 'ALL' && i.itemType !== this.inventoryTypeFilter) return false;
          if (this.inventoryCategoryFilter !== 'ALL' && i.categoryCode !== this.inventoryCategoryFilter) return false;
          if (this.inventorySearchQuery && !i.itemName.toLowerCase().includes(this.inventorySearchQuery.toLowerCase()) && !i.itemCode.toLowerCase().includes(this.inventorySearchQuery.toLowerCase())) return false;
          return true;
        });

        return `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div>
              <h3 style="margin:0;">Master Inventory Catalog (${filtered.length} Items)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin:2px 0 0 0;">Master Data Platform across all 8 operational item classifications (PD-032 & PD-034 Active).</p>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <button class="btn-primary" id="btn-trigger-import-master" style="padding:8px 16px; font-size:0.85rem; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border:none; color:#fff; cursor:pointer;">
                ⚡ Bulk Import Master Inventory (CSV / Excel)
              </button>
              <input type="file" id="file-import-master-inventory" accept=".csv, .xlsx, .xls" style="display:none;">
              <button class="btn-secondary" id="btn-dl-sample-template" style="padding:8px 14px; font-size:0.8rem; font-weight:600;">
                📥 Sample CSV Template
              </button>
              <button class="btn-secondary" id="btn-export-master-csv" style="padding:8px 14px; font-size:0.8rem; font-weight:600;">
                📤 Export Catalog (CSV)
              </button>
              <button class="btn-primary" id="btn-open-master-form" style="padding:8px 16px; font-size:0.85rem; font-weight:600;">
                + Add Master Item
              </button>
            </div>
          </div>
          
          <div style="display:flex; gap:12px; margin-bottom:16px; align-items:center;">
            <input type="text" id="inv-search-inp" placeholder="🔍 Search item name or code..." value="${this.inventorySearchQuery}" style="flex:1; padding:8px 12px;">
            <select id="inv-type-sel" style="padding:8px 12px;">
              <option value="ALL" ${this.inventoryTypeFilter === 'ALL' ? 'selected' : ''}>All Item Types</option>
              <option value="Raw Material" ${this.inventoryTypeFilter === 'Raw Material' ? 'selected' : ''}>Raw Material</option>
              <option value="Semi Finished" ${this.inventoryTypeFilter === 'Semi Finished' ? 'selected' : ''}>Semi Finished</option>
              <option value="Finished Good" ${this.inventoryTypeFilter === 'Finished Good' ? 'selected' : ''}>Finished Good</option>
              <option value="Packaging" ${this.inventoryTypeFilter === 'Packaging' ? 'selected' : ''}>Packaging</option>
              <option value="Consumable" ${this.inventoryTypeFilter === 'Consumable' ? 'selected' : ''}>Consumable</option>
              <option value="Cleaning Supply" ${this.inventoryTypeFilter === 'Cleaning Supply' ? 'selected' : ''}>Cleaning Supply</option>
              <option value="Asset" ${this.inventoryTypeFilter === 'Asset' ? 'selected' : ''}>Asset</option>
              <option value="Service Item" ${this.inventoryTypeFilter === 'Service Item' ? 'selected' : ''}>Service Item</option>
            </select>
            <select id="inv-cat-sel" style="padding:8px 12px;">
              <option value="ALL" ${this.inventoryCategoryFilter === 'ALL' ? 'selected' : ''}>All Categories</option>
              ${categories.map(c => `<option value="${c.categoryCode}" ${this.inventoryCategoryFilter === c.categoryCode ? 'selected' : ''}>${c.categoryName}</option>`).join('')}
            </select>
          </div>

          ${filtered.length ? `
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Item Code</th>
                  <th style="padding:10px;">Item Name</th>
                  <th style="padding:10px;">Item Type</th>
                  <th style="padding:10px;">Category</th>
                  <th style="padding:10px;">Base UOM</th>
                  <th style="padding:10px;">Purchase Price / Unit Cost</th>
                  <th style="padding:10px;">Operational Behaviors</th>
                  <th style="padding:10px;">Scope & Yield</th>
                  <th style="padding:10px;">Status</th>
                  <th style="padding:10px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(i => {
          const purUom = i.purchaseUom || i.baseUom || 'KG';
          const factor = parseFloat(i.conversionFactor) || 1;
          const purPrice = parseFloat(i.lastPurchasePrice) || 0;
          const baseCost = parseFloat(i.unitValuation) || (factor > 0 ? (purPrice / factor) : purPrice);
          const yieldPct = i.standardYieldPercent !== undefined ? i.standardYieldPercent : 100.0;
          const deptScope = i.departmentUsageScope || 'ALL';

          const badges = [];
          if (i.isRecipeIngredient !== false) badges.push('<span class="badge badge-info" style="font-size:0.68rem;">Ingredient</span>');
          if (i.autoDeductionEnabled !== false) badges.push('<span class="badge badge-success" style="font-size:0.68rem;">Auto-Deduct</span>');
          if (i.isSemiFinished) badges.push('<span class="badge badge-warning" style="font-size:0.68rem;">Prep Batch</span>');
          if (i.isDirectSale) badges.push('<span class="badge badge-secondary" style="font-size:0.68rem;">Direct Sale</span>');
          if (!badges.length) badges.push('<span class="badge badge-secondary" style="font-size:0.68rem;">Standard</span>');

          return `
                    <tr class="master-item-row" data-code="${i.itemCode}" style="border-bottom:1px solid var(--border-subtle); cursor:pointer;">
                      <td style="padding:10px; font-weight:700; color:var(--accent-primary);">${i.itemCode}</td>
                      <td style="padding:10px; font-weight:600;">${i.itemName}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${i.itemType}</span></td>
                      <td style="padding:10px;">${i.categoryName || i.categoryCode}</td>
                      <td style="padding:10px;"><span class="badge badge-success">${i.baseUom || 'KG'}</span></td>
                      <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${purPrice.toFixed(2)} / ${purUom} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(₹${baseCost.toFixed(2)} / ${i.baseUom})</span></td>
                      <td style="padding:10px;">${badges.join(' ')}</td>
                      <td style="padding:10px; font-weight:600;"><span class="badge badge-secondary">${deptScope}</span> <span style="font-size:0.75rem; color:var(--text-muted);">(${yieldPct}% Yield)</span></td>
                      <td style="padding:10px;"><span class="badge ${i.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}">${i.status || 'ACTIVE'}</span></td>
                      <td style="padding:10px; text-align:right; white-space:nowrap;">
                        <button type="button" class="btn-secondary btn-view-master-detail" data-code="${i.itemCode}" style="padding:4px 8px; font-size:0.75rem; margin-right:4px;">👁 View Details</button>
                        <button type="button" class="btn-secondary btn-edit-master-item" data-id="${i.id || i.itemCode}" style="padding:4px 8px; font-size:0.75rem;">✏ Edit</button>
                      </td>
                    </tr>
                  `;
        }).join('')}
              </tbody>
            </table>
          ` : `
            <div style="text-align:center; padding:30px; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">
              📦 No master inventory items exist for this restaurant. Click <strong>+ Add Master Item</strong> above or use <strong>⚡ Bulk Import</strong>!
            </div>
          `}
        `;
      }

      if (tabKey === 'inv-categories') {
        const cats = categoryRepository.getAll(session ? session.tenantId : null);
        const activeCats = cats.filter(c => c.status === 'ACTIVE');
        const familiesCount = Object.keys(PRODUCT_FAMILIES_REGISTRY).length;

        return `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">🏷 Categories & Product Families Master (${cats.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Canonical 15 Product Families & Tenant-Level Operational Categories.
              </p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <button type="button" class="btn-secondary" id="btn-download-cat-sample" style="padding:8px 14px; font-size:0.85rem; font-weight:600; border-color:var(--accent-secondary); color:var(--accent-secondary);">
                📥 Download Sample CSV
              </button>
              <button type="button" class="btn-primary" id="btn-trigger-import-cats" style="padding:8px 14px; font-size:0.85rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                📤 Bulk Import Categories (CSV)
              </button>
              <input type="file" id="file-import-cats" accept=".csv, text/csv, .xlsx, .xls" style="display:none;">
              <button type="button" class="btn-primary" id="btn-add-category-modal" style="padding:8px 14px; font-size:0.85rem; font-weight:600;">
                + Add Category
              </button>
            </div>
          </div>

          <!-- Metric Header Cards -->
          <div class="grid-responsive-4" style="margin-bottom:20px;">
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">PRODUCT FAMILIES</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;">${familiesCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">TOTAL CATEGORIES</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-secondary); margin-top:2px;">${cats.length}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">ACTIVE CATEGORIES</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">${activeCats.length}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">CLASSIFICATION TYPE</div>
              <span class="badge badge-success" style="font-size:0.8rem; padding:4px 10px; margin-top:4px; display:inline-block;">✔ Pure Operational</span>
            </div>
          </div>

          <!-- Table View -->
          <div class="table-responsive">
            <table class="data-table" style="width:100%; font-size:0.85rem;">
              <thead>
                <tr style="background:var(--bg-surface-2);">
                  <th style="padding:10px;">Category Code</th>
                  <th style="padding:10px;">Category Name</th>
                  <th style="padding:10px;">Product Family</th>
                  <th style="padding:10px;">Default Base UOM</th>
                  <th style="padding:10px;">Status</th>
                  <th style="padding:10px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${cats.map(c => {
          const fam = PRODUCT_FAMILIES_REGISTRY[c.productFamilyCode] || { icon: '📦', name: c.productFamilyName || c.productFamilyCode };
          return `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:10px; font-weight:700; color:var(--accent-primary);">${c.categoryCode}</td>
                      <td style="padding:10px; font-weight:600;">${c.categoryName}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${fam.icon} ${fam.name}</span></td>
                      <td style="padding:10px;"><span class="badge badge-success">${c.defaultUom || 'KG'}</span></td>
                      <td style="padding:10px;"><span class="badge ${c.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}">${c.status}</span></td>
                      <td style="padding:10px; text-align:right; white-space:nowrap;">
                        <button type="button" class="btn-secondary btn-edit-cat" data-id="${c.id || c.categoryCode}" style="padding:4px 8px; font-size:0.75rem; margin-right:4px;">✏️ Edit</button>
                        <button type="button" class="btn-secondary btn-archive-cat" data-id="${c.id || c.categoryCode}" data-name="${(c.categoryName || '').replace(/"/g, '&quot;')}" style="padding:4px 8px; font-size:0.75rem; color:var(--status-danger); border-color:var(--status-danger);">📦 Archive</button>
                      </td>
                    </tr>
                  `;
        }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      if (tabKey === 'inv-uom') {
        const allUoms = uomRepository.getAll();
        const weightUoms = allUoms.filter(u => (u.uomFamily || u.family) === 'WEIGHT');
        const volumeUoms = allUoms.filter(u => (u.uomFamily || u.family) === 'VOLUME');
        const countUoms = allUoms.filter(u => (u.uomFamily || u.family) === 'COUNT');

        return `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">📐 Units of Measure (UOM) Canonical Master (${allUoms.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Frozen System-Governed UOM Master — 3 Families (Weight, Volume, Count). Read-Only System Definitions.
              </p>
            </div>
            <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">🔒 Frozen Canon Data</span>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
            <!-- Weight Family -->
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--accent-primary);">
              <h4 style="margin:0 0 8px 0; color:var(--accent-primary);">⚖️ Weight Family (${weightUoms.length})</h4>
              <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">Base Unit: <strong>G (Gram)</strong>. Global mathematical ratio.</p>
              <table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted);">
                    <th style="padding:6px;">Code</th><th style="padding:6px;">Name</th><th style="padding:6px;">Base Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  ${weightUoms.map(u => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:6px; font-weight:700; font-family:monospace;">${u.uomCode}</td>
                      <td style="padding:6px;">${u.uomName}</td>
                      <td style="padding:6px;"><span class="badge ${u.isBaseUnit ? 'badge-success' : 'badge-info'}">${u.conversionFactor} ${u.isBaseUnit ? '(Base)' : 'G'}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Volume Family -->
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--accent-secondary);">
              <h4 style="margin:0 0 8px 0; color:var(--accent-secondary);">🥤 Volume Family (${volumeUoms.length})</h4>
              <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">Base Unit: <strong>ML (Millilitre)</strong>. Global mathematical ratio.</p>
              <table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted);">
                    <th style="padding:6px;">Code</th><th style="padding:6px;">Name</th><th style="padding:6px;">Base Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  ${volumeUoms.map(u => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:6px; font-weight:700; font-family:monospace;">${u.uomCode}</td>
                      <td style="padding:6px;">${u.uomName}</td>
                      <td style="padding:6px;"><span class="badge ${u.isBaseUnit ? 'badge-success' : 'badge-info'}">${u.conversionFactor} ${u.isBaseUnit ? '(Base)' : 'ML'}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Count Family -->
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--status-info);">
              <h4 style="margin:0 0 8px 0; color:var(--status-info);">📦 Count & Packaging (${countUoms.length})</h4>
              <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">Base Unit: <strong>PCS (Piece)</strong>. Containers derive ratio per item.</p>
              <table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted);">
                    <th style="padding:6px;">Code</th><th style="padding:6px;">Name</th><th style="padding:6px;">Ratio / Type</th>
                  </tr>
                </thead>
                <tbody>
                  ${countUoms.map(u => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:6px; font-weight:700; font-family:monospace;">${u.uomCode}</td>
                      <td style="padding:6px;">${u.uomName}</td>
                      <td style="padding:6px;"><span class="badge ${u.isBaseUnit ? 'badge-success' : (u.uomCode === 'DOZEN' ? 'badge-info' : 'badge-warning')}">${u.uomCode === 'DOZEN' ? '12 PCS' : (u.isBaseUnit ? '1 (Base)' : 'Item Specific')}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      if (tabKey === 'inv-locations') {
        return this.renderStorageLocationsTabHTML(locations, session);
      }

      if (tabKey === 'inv-suppliers') {
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <h3 style="margin:0;">🏢 Suppliers Master (${suppliers.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Manage approved vendors, contact info, tax registration, and payment terms.</p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <button type="button" class="btn-secondary" id="btn-download-supplier-sample" style="padding:8px 14px; font-size:0.85rem; font-weight:600; border-color:var(--accent-secondary); color:var(--accent-secondary);">
                📥 Download Sample Template (CSV)
              </button>
              <button type="button" class="btn-secondary" id="btn-export-suppliers" style="padding:8px 14px; font-size:0.85rem; font-weight:600; border-color:var(--status-info); color:var(--status-info);">
                📊 Export Suppliers (CSV)
              </button>
              <button type="button" class="btn-primary" id="btn-trigger-import-suppliers" style="padding:8px 14px; font-size:0.85rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                📤 Bulk Import Suppliers (CSV)
              </button>
              <input type="file" id="file-import-suppliers" accept=".csv, text/csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" style="display:none;">
              <button type="button" class="btn-primary" id="btn-add-supplier-modal" style="padding:8px 14px; font-size:0.85rem; font-weight:600;">
                + Add Single Supplier
              </button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table" style="width:100%; font-size:0.85rem;">
              <thead>
                <tr style="background:var(--bg-surface-2);">
                  <th style="padding:10px;">Code</th>
                  <th style="padding:10px;">Supplier Name</th>
                  <th style="padding:10px;">Contact Person</th>
                  <th style="padding:10px;">Phone</th>
                  <th style="padding:10px;">Email</th>
                  <th style="padding:10px;">GSTIN</th>
                  <th style="padding:10px;">FSSAI License</th>
                  <th style="padding:10px;">Payment Terms</th>
                  <th style="padding:10px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${suppliers.map(s => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:10px; font-weight:700; color:var(--accent-primary);">${s.supplierCode || 'SUP-000'}</td>
                    <td style="padding:10px; font-weight:600;">${s.supplierName || ''}</td>
                    <td style="padding:10px;">${s.primaryContact || '--'}</td>
                    <td style="padding:10px;">${s.phone || '--'}</td>
                    <td style="padding:10px;">${s.email || '--'}</td>
                    <td style="padding:10px; font-family:monospace;">${s.gstin || '--'}</td>
                    <td style="padding:10px; font-family:monospace;">${s.fssaiLicense || '--'}</td>
                    <td style="padding:10px;"><span class="badge badge-info">${s.paymentTerms || 'NET30'}</span></td>
                    <td style="padding:10px; text-align:right; white-space:nowrap;">
                      <button type="button" class="btn-secondary btn-edit-supplier" data-id="${s.id || s.supplierCode}" style="padding:4px 8px; font-size:0.75rem; margin-right:4px;">✏️ Edit</button>
                      <button type="button" class="btn-secondary btn-delete-supplier" data-id="${s.id || s.supplierCode}" data-name="${(s.supplierName || '').replace(/"/g, '&quot;')}" style="padding:4px 8px; font-size:0.75rem; color:var(--status-danger); border-color:var(--status-danger);">🗑️ Delete</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      if (tabKey === 'inv-import') {
        const suppliersExist = suppliers && suppliers.length > 0;
        return `
          <h3>⚡ CANON-11 Enterprise ERP Import Suite</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Enforced 6-Step Sequential Onboarding Engine with Smart Import Assistant.</p>

          <div style="background:var(--bg-surface-2); padding:16px; border-radius:8px; border:1px solid var(--border-subtle); margin-bottom:20px;">
            <div style="font-weight:700; font-size:0.9rem; margin-bottom:10px;">Resumable Import Progress Tracker</div>
            <div class="grid-responsive-6">
              <div style="background:var(--bg-surface-1); padding:10px; border-radius:4px; text-align:center; border-left:3px solid var(--status-success);">
                <div style="font-size:0.7rem; color:var(--text-muted);">STEP 1</div>
                <div style="font-weight:600; font-size:0.8rem;">Categories</div>
                <span class="badge badge-success" style="font-size:0.65rem; margin-top:4px;">✔ COMPLETED</span>
              </div>
              <div style="background:var(--bg-surface-1); padding:10px; border-radius:4px; text-align:center; border-left:3px solid var(--status-success);">
                <div style="font-size:0.7rem; color:var(--text-muted);">STEP 2</div>
                <div style="font-weight:600; font-size:0.8rem;">Units of Measure</div>
                <span class="badge badge-success" style="font-size:0.65rem; margin-top:4px;">✔ COMPLETED</span>
              </div>
              <div style="background:var(--bg-surface-1); padding:10px; border-radius:4px; text-align:center; border-left:3px solid var(--status-success);">
                <div style="font-size:0.7rem; color:var(--text-muted);">STEP 3</div>
                <div style="font-weight:600; font-size:0.8rem;">Storage Locations</div>
                <span class="badge badge-success" style="font-size:0.65rem; margin-top:4px;">✔ COMPLETED</span>
              </div>
              <div style="background:var(--bg-surface-1); padding:10px; border-radius:4px; text-align:center; border-left:3px solid ${suppliersExist ? 'var(--status-success)' : 'var(--status-warning)'};">
                <div style="font-size:0.7rem; color:var(--text-muted);">STEP 4</div>
                <div style="font-weight:600; font-size:0.8rem;">Suppliers Master</div>
                <span class="badge ${suppliersExist ? 'badge-success' : 'badge-warning'}" style="font-size:0.65rem; margin-top:4px;">${suppliersExist ? '✔ COMPLETED (' + suppliers.length + ' Total in DB)' : '⏳ PENDING'}</span>
              </div>
              <div style="background:var(--bg-surface-1); padding:10px; border-radius:4px; text-align:center; border-left:3px solid var(--border-subtle);">
                <div style="font-size:0.7rem; color:var(--text-muted);">STEP 5</div>
                <div style="font-weight:600; font-size:0.8rem;">Inventory Master</div>
                <span class="badge" style="font-size:0.65rem; margin-top:4px;">⏳ PENDING</span>
              </div>
              <div style="background:var(--bg-surface-1); padding:10px; border-radius:4px; text-align:center; border-left:3px solid var(--border-subtle);">
                <div style="font-size:0.7rem; color:var(--text-muted);">STEP 6</div>
                <div style="font-weight:600; font-size:0.8rem;">Opening Stock</div>
                <span class="badge" style="font-size:0.65rem; margin-top:4px;">⏳ PENDING</span>
              </div>
            </div>
          </div>

          <!-- Step 4 Supplier Import Onboarding Module -->
          <div style="background:var(--bg-surface-2); padding:20px; border-radius:8px; border:1px solid var(--border-subtle); margin-top:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div>
                <h4 style="margin:0; font-size:1.1rem; color:var(--accent-primary);">🏢 STEP 4: Bulk Supplier Master Import Engine</h4>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Download sample CSV/Excel template, fill vendor details, and upload to import suppliers in one go!</p>
              </div>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button type="button" class="btn-secondary" id="btn-download-supplier-sample-step4" style="padding:8px 14px; font-size:0.85rem; font-weight:600; border-color:var(--accent-secondary); color:var(--accent-secondary);">
                  📥 Download Sample CSV Template
                </button>
                <button type="button" class="btn-primary" id="btn-trigger-import-suppliers-step4" style="padding:8px 14px; font-size:0.85rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                  📤 Import Suppliers (CSV)
                </button>
                <input type="file" id="file-import-suppliers-step4" accept=".csv, text/csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" style="display:none;">
              </div>
            </div>
          </div>
        `;
      }

      if (tabKey === 'inv-requests') {
        return `
          <h3>✅ Inter-Workspace Inventory Requests (${requests.length} Requests)</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Requests submitted by Kitchen Chef or Bartender when a required item is missing.</p>
          
          <div style="margin-top:12px;">
            ${requests.length ? requests.map(r => `
              <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2); padding:14px 18px; border-radius:6px; margin-bottom:10px;">
                <div>
                  <h4 style="margin:0; font-size:1.1rem;">${r.itemName} <span class="badge badge-info">${r.suggestedCategory}</span></h4>
                  <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                    Requested by <strong>${r.requestedBy}</strong> (${r.workspace}) • UOM: <strong>${r.suggestedUom}</strong>
                  </p>
                </div>
                ${r.status === 'PENDING' ? `
                  <button class="btn-primary btn-approve-req" data-id="${r.requestId}" data-name="${r.itemName}" data-cat="${r.suggestedCategory}" data-uom="${r.suggestedUom}" style="padding:8px 16px; font-weight:600;">
                    ✔ Approve & Onboard to Master
                  </button>
                ` : `<span class="badge badge-success">Approved & Created</span>`}
              </div>
            `).join('') : `
              <div style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">
                ✔ No pending inter-workspace inventory requests.
              </div>
            `}
          </div>
        `;
      }

      if (tabKey === 'inv-history') {
        return `
          <h3>Import History & Rollback System (${history.length})</h3>
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-top:12px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                <th style="padding:8px;">Timestamp</th><th style="padding:8px;">File Name</th><th style="padding:8px;">Imported By</th><th style="padding:8px;">Created</th><th style="padding:8px;">Status</th><th style="padding:8px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(h => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:8px;">${new Date(h.timestamp).toLocaleString()}</td>
                  <td style="padding:8px; font-weight:600;">${h.fileName}</td>
                  <td style="padding:8px;">${h.importedBy}</td>
                  <td style="padding:8px;">${h.createdCount} items</td>
                  <td style="padding:8px;"><span class="badge badge-success">${h.status}</span></td>
                  <td style="padding:8px;"><button class="btn-secondary" style="font-size:0.75rem;">View Report</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      if (tabKey === 'inv-uom') {
        const uoms = uomRepository.getAll();
        const weightUoms = uoms.filter(u => u.uomFamily === 'WEIGHT');
        const volumeUoms = uoms.filter(u => u.uomFamily === 'VOLUME');
        const countUoms = uoms.filter(u => u.uomFamily === 'COUNT');

        return `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">📐 Units of Measure (UOM) Canonical Master (${uoms.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Frozen System-Governed UOM Master — 3 Families (Weight, Volume, Count). Read-Only System Definitions.
              </p>
            </div>
            <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">🔒 Frozen Canon Data</span>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
            <!-- Weight Family -->
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--accent-primary);">
              <h4 style="margin:0 0 8px 0; color:var(--accent-primary);">⚖️ Weight Family (${weightUoms.length})</h4>
              <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">Base Unit: <strong>G (Gram)</strong>. Global mathematical ratio.</p>
              <table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted);">
                    <th style="padding:6px;">Code</th><th style="padding:6px;">Name</th><th style="padding:6px;">Base Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  ${weightUoms.map(u => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:6px; font-weight:700; font-family:monospace;">${u.uomCode}</td>
                      <td style="padding:6px;">${u.uomName}</td>
                      <td style="padding:6px;"><span class="badge ${u.isBaseUnit ? 'badge-success' : 'badge-info'}">${u.conversionFactor} ${u.isBaseUnit ? '(Base)' : 'G'}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Volume Family -->
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--accent-secondary);">
              <h4 style="margin:0 0 8px 0; color:var(--accent-secondary);">🥤 Volume Family (${volumeUoms.length})</h4>
              <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">Base Unit: <strong>ML (Millilitre)</strong>. Global mathematical ratio.</p>
              <table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted);">
                    <th style="padding:6px;">Code</th><th style="padding:6px;">Name</th><th style="padding:6px;">Base Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  ${volumeUoms.map(u => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:6px; font-weight:700; font-family:monospace;">${u.uomCode}</td>
                      <td style="padding:6px;">${u.uomName}</td>
                      <td style="padding:6px;"><span class="badge ${u.isBaseUnit ? 'badge-success' : 'badge-info'}">${u.conversionFactor} ${u.isBaseUnit ? '(Base)' : 'ML'}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Count Family -->
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--status-info);">
              <h4 style="margin:0 0 8px 0; color:var(--status-info);">📦 Count & Packaging (${countUoms.length})</h4>
              <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">Base Unit: <strong>PCS (Piece)</strong>. Containers derive ratio per item.</p>
              <table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted);">
                    <th style="padding:6px;">Code</th><th style="padding:6px;">Name</th><th style="padding:6px;">Ratio / Type</th>
                  </tr>
                </thead>
                <tbody>
                  ${countUoms.map(u => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:6px; font-weight:700; font-family:monospace;">${u.uomCode}</td>
                      <td style="padding:6px;">${u.uomName}</td>
                      <td style="padding:6px;"><span class="badge ${u.isBaseUnit ? 'badge-success' : (u.uomCode === 'DOZEN' ? 'badge-info' : 'badge-warning')}">${u.uomCode === 'DOZEN' ? '12 PCS' : (u.isBaseUnit ? '1 (Base)' : 'Item Specific')}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      return `<h3>${tabKey.toUpperCase()}</h3><p style="color:var(--text-muted); font-size:0.85rem;">Operational module view.</p>`;
    }

    exportLiveInventoryToCSV(session) {
      const tenantId = session ? session.tenantId : '';
      const balances = offlineStore.getCollection('stock_balances', tenantId) || [];
      const items = masterItemRepository.getAll(tenantId);
      const locations = storageLocationRepository.getAll(tenantId);

      let stockLines = [];
      if (balances.length > 0) {
        stockLines = balances.map(b => {
          const item = items.find(i => i.itemCode === b.itemCode) || {};
          const loc = locations.find(l => l.locationCode === b.locationCode) || {};
          const qty = parseFloat(b.quantity) || 0;
          const factor = parseFloat(item.conversionFactor) || 1;
          const purPrice = parseFloat(item.lastPurchasePrice) || 0;
          const unitCost = parseFloat(b.unitCost !== undefined ? b.unitCost : (item.unitValuation || (factor > 0 ? purPrice / factor : purPrice) || 0));
          const valuation = b.valuation !== undefined ? parseFloat(b.valuation) : (qty * unitCost);
          const reorderLevel = parseFloat(item.reorderLevel) || 0;

          let status = 'IN_STOCK';
          if (qty <= 0) status = 'OUT_OF_STOCK';
          else if (qty <= reorderLevel) status = 'LOW_STOCK';

          return {
            itemCode: b.itemCode,
            itemName: item.itemName || b.itemCode,
            categoryCode: item.categoryCode || '',
            locationCode: b.locationCode,
            locationName: loc.locationName || b.locationCode,
            quantity: qty,
            baseUom: b.baseUom || item.baseUom || '',
            unitCost: unitCost,
            valuation: valuation,
            reorderLevel: reorderLevel,
            status: status,
            lastUpdatedAt: b.lastUpdatedAt || ''
          };
        });
      } else {
        stockLines = items.map(i => {
          const qty = parseFloat(i.currentStock !== undefined ? i.currentStock : (i.openingStock || 0));
          const factor = parseFloat(i.conversionFactor) || 1;
          const purPrice = parseFloat(i.lastPurchasePrice) || 0;
          const unitCost = parseFloat(i.unitValuation) || (factor > 0 ? (purPrice / factor) : purPrice) || 0;
          const valuation = qty * unitCost;
          const reorderLevel = parseFloat(i.reorderLevel) || 0;

          let status = 'IN_STOCK';
          if (qty <= 0) status = 'OUT_OF_STOCK';
          else if (qty <= reorderLevel) status = 'LOW_STOCK';

          return {
            itemCode: i.itemCode,
            itemName: i.itemName,
            categoryCode: i.categoryCode || '',
            locationCode: i.defaultLocationCode || 'MAIN-WH',
            locationName: i.defaultLocationName || 'Main Warehouse',
            quantity: qty,
            baseUom: i.baseUom || '',
            unitCost: unitCost,
            valuation: valuation,
            reorderLevel: reorderLevel,
            status: status,
            lastUpdatedAt: i.updatedAt || ''
          };
        });
      }

      const headers = ['Item Code', 'Item Name', 'Category Code', 'Location Code', 'Location Name', 'Quantity On Hand', 'Base UOM', 'Unit Cost (INR)', 'Total Valuation (INR)', 'Reorder Level', 'Stock Health Status', 'Last Movement Timestamp'];
      const rows = stockLines.map(l => [
        `"${(l.itemCode || '').replace(/"/g, '""')}"`,
        `"${(l.itemName || '').replace(/"/g, '""')}"`,
        `"${(l.categoryCode || '').replace(/"/g, '""')}"`,
        `"${(l.locationCode || '').replace(/"/g, '""')}"`,
        `"${(l.locationName || '').replace(/"/g, '""')}"`,
        l.quantity.toFixed(3),
        `"${(l.baseUom || '').replace(/"/g, '""')}"`,
        l.unitCost.toFixed(2),
        l.valuation.toFixed(2),
        l.reorderLevel.toFixed(2),
        `"${l.status}"`,
        `"${l.lastUpdatedAt || ''}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Live_Inventory_Balances_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    bindInventoryMasterDataEvents(mount, session) {
      // 0. Live Inventory Controls
      const inpSearch = mount.querySelector('#inp-live-inv-search');
      if (inpSearch) {
        inpSearch.addEventListener('input', (e) => {
          this.liveInventorySearchQuery = e.target.value;
          this.render();
          const newlyCreatedInp = mount.querySelector('#inp-live-inv-search');
          if (newlyCreatedInp) {
            newlyCreatedInp.focus();
            newlyCreatedInp.setSelectionRange(newlyCreatedInp.value.length, newlyCreatedInp.value.length);
          }
        });
      }

      const selLoc = mount.querySelector('#sel-live-inv-loc');
      if (selLoc) {
        selLoc.addEventListener('change', (e) => {
          this.liveInventoryLocationFilter = e.target.value;
          this.render();
        });
      }

      const selCat = mount.querySelector('#sel-live-inv-cat');
      if (selCat) {
        selCat.addEventListener('change', (e) => {
          this.liveInventoryCategoryFilter = e.target.value;
          this.render();
        });
      }

      const selStatus = mount.querySelector('#sel-live-inv-status');
      if (selStatus) {
        selStatus.addEventListener('change', (e) => {
          this.liveInventoryStatusFilter = e.target.value;
          this.render();
        });
      }

      const selSort = mount.querySelector('#sel-live-inv-sort');
      if (selSort) {
        selSort.addEventListener('change', (e) => {
          this.liveInventorySort = e.target.value;
          this.render();
        });
      }

      const btnExportLiveCsv = mount.querySelector('#btn-export-live-inv-csv');
      if (btnExportLiveCsv) {
        btnExportLiveCsv.addEventListener('click', (e) => {
          e.preventDefault();
          this.exportLiveInventoryToCSV(session);
        });
      }

      // 1. Download Sample Supplier Template
    const btnSample = mount.querySelector('#btn-download-supplier-sample');
    if(btnSample) {
      btnSample.addEventListener('click', (e) => {
        e.preventDefault();
        this.downloadSampleSupplierTemplate();
      });
    }
    const btnSampleStep4 = mount.querySelector('#btn-download-supplier-sample-step4');
    if(btnSampleStep4) {
      btnSampleStep4.addEventListener('click', (e) => {
        e.preventDefault();
        this.downloadSampleSupplierTemplate();
      });
    }

    // 2. Export Suppliers Data (CSV)
    const btnExport = mount.querySelector('#btn-export-suppliers');
    if(btnExport) {
      btnExport.addEventListener('click', (e) => {
        e.preventDefault();
        this.exportSuppliersData(session);
      });
    }

    // 3. Bulk Import Suppliers Trigger Buttons & File Listeners
    const btnTriggerImport = mount.querySelector('#btn-trigger-import-suppliers');
    const inputImport = mount.querySelector('#file-import-suppliers');
    if(btnTriggerImport && inputImport) {
    btnTriggerImport.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      inputImport.click();
    });
    inputImport.addEventListener('change', (e) => {
      e.preventDefault();
      if (e.target.files && e.target.files[0]) {
        this.importSuppliersFromCSV(e.target.files[0], session);
        e.target.value = '';
      }
    });
  }

  const btnTriggerImportStep4 = mount.querySelector('#btn-trigger-import-suppliers-step4');
  const inputImportStep4 = mount.querySelector('#file-import-suppliers-step4');
  if (btnTriggerImportStep4 && inputImportStep4) {
    btnTriggerImportStep4.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      inputImportStep4.click();
    });
    inputImportStep4.addEventListener('change', (e) => {
      e.preventDefault();
      if (e.target.files && e.target.files[0]) {
        this.importSuppliersFromCSV(e.target.files[0], session);
        e.target.value = '';
      }
    });
  }

  // 4. Add Single Supplier Modal
  const btnAddSup = mount.querySelector('#btn-add-supplier-modal');
  if (btnAddSup) {
    btnAddSup.addEventListener('click', (e) => {
      e.preventDefault();
      this.openAddSupplierModal(session);
    });
  }

  // 5. Edit Supplier Listeners
  mount.querySelectorAll('.btn-edit-supplier').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const supId = btn.dataset.id;
      this.openEditSupplierModal(supId, session);
    });
  });

  // 6. Delete Supplier Listeners
  mount.querySelectorAll('.btn-delete-supplier').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const supId = btn.dataset.id;
      const supName = btn.dataset.name;
      if (confirm(`🗑️ Are you sure you want to delete supplier "${supName}" (${supId})?`)) {
        const list = offlineStore.getCollection('suppliers') || [];
        const updated = list.filter(s => s.id !== supId && s.supplierCode !== supId);
        offlineStore.setCollection('suppliers', updated);
        logAudit(session.employeeName, `Deleted Supplier "${supName}" (${supId})`, session.tenantId);
        alert(`🗑️ Supplier "${supName}" deleted successfully.`);
        this.render();
      }
    });
  });
  mount.querySelectorAll('.btn-edit-cat').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const catId = btn.dataset.id;
      this.openCategoryModal(catId, session);
    });
  });

  mount.querySelectorAll('.btn-archive-cat').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const catId = btn.dataset.id;
      const catName = btn.dataset.name;
      if (confirm(`🏷️ Are you sure you want to archive category "${catName}"?`)) {
        const res = categoryRepository.archive(catId, session);
        if (res.success) {
          alert(`🏷️ Category "${catName}" archived successfully.`);
          this.render();
        } else {
          alert(res.error || 'Failed to archive category.');
        }
      }
    });
  });

  const btnAddCat = mount.querySelector('#btn-add-category-modal');
  if (btnAddCat) {
    btnAddCat.addEventListener('click', (e) => {
      e.preventDefault();
      this.openCategoryModal(null, session);
    });
  }

  // Storage Location Event Listeners
  const btnAddLoc = mount.querySelector('#btn-add-location-modal');
  if (btnAddLoc) {
    btnAddLoc.addEventListener('click', (e) => {
      e.preventDefault();
      this.openLocationModal(null, session);
    });
  }

  const btnDownloadLocSample = mount.querySelector('#btn-download-location-sample');
  if (btnDownloadLocSample) {
    btnDownloadLocSample.addEventListener('click', (e) => {
      e.preventDefault();
      this.downloadSampleStorageLocationTemplate();
    });
  }

  const btnExportLocs = mount.querySelector('#btn-export-locations');
  if (btnExportLocs) {
    btnExportLocs.addEventListener('click', (e) => {
      e.preventDefault();
      this.exportStorageLocationsData(session);
    });
  }

  const btnClearLocs = mount.querySelector('#btn-clear-locations');
  if (btnClearLocs) {
    btnClearLocs.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('🧹 Are you sure you want to clear all storage locations from local storage?')) {
        storageLocationRepository.clearAll(session);
        alert('🧹 All storage locations cleared from local storage!');
        this.render();
      }
    });
  }

  const btnTriggerImportLocs = mount.querySelector('#btn-trigger-import-locations');
  const inputImportLocs = mount.querySelector('#file-import-locations');
  if (btnTriggerImportLocs && inputImportLocs) {
    btnTriggerImportLocs.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      inputImportLocs.click();
    });
    inputImportLocs.addEventListener('change', (e) => {
      e.preventDefault();
      if (e.target.files && e.target.files[0]) {
        this.importStorageLocationsFromFile(e.target.files[0], session);
        e.target.value = '';
      }
    });
  }

  mount.querySelectorAll('.btn-edit-loc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const locId = btn.dataset.id;
      this.openLocationModal(locId, session);
    });
  });

  mount.querySelectorAll('.btn-archive-loc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const locId = btn.dataset.id;
      const locName = btn.dataset.name;
      if (confirm(`📦 Are you sure you want to archive storage location "${locName}"?`)) {
        const res = storageLocationRepository.archive(locId, session);
        if (res.success) {
          alert(`📦 Storage location "${locName}" archived successfully.`);
          this.render();
        } else {
          alert(res.error || 'Failed to archive location.');
        }
      }
    });
  });
}

    renderStorageLocationsTabHTML(locations, session) {
  const allLocs = storageLocationRepository.getAll(session.tenantId);
  const activeLocs = allLocs.filter(l => l.status === 'ACTIVE');
  const topWarehouses = allLocs.filter(l => l.level === 'Warehouse' || !l.parentLocationCode);
  const isComplete = activeLocs.length > 0;

  const getChildren = (parentCode) => allLocs.filter(l => l.parentLocationCode === parentCode);

  return `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h3 style="margin:0;">🏬 Storage & Locations Master (${allLocs.length})</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
              3-Level Physical Storage Hierarchy, Storage Conditions & Operational Permission Controls.
            </p>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <button type="button" class="btn-secondary" id="btn-download-location-sample" style="padding:8px 14px; font-size:0.85rem; font-weight:600; border-color:var(--accent-secondary); color:var(--accent-secondary);">
              📥 Download Sample Template
            </button>
            <button type="button" class="btn-secondary" id="btn-export-locations" style="padding:8px 14px; font-size:0.85rem; font-weight:600; border-color:var(--status-info); color:var(--status-info);">
              📊 Export Locations (CSV)
            </button>
            <button type="button" class="btn-secondary" id="btn-clear-locations" style="padding:8px 14px; font-size:0.85rem; font-weight:600; border-color:var(--status-danger); color:var(--status-danger);">
              🧹 Clear All Locations
            </button>
            <button type="button" class="btn-primary" id="btn-trigger-import-locations" style="padding:8px 14px; font-size:0.85rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
              📤 Bulk Import Locations (.xlsx/.csv)
            </button>
            <input type="file" id="file-import-locations" accept=".csv, text/csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" style="display:none;">
            <button type="button" class="btn-primary" id="btn-add-location-modal" style="padding:8px 14px; font-size:0.85rem; font-weight:600;">
              + Add Storage Location
            </button>
          </div>
        </div>

        <!-- Stats Bar -->
        <div class="grid-responsive-4" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">TOTAL LOCATIONS</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;">${allLocs.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">ACTIVE STORES</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">${activeLocs.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">TOP WAREHOUSES</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--accent-secondary); margin-top:2px;">${topWarehouses.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">CARD STATUS</div>
            <span class="badge ${isComplete ? 'badge-success' : 'badge-warning'}" style="font-size:0.8rem; padding:4px 10px; margin-top:4px; display:inline-block;">
              ${isComplete ? '✔ COMPLETE' : '⏳ NEEDS ATTENTION'}
            </span>
          </div>
        </div>

        <!-- Location Cards & Hierarchical Tree -->
        <div class="flex-col gap-md" style="display:flex; flex-direction:column; gap:16px;">
          ${topWarehouses.map(wh => {
    const children = getChildren(wh.locationCode);
    return `
              <div class="card" style="background:var(--bg-surface-2); border-left:4px solid var(--accent-primary); padding:18px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
                  <div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                      <h4 style="margin:0; font-size:1.2rem; color:var(--accent-primary);">🏭 ${wh.locationName}</h4>
                      <code style="font-size:0.85rem; background:var(--bg-surface-1); padding:2px 6px; border-radius:4px;">${wh.locationCode}</code>
                      <span class="badge badge-info">${wh.level || wh.locationType}</span>
                      <span class="badge ${wh.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}">${wh.status}</span>
                    </div>
                    <p style="font-size:0.82rem; color:var(--text-muted); margin-top:4px;">${wh.description || 'Central storage facility.'}</p>
                    <div style="font-size:0.78rem; display:flex; gap:12px; flex-wrap:wrap; margin-top:6px; color:var(--text-secondary);">
                      <span>📍 Path: <strong>${wh.path || wh.locationCode}</strong></span>
                      <span>🌡 Condition: <strong>${wh.condition || 'Ambient'} ${wh.tempMin !== null && wh.tempMin !== undefined ? '(' + wh.tempMin + '°C – ' + wh.tempMax + '°C)' : ''}</strong></span>
                      <span>👤 Owner: <strong>${wh.responsibleManager || 'Inventory Manager'}</strong></span>
                      <span>🏷 Purpose: <strong>${(wh.purposes || ['Raw Materials']).join(', ')}</strong></span>
                    </div>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button class="btn-secondary btn-edit-loc" data-id="${wh.id}" style="font-size:0.78rem; padding:4px 10px;">✏️ Edit</button>
                    <button class="btn-secondary btn-archive-loc" data-id="${wh.id}" data-name="${wh.locationName}" style="font-size:0.78rem; padding:4px 10px; color:var(--status-danger); border-color:var(--status-danger);">📦 Archive</button>
                  </div>
                </div>

                ${children.length > 0 ? `
                  <div style="margin-top:14px; padding-top:12px; border-top:1px dashed var(--border-subtle); display:flex; flex-direction:column; gap:8px;">
                    <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">CHILD STORAGE LOCATIONS (${children.length})</div>
                    ${children.map(ch => {
      const grandChildren = getChildren(ch.locationCode);
      return `
                        <div style="background:var(--bg-surface-1); padding:12px 14px; border-radius:6px; border-left:3px solid var(--accent-secondary); margin-left:12px;">
                          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                            <div>
                              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <strong style="font-size:0.95rem;">├── 📦 ${ch.locationName}</strong>
                                <code style="font-size:0.75rem; background:var(--bg-surface-2); padding:2px 6px;">${ch.locationCode}</code>
                                <span class="badge badge-warning" style="font-size:0.7rem;">${ch.locationType}</span>
                                <span class="badge ${ch.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}" style="font-size:0.7rem;">${ch.status}</span>
                              </div>
                              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                                Path: <code>${ch.path || (wh.locationCode + ' / ' + ch.locationCode)}</code> • Condition: ${ch.condition || 'Ambient'} • Purpose: ${(ch.purposes || []).join(', ')}
                              </div>
                            </div>
                            <div style="display:flex; gap:6px;">
                              <button class="btn-secondary btn-edit-loc" data-id="${ch.id}" style="font-size:0.75rem; padding:3px 8px;">✏️ Edit</button>
                              <button class="btn-secondary btn-archive-loc" data-id="${ch.id}" data-name="${ch.locationName}" style="font-size:0.75rem; padding:3px 8px; color:var(--status-danger); border-color:var(--status-danger);">📦 Archive</button>
                            </div>
                          </div>

                          ${grandChildren.length > 0 ? `
                            <div style="margin-top:8px; padding-left:18px; display:flex; flex-direction:column; gap:4px;">
                              ${grandChildren.map(gc => `
                                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; background:var(--bg-surface-2); padding:6px 10px; border-radius:4px;">
                                  <span>└── 📑 <strong>${gc.locationName}</strong> (<code>${gc.locationCode}</code>) — ${gc.locationType}</span>
                                  <div>
                                    <button class="btn-secondary btn-edit-loc" data-id="${gc.id}" style="font-size:0.7rem; padding:2px 6px;">✏️ Edit</button>
                                  </div>
                                </div>
                              `).join('')}
                            </div>
                          ` : ''}
                        </div>
                      `;
    }).join('')}
                  </div>
                ` : ''}
              </div>
            `;
  }).join('')}
        </div>
      `;
}

openLocationModal(locIdOrObj, session) {
  const modalMount = this.appEl.querySelector('#modal-container-mount');
  const allLocs = storageLocationRepository.getAll(session.tenantId);
  const isEdit = !!locIdOrObj;
  const loc = isEdit ? (typeof locIdOrObj === 'string' ? storageLocationRepository.getById(locIdOrObj, session.tenantId) : locIdOrObj) : null;

  const modal = document.createElement('div');
  modal.className = 'lock-screen-overlay animate-fade-in';
  modal.innerHTML = `
        <div class="card modal-card" style="background:var(--bg-surface-1); padding:24px; width:min(850px, 95vw); max-height:90vh; overflow-y:auto;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0;">${isEdit ? '✏️ Edit Storage Location' : '🏬 + Add Storage Location'}</h3>
            <span class="badge badge-info">${isEdit ? (loc.locationCode || '') : 'New Record'}</span>
          </div>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:16px;">
            Enforced 7-Group Location Specification Engine (3-Level Physical Hierarchy & Operational Governance).
          </p>

          <form id="form-location-modal" style="display:flex; flex-direction:column; gap:16px;">
            <!-- Group 1 — Identity -->
            <fieldset style="border:1px solid var(--border-subtle); border-radius:6px; padding:14px;">
              <legend style="font-weight:700; font-size:0.85rem; padding:0 6px; color:var(--accent-primary);">1. Location Identity</legend>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Location Code *</label>
                  <input type="text" id="inp-loc-code" value="${loc ? loc.locationCode : ('LOC-' + Math.floor(100 + Math.random() * 900))}" required style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Location Name *</label>
                  <input type="text" id="inp-loc-name" value="${loc ? loc.locationName : ''}" placeholder="e.g. Walk-in Chiller" required style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Short Name / Abbr</label>
                  <input type="text" id="inp-loc-short" value="${loc ? (loc.shortName || '') : ''}" placeholder="e.g. CHILL" style="width:100%;">
                </div>
              </div>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-top:10px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Location Type *</label>
                  <select id="sel-loc-type" style="width:100%;">
                    ${['Warehouse', 'Store', 'Chiller', 'Freezer', 'Cold Room', 'Kitchen Store', 'Bar Store', 'Housekeeping Store', 'Packaging Store', 'Bin / Rack', 'Other'].map(t => `
                      <option value="${t}" ${loc && loc.locationType === t ? 'selected' : ''}>${t}</option>
                    `).join('')}
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Status</label>
                  <select id="sel-loc-status" style="width:100%;">
                    <option value="ACTIVE" ${!loc || loc.status === 'ACTIVE' ? 'selected' : ''}>Active</option>
                    <option value="INACTIVE" ${loc && loc.status === 'INACTIVE' ? 'selected' : ''}>Inactive</option>
                    <option value="ARCHIVED" ${loc && loc.status === 'ARCHIVED' ? 'selected' : ''}>Archived</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Description</label>
                  <input type="text" id="inp-loc-desc" value="${loc ? (loc.description || '') : ''}" placeholder="Central cold room" style="width:100%;">
                </div>
              </div>
            </fieldset>

            <!-- Group 2 — Hierarchy -->
            <fieldset style="border:1px solid var(--border-subtle); border-radius:6px; padding:14px;">
              <legend style="font-weight:700; font-size:0.85rem; padding:0 6px; color:var(--accent-primary);">2. Hierarchy Level & Parent Location</legend>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:12px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Location Level *</label>
                  <select id="sel-loc-level" style="width:100%;">
                    <option value="Warehouse" ${loc && loc.level === 'Warehouse' ? 'selected' : ''}>Level 1 — Warehouse (Top Level)</option>
                    <option value="Store" ${!loc || loc.level === 'Store' || loc.level === 'Store / Area' ? 'selected' : ''}>Level 2 — Store / Area</option>
                    <option value="Bin / Rack" ${loc && (loc.level === 'Bin / Rack' || loc.level === 'Bin') ? 'selected' : ''}>Level 3 — Bin / Rack / Shelf</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Parent Location</label>
                  <select id="sel-loc-parent" style="width:100%;">
                    <option value="">None (Top-Level Facility)</option>
                    ${allLocs.filter(l => !loc || l.locationCode !== loc.locationCode).map(l => `
                      <option value="${l.locationCode}" ${loc && loc.parentLocationCode === l.locationCode ? 'selected' : ''}>${l.locationName} (${l.locationCode})</option>
                    `).join('')}
                  </select>
                </div>
              </div>
            </fieldset>

            <!-- Group 3 — Purpose -->
            <fieldset style="border:1px solid var(--border-subtle); border-radius:6px; padding:14px;">
              <legend style="font-weight:700; font-size:0.85rem; padding:0 6px; color:var(--accent-primary);">3. Allowed Storage Purpose</legend>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; font-size:0.8rem;">
                ${['Raw Materials', 'Semi-Finished', 'Finished Goods', 'Beverages', 'Packaging', 'Consumables', 'Cleaning Supplies', 'Assets', 'Mixed'].map(p => {
    const checked = loc ? (loc.purposes || []).includes(p) : (p === 'Raw Materials');
    return `
                    <label style="display:flex; align-items:center; gap:6px;">
                      <input type="checkbox" class="chk-loc-purpose" value="${p}" ${checked ? 'checked' : ''}>
                      <span>${p}</span>
                    </label>
                  `;
  }).join('')}
              </div>
            </fieldset>

            <!-- Group 4 — Storage Conditions -->
            <fieldset style="border:1px solid var(--border-subtle); border-radius:6px; padding:14px;">
              <legend style="font-weight:700; font-size:0.85rem; padding:0 6px; color:var(--accent-primary);">4. Storage Conditions & Temperature Range</legend>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Storage Condition *</label>
                  <select id="sel-loc-cond" style="width:100%;">
                    ${['Ambient', 'Chilled', 'Frozen', 'Controlled', 'Other'].map(c => `
                      <option value="${c}" ${loc && loc.condition === c ? 'selected' : ''}>${c}</option>
                    `).join('')}
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Min Temperature (°C)</label>
                  <input type="number" id="inp-loc-tmin" value="${loc && loc.tempMin !== null && loc.tempMin !== undefined ? loc.tempMin : ''}" placeholder="e.g. 0" style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Max Temperature (°C)</label>
                  <input type="number" id="inp-loc-tmax" value="${loc && loc.tempMax !== null && loc.tempMax !== undefined ? loc.tempMax : ''}" placeholder="e.g. 5" style="width:100%;">
                </div>
              </div>
            </fieldset>

            <!-- Group 5 — Operational Permissions -->
            <fieldset style="border:1px solid var(--border-subtle); border-radius:6px; padding:14px;">
              <legend style="font-weight:700; font-size:0.85rem; padding:0 6px; color:var(--accent-primary);">5. Operational Permissions</legend>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; font-size:0.8rem;">
                ${[
      { id: 'perm-rec', key: 'receive', label: 'Receive Stock' },
      { id: 'perm-tr-in', key: 'transferIn', label: 'Transfer In' },
      { id: 'perm-tr-out', key: 'transferOut', label: 'Transfer Out' },
      { id: 'perm-issue', key: 'issue', label: 'Issue to Workspace' },
      { id: 'perm-prod', key: 'production', label: 'Production Consumption' },
      { id: 'perm-count', key: 'count', label: 'Stock Count' },
      { id: 'perm-adj', key: 'adjustment', label: 'Stock Adjustment' }
    ].map(item => {
      const checked = loc && loc.permissions ? !!loc.permissions[item.key] : (item.key !== 'production');
      return `
                    <label style="display:flex; align-items:center; gap:6px;">
                      <input type="checkbox" id="${item.id}" data-key="${item.key}" ${checked ? 'checked' : ''}>
                      <span>${item.label}</span>
                    </label>
                  `;
    }).join('')}
              </div>
            </fieldset>

            <!-- Group 6 — Ownership & Security -->
            <fieldset style="border:1px solid var(--border-subtle); border-radius:6px; padding:14px;">
              <legend style="font-weight:700; font-size:0.85rem; padding:0 6px; color:var(--accent-primary);">6. Workspace Ownership & Security Rules</legend>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:12px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Responsible Workspace</label>
                  <select id="sel-loc-workspace" style="width:100%;">
                    <option value="inventory" ${!loc || loc.responsibleWorkspace === 'inventory' ? 'selected' : ''}>Inventory Workspace</option>
                    <option value="kitchen" ${loc && loc.responsibleWorkspace === 'kitchen' ? 'selected' : ''}>Kitchen Workspace</option>
                    <option value="bar" ${loc && loc.responsibleWorkspace === 'bar' ? 'selected' : ''}>Bar Workspace</option>
                    <option value="admin" ${loc && loc.responsibleWorkspace === 'admin' ? 'selected' : ''}>Admin Workspace</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Responsible Manager</label>
                  <input type="text" id="inp-loc-manager" value="${loc ? (loc.responsibleManager || '') : 'Inventory Manager'}" placeholder="e.g. Head Chef" style="width:100%;">
                </div>
              </div>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; margin-top:10px; font-size:0.8rem;">
                <label style="display:flex; align-items:center; gap:6px;">
                  <input type="checkbox" id="chk-loc-restricted" ${loc && loc.restrictedAccess ? 'checked' : ''}>
                  <span>Restricted Key Access</span>
                </label>
                <label style="display:flex; align-items:center; gap:6px;">
                  <input type="checkbox" id="chk-loc-food" ${!loc || loc.foodStorage !== false ? 'checked' : ''}>
                  <span>Food Storage Allowed</span>
                </label>
                <label style="display:flex; align-items:center; gap:6px;">
                  <input type="checkbox" id="chk-loc-alcohol" ${loc && loc.alcoholStorage ? 'checked' : ''}>
                  <span>Alcohol Storage Allowed</span>
                </label>
              </div>
            </fieldset>

            <!-- Group 7 — Physical Details & Notes -->
            <fieldset style="border:1px solid var(--border-subtle); border-radius:6px; padding:14px;">
              <legend style="font-weight:700; font-size:0.85rem; padding:0 6px; color:var(--accent-primary);">7. Physical Details & Operational Notes</legend>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Building</label>
                  <input type="text" id="inp-loc-bldg" value="${loc ? (loc.building || '') : ''}" placeholder="Main Restaurant" style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Floor</label>
                  <input type="text" id="inp-loc-floor" value="${loc ? (loc.floor || '') : ''}" placeholder="Ground Floor" style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Room / Area</label>
                  <input type="text" id="inp-loc-room" value="${loc ? (loc.room || '') : ''}" placeholder="BOH-01" style="width:100%;">
                </div>
              </div>
              <div style="margin-top:10px;">
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Operational Notes</label>
                <input type="text" id="inp-loc-notes" value="${loc ? (loc.notes || '') : ''}" placeholder="Access restricted after service hours" style="width:100%;">
              </div>
            </fieldset>

            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:12px;">
              <button type="button" class="btn-secondary" id="btn-cancel-loc-modal">Cancel</button>
              <button type="submit" class="btn-primary">${isEdit ? '💾 Update Location' : '✨ Save Storage Location'}</button>
            </div>
          </form>
        </div>
      `;
  modalMount.appendChild(modal);

  modal.querySelector('#btn-cancel-loc-modal').addEventListener('click', () => { modalMount.innerHTML = ''; });
  modal.querySelector('#form-location-modal').addEventListener('submit', (e) => {
    e.preventDefault();
    const locationCode = modal.querySelector('#inp-loc-code').value.trim();
    const locationName = modal.querySelector('#inp-loc-name').value.trim();
    const shortName = modal.querySelector('#inp-loc-short').value.trim();
    const locationType = modal.querySelector('#sel-loc-type').value;
    const status = modal.querySelector('#sel-loc-status').value;
    const description = modal.querySelector('#inp-loc-desc').value.trim();
    const level = modal.querySelector('#sel-loc-level').value;
    const parentLocationCode = modal.querySelector('#sel-loc-parent').value;

    const purposes = Array.from(modal.querySelectorAll('.chk-loc-purpose:checked')).map(cb => cb.value);
    const condition = modal.querySelector('#sel-loc-cond').value;
    const tempMinVal = modal.querySelector('#inp-loc-tmin').value;
    const tempMaxVal = modal.querySelector('#inp-loc-tmax').value;
    const tempMin = tempMinVal !== '' ? parseFloat(tempMinVal) : null;
    const tempMax = tempMaxVal !== '' ? parseFloat(tempMaxVal) : null;

    const permissions = {
      receive: modal.querySelector('#perm-rec').checked,
      transferIn: modal.querySelector('#perm-tr-in').checked,
      transferOut: modal.querySelector('#perm-tr-out').checked,
      issue: modal.querySelector('#perm-issue').checked,
      production: modal.querySelector('#perm-prod').checked,
      count: modal.querySelector('#perm-count').checked,
      adjustment: modal.querySelector('#perm-adj').checked
    };

    const responsibleWorkspace = modal.querySelector('#sel-loc-workspace').value;
    const responsibleManager = modal.querySelector('#inp-loc-manager').value.trim();
    const restrictedAccess = modal.querySelector('#chk-loc-restricted').checked;
    const foodStorage = modal.querySelector('#chk-loc-food').checked;
    const alcoholStorage = modal.querySelector('#chk-loc-alcohol').checked;

    const building = modal.querySelector('#inp-loc-bldg').value.trim();
    const floor = modal.querySelector('#inp-loc-floor').value.trim();
    const room = modal.querySelector('#inp-loc-room').value.trim();
    const notes = modal.querySelector('#inp-loc-notes').value.trim();

    if (!locationCode || !locationName) {
      alert('❌ Please enter required Location Code and Location Name.');
      return;
    }

    const dataObj = {
      locationCode, locationName, shortName, locationType, status, description,
      level, parentLocationCode, purposes, condition, tempMin, tempMax,
      permissions, responsibleWorkspace, responsibleManager, restrictedAccess,
      foodStorage, alcoholStorage, building, floor, room, notes
    };

    if (isEdit) {
      storageLocationRepository.update(loc.id, dataObj, session);
      alert(`✔ Storage Location "${locationName}" updated!`);
    } else {
      storageLocationRepository.create(dataObj, session);
      alert(`✨ Storage Location "${locationName}" created!`);
    }

    modalMount.innerHTML = '';
    this.render();
  });
}

downloadSampleStorageLocationTemplate() {
  const csvContent = `Location Code,Location Name,Short Name,Location Type,Location Level,Parent Code,Purpose,Condition,Min Temp,Max Temp,Owner Workspace,Owner Manager,Building,Floor,Room,Notes
LOC-MWH,Main Warehouse,MWH,Warehouse,Warehouse,,Raw Materials;Packaging,Ambient,18,30,inventory,Inventory Manager,Main Building,Ground Floor,BOH-01,Central receiving warehouse
LOC-DRY,Dry Store,DRY,Store,Store,LOC-MWH,Raw Materials,Ambient,20,28,inventory,Inventory Manager,Main Building,Ground Floor,BOH-02,Dry food items & spices
LOC-CHILL,Walk-in Chiller,CHILL,Chiller,Store,LOC-MWH,Raw Materials;Semi-Finished,Chilled,0,5,inventory,Inventory Manager,Main Building,Ground Floor,BOH-03,Dairy & meat cold room
LOC-FREEZE,Deep Freezer,FREEZE,Freezer,Store,LOC-MWH,Raw Materials,Frozen,-24,-18,inventory,Inventory Manager,Main Building,Ground Floor,BOH-04,Deep freezer
LOC-KITCHEN,Kitchen Store,KITCHEN,Kitchen Store,Store,LOC-MWH,Raw Materials;Semi-Finished,Ambient,,,kitchen,Head Chef,Main Building,Ground Floor,Kitchen Line,Line prep store
LOC-BAR,Bar Store,BAR,Bar Store,Store,LOC-MWH,Beverages,Ambient,,,bar,Bar Manager,Main Building,Ground Floor,Bar Counter,Liquor & mixer store`;

  const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'Sample_Storage_Locations_Template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

exportStorageLocationsData(session) {
  const locations = storageLocationRepository.getAll(session.tenantId) || [];
  if (!locations.length) {
    alert('No storage locations available to export.');
    return;
  }
  const headers = ['Location Code', 'Location Name', 'Short Name', 'Location Type', 'Location Level', 'Parent Code', 'Path', 'Purpose', 'Condition', 'Min Temp', 'Max Temp', 'Owner Workspace', 'Owner Manager', 'Status'];
  const rows = locations.map(l => [
    `"${(l.locationCode || '').replace(/"/g, '""')}"`,
    `"${(l.locationName || '').replace(/"/g, '""')}"`,
    `"${(l.shortName || '').replace(/"/g, '""')}"`,
    `"${(l.locationType || 'Store').replace(/"/g, '""')}"`,
    `"${(l.level || 'Store').replace(/"/g, '""')}"`,
    `"${(l.parentLocationCode || '').replace(/"/g, '""')}"`,
    `"${(l.path || l.locationCode || '').replace(/"/g, '""')}"`,
    `"${((l.purposes || []).join(';')).replace(/"/g, '""')}"`,
    `"${(l.condition || 'Ambient').replace(/"/g, '""')}"`,
    `"${l.tempMin !== null && l.tempMin !== undefined ? l.tempMin : ''}"`,
    `"${l.tempMax !== null && l.tempMax !== undefined ? l.tempMax : ''}"`,
    `"${(l.responsibleWorkspace || 'inventory').replace(/"/g, '""')}"`,
    `"${(l.responsibleManager || 'Inventory Manager').replace(/"/g, '""')}"`,
    `"${(l.status || 'ACTIVE').replace(/"/g, '""')}"`
  ]);

  const csvString = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvString);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Storage_Locations_Export_${session.tenantId || 'Master'}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

importStorageLocationsFromFile(file, session) {
  if (!file) return;

  const sanitizeStr = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/^\uFEFF/, '')
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      .trim()
      .replace(/^"+|"+$/g, '');
  };

  const parseRowsAndImport = (rows) => {
    if (!rows || rows.length < 2) {
      alert('❌ File must contain a header row and at least one storage location row.');
      return;
    }

    const rawHeaders = rows[0].map(h => sanitizeStr(h));
    const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    const getIndex = (possibleKeys) => headers.findIndex(h => possibleKeys.includes(h));

    const codeIdx = getIndex(['locationcode', 'code', 'loccode', 'id']);
    const nameIdx = getIndex(['locationname', 'name', 'locname', 'storagename']);
    const shortIdx = getIndex(['shortname', 'abbr', 'alias']);
    const typeIdx = getIndex(['locationtype', 'type', 'storagetype']);
    const levelIdx = getIndex(['locationlevel', 'level']);
    const parentIdx = getIndex(['parentcode', 'parentlocationcode', 'parent']);
    const purposeIdx = getIndex(['purpose', 'purposes', 'storagepurpose']);
    const conditionIdx = getIndex(['condition', 'storagecondition']);
    const tminIdx = getIndex(['mintemp', 'tempmin', 'minimumtemperature']);
    const tmaxIdx = getIndex(['maxtemp', 'tempmax', 'maximumtemperature']);
    const wrkIdx = getIndex(['ownerworkspace', 'responsibleworkspace', 'workspace']);
    const mgrIdx = getIndex(['ownermanager', 'responsiblemanager', 'manager']);
    const bldgIdx = getIndex(['building']);
    const floorIdx = getIndex(['floor']);
    const roomIdx = getIndex(['room']);
    const notesIdx = getIndex(['notes', 'description']);

    const parsedLocs = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || !row.some(c => String(c).trim().length > 0)) continue;

      const name = sanitizeStr(nameIdx !== -1 ? row[nameIdx] : (row[1] || row[0]));
      if (!name) continue;

      const locationCode = sanitizeStr(codeIdx !== -1 && row[codeIdx] ? row[codeIdx] : ('LOC-' + Math.floor(100 + Math.random() * 900)));
      const shortName = sanitizeStr(shortIdx !== -1 ? row[shortIdx] : '');
      const locationType = sanitizeStr(typeIdx !== -1 ? row[typeIdx] : 'Store');
      const level = sanitizeStr(levelIdx !== -1 ? row[levelIdx] : 'Store');
      const parentLocationCode = sanitizeStr(parentIdx !== -1 ? row[parentIdx] : '');
      const purposeStr = sanitizeStr(purposeIdx !== -1 ? row[purposeIdx] : 'Raw Materials');
      const purposes = purposeStr ? purposeStr.split(/;|\||,/).map(p => p.trim()).filter(Boolean) : ['Raw Materials'];
      const condition = sanitizeStr(conditionIdx !== -1 ? row[conditionIdx] : 'Ambient');
      const tminVal = sanitizeStr(tminIdx !== -1 ? row[tminIdx] : '');
      const tmaxVal = sanitizeStr(tmaxIdx !== -1 ? row[tmaxIdx] : '');
      const tempMin = tminVal !== '' ? parseFloat(tminVal) : null;
      const tempMax = tmaxVal !== '' ? parseFloat(tmaxVal) : null;
      const responsibleWorkspace = sanitizeStr(wrkIdx !== -1 ? row[wrkIdx] : 'inventory');
      const responsibleManager = sanitizeStr(mgrIdx !== -1 ? row[mgrIdx] : 'Inventory Manager');
      const building = sanitizeStr(bldgIdx !== -1 ? row[bldgIdx] : '');
      const floor = sanitizeStr(floorIdx !== -1 ? row[floorIdx] : '');
      const room = sanitizeStr(roomIdx !== -1 ? row[roomIdx] : '');
      const notes = sanitizeStr(notesIdx !== -1 ? row[notesIdx] : '');

      parsedLocs.push({
        locationCode,
        locationName: name,
        shortName,
        locationType: locationType || 'Store',
        level: level || 'Store',
        parentLocationCode,
        purposes: purposes.length > 0 ? purposes : ['Raw Materials'],
        condition: condition || 'Ambient',
        tempMin,
        tempMax,
        responsibleWorkspace: responsibleWorkspace || 'inventory',
        responsibleManager: responsibleManager || 'Inventory Manager',
        building,
        floor,
        room,
        notes,
        status: 'ACTIVE'
      });
    }

    if (parsedLocs.length === 0) {
      alert('❌ No valid storage location records found in file.');
      return;
    }

    this.openLocationImportConfirmationModal(parsedLocs, file.name, session);
  };

  const fileName = file.name.toLowerCase();
  const isExcelFile = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

  if (isExcelFile || typeof XLSX !== 'undefined') {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        if (window.XLSX) {
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
          parseRowsAndImport(rows);
        } else {
          const text = new TextDecoder('utf-8').decode(data);
          const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
          const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') inQuotes = !inQuotes;
              else if ((char === ',' || char === '\t' || char === ';') && !inQuotes) { result.push(current); current = ''; }
              else current += char;
            }
            result.push(current);
            return result;
          };
          parseRowsAndImport(lines.map(l => parseCSVLine(l)));
        }
      } catch (err) {
        console.error('Failed to parse Excel file:', err);
        alert('❌ Unable to parse Excel file. Please save as CSV format (.csv) and re-upload.');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if ((char === ',' || char === '\t' || char === ';') && !inQuotes) { result.push(current); current = ''; }
          else current += char;
        }
        result.push(current);
        return result;
      };
      parseRowsAndImport(lines.map(l => parseCSVLine(l)));
    };
    reader.readAsText(file);
  }
}

openLocationImportConfirmationModal(parsedLocations, fileName, session) {
  const modalMount = this.appEl.querySelector('#modal-container-mount');
  const modal = document.createElement('div');
  modal.className = 'lock-screen-overlay animate-fade-in';
  modal.innerHTML = `
        <div class="card modal-card" style="background:var(--bg-surface-1); padding:24px; width:min(900px, 95vw);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">📥 Confirm Storage Locations Bulk Import</h3>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                Review the ${parsedLocations.length} parsed storage locations from <strong>${fileName}</strong> before importing.
              </p>
            </div>
            <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">
              ${parsedLocations.length} Locations Ready
            </span>
          </div>

          <div class="table-responsive" style="max-height:350px; overflow-y:auto; border:1px solid var(--border-subtle); border-radius:6px; margin-bottom:20px;">
            <table class="data-table" style="width:100%; font-size:0.82rem;">
              <thead>
                <tr style="background:var(--bg-surface-2); position:sticky; top:0; z-index:1;">
                  <th style="padding:8px;">#</th>
                  <th style="padding:8px;">Code</th>
                  <th style="padding:8px;">Location Name</th>
                  <th style="padding:8px;">Type & Level</th>
                  <th style="padding:8px;">Parent Code</th>
                  <th style="padding:8px;">Condition</th>
                  <th style="padding:8px;">Owner Manager</th>
                </tr>
              </thead>
              <tbody>
                ${parsedLocations.map((l, idx) => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:8px; color:var(--text-muted);">${idx + 1}</td>
                    <td style="padding:8px; font-weight:700; color:var(--accent-primary);">${l.locationCode}</td>
                    <td style="padding:8px; font-weight:600;">${l.locationName}</td>
                    <td style="padding:8px;"><span class="badge badge-info">${l.locationType} (${l.level})</span></td>
                    <td style="padding:8px;">${l.parentLocationCode || 'None (Top Level)'}</td>
                    <td style="padding:8px;"><span class="badge badge-warning">${l.condition}</span></td>
                    <td style="padding:8px;">${l.responsibleManager}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:12px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary" id="btn-cancel-loc-import" style="padding:10px 18px;">❌ Cancel</button>
            <button class="btn-primary" id="btn-confirm-loc-import" style="padding:10px 20px; font-weight:700;">
              ✅ Confirm & Import ${parsedLocations.length} Locations
            </button>
          </div>
        </div>
      `;
  modalMount.appendChild(modal);

  modal.querySelector('#btn-cancel-loc-import').addEventListener('click', () => { modalMount.innerHTML = ''; });
  modal.querySelector('#btn-confirm-loc-import').addEventListener('click', () => {
    parsedLocations.forEach(loc => {
      storageLocationRepository.create(loc, session);
    });
    modalMount.innerHTML = '';
    alert(`🎉 Successfully imported ${parsedLocations.length} storage locations!`);
    this.render();
  });
}

downloadSampleSupplierTemplate() {
  const csvContent = `Supplier Code,Supplier Name,Primary Contact,Phone,Email,GSTIN,FSSAI License,Payment Terms,Address
SUP-101,Fresh Farm Produce Pvt Ltd,Ramesh Kumar,+91 9876543210,orders@freshfarm.com,27AAAAA1234A1Z5,10012022000123,NET30,Plot 42 APMC Market Vashi Navi Mumbai
SUP-102,Apex Dairy & Poultry Traders,Sunil Sharma,+91 9812345678,sales@apexdairy.com,27BBBBA5678B1Z2,10015022000456,NET15,Gala 15 Industrial Estate Thane
SUP-103,Royal Spice & Grocery Supplies,Anita Verma,+91 9765432109,info@royalspice.in,27CCCCA9876C1Z9,10018022000789,COD,88 Grain Merchant Street Crawford Market Mumbai
SUP-104,Ocean Harvest Seafood Co,David Dsouza,+91 9823456789,fresh@oceanharvest.com,27DDDDA4321D1Z8,10019022000890,NET7,Sassoon Dock Colaba Mumbai
SUP-105,Beverage World Supplies,Vikram Mehta,+91 9898989898,supply@beverageworld.com,27EEEEA8765E1Z4,10020022000999,NET30,Andheri MIDC Mumbai`;

  const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'Sample_Suppliers_Template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

exportSuppliersData(session) {
  const suppliers = supplierRepository.getAll(session.tenantId) || [];
  if (!suppliers.length) {
    alert('No suppliers available to export.');
    return;
  }
  const headers = ['Supplier Code', 'Supplier Name', 'Primary Contact', 'Phone', 'Email', 'GSTIN', 'FSSAI License', 'Payment Terms', 'Address', 'Status'];
  const rows = suppliers.map(s => [
    `"${(s.supplierCode || '').replace(/"/g, '""')}"`,
    `"${(s.supplierName || '').replace(/"/g, '""')}"`,
    `"${(s.primaryContact || '').replace(/"/g, '""')}"`,
    `"${(s.phone || '').replace(/"/g, '""')}"`,
    `"${(s.email || '').replace(/"/g, '""')}"`,
    `"${(s.gstin || '').replace(/"/g, '""')}"`,
    `"${(s.fssaiLicense || '').replace(/"/g, '""')}"`,
    `"${(s.paymentTerms || 'NET30').replace(/"/g, '""')}"`,
    `"${(s.address || '').replace(/"/g, '""')}"`,
    `"${(s.status || 'ACTIVE').replace(/"/g, '""')}"`
  ]);

  const csvString = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvString);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Suppliers_Export_${session.tenantId || 'Master'}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

importSuppliersFromCSV(file, session) {
  if (!file) return;

  const sanitizeStr = (str) => {
    if (str === null || str === undefined) return '';
    let s = String(str)
      .replace(/^\uFEFF/, '') // Remove UTF-8 BOM
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      .trim()
      .replace(/^"+|"+$/g, ''); // Remove surrounding quotes

    // Normalize scientific notation (e.g. 1.0012E+13 or 1.0012e+13)
    if (/^\d+(\.\d+)?[eE]\+\d+$/i.test(s)) {
      try {
        const num = Number(s);
        if (!isNaN(num)) {
          s = BigInt(Math.round(num)).toString();
        }
      } catch (e) { }
    }
    return s;
  };

  const parseRowsAndImport = (rows) => {
    if (!rows || rows.length < 2) {
      alert('❌ File must contain a header row and at least one supplier data row.');
      return;
    }

    const rawHeaders = rows[0].map(h => sanitizeStr(h));
    const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    const getIndex = (possibleKeys) => headers.findIndex(h => possibleKeys.includes(h));

    const codeIdx = getIndex(['suppliercode', 'code', 'supplierid', 'id']);
    const nameIdx = getIndex(['suppliername', 'name', 'company', 'companyname', 'supplier']);
    const contactIdx = getIndex(['primarycontact', 'contact', 'contactperson', 'person', 'contactname']);
    const phoneIdx = getIndex(['phone', 'mobile', 'telephone', 'contactnumber', 'phonenumber']);
    const emailIdx = getIndex(['email', 'emailaddress', 'mail']);
    const gstinIdx = getIndex(['gstin', 'gst', 'gstnumber', 'taxid']);
    const fssaiIdx = getIndex(['fssailicense', 'fssai', 'license', 'fssainumber', 'fssailicence']);
    const termsIdx = getIndex(['paymentterms', 'terms', 'paymentterm', 'payterms']);
    const addressIdx = getIndex(['address', 'location', 'city', 'streetaddress']);

    const parsedSuppliers = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || !row.some(c => String(c).trim().length > 0)) continue;

      const name = sanitizeStr(nameIdx !== -1 ? row[nameIdx] : (row[1] || row[0]));
      if (!name) continue;

      const supplierCode = sanitizeStr(codeIdx !== -1 && row[codeIdx] ? row[codeIdx] : ('SUP-' + Math.floor(100 + Math.random() * 900)));
      const primaryContact = sanitizeStr(contactIdx !== -1 ? row[contactIdx] : '');
      const phone = sanitizeStr(phoneIdx !== -1 ? row[phoneIdx] : '');
      const email = sanitizeStr(emailIdx !== -1 ? row[emailIdx] : '');
      const gstin = sanitizeStr(gstinIdx !== -1 ? row[gstinIdx] : '');
      const fssaiLicense = sanitizeStr(fssaiIdx !== -1 ? row[fssaiIdx] : '');
      const paymentTerms = sanitizeStr(termsIdx !== -1 ? row[termsIdx] : 'NET30');
      const address = sanitizeStr(addressIdx !== -1 ? row[addressIdx] : '');

      parsedSuppliers.push({
        supplierCode,
        supplierName: name,
        primaryContact,
        phone,
        email,
        gstin,
        fssaiLicense,
        paymentTerms: paymentTerms || 'NET30',
        address,
        status: 'ACTIVE'
      });
    }

    if (parsedSuppliers.length === 0) {
      alert('❌ No valid supplier records found in the file.');
      return;
    }

    this.openImportConfirmationModal(parsedSuppliers, file.name, session);
  };

  const fileName = file.name.toLowerCase();
  const isExcelFile = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

  if (isExcelFile || typeof XLSX !== 'undefined') {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        if (window.XLSX) {
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
          parseRowsAndImport(rows);
        } else {
          // Fallback to text parsing if XLSX library isn't loaded
          const text = new TextDecoder('utf-8').decode(data);
          const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
          const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') inQuotes = !inQuotes;
              else if ((char === ',' || char === '\t' || char === ';') && !inQuotes) { result.push(current); current = ''; }
              else current += char;
            }
            result.push(current);
            return result;
          };
          parseRowsAndImport(lines.map(l => parseCSVLine(l)));
        }
      } catch (err) {
        console.error('Failed to parse Excel file:', err);
        alert('❌ Unable to parse Excel file. Please save as CSV format (.csv) and re-upload.');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if ((char === ',' || char === '\t' || char === ';') && !inQuotes) { result.push(current); current = ''; }
          else current += char;
        }
        result.push(current);
        return result;
      };
      parseRowsAndImport(lines.map(l => parseCSVLine(l)));
    };
    reader.readAsText(file);
  }
}

openImportConfirmationModal(parsedSuppliers, fileName, session) {
  const modalMount = this.appEl.querySelector('#modal-container-mount');
  const modal = document.createElement('div');
  modal.className = 'lock-screen-overlay animate-fade-in';
  modal.innerHTML = `
        <div class="card modal-card" style="background:var(--bg-surface-1); padding:24px; width:min(900px, 95vw);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">📥 Confirm Bulk Supplier Import</h3>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                Review the ${parsedSuppliers.length} parsed supplier records from <strong>${fileName}</strong> before importing into database.
              </p>
            </div>
            <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">
              ${parsedSuppliers.length} Records Ready
            </span>
          </div>

          <div class="table-responsive" style="max-height:350px; overflow-y:auto; border:1px solid var(--border-subtle); border-radius:6px; margin-bottom:20px;">
            <table class="data-table" style="width:100%; font-size:0.82rem;">
              <thead>
                <tr style="background:var(--bg-surface-2); position:sticky; top:0; z-index:1;">
                  <th style="padding:8px;">#</th>
                  <th style="padding:8px;">Code</th>
                  <th style="padding:8px;">Supplier Name</th>
                  <th style="padding:8px;">Contact Person</th>
                  <th style="padding:8px;">Phone</th>
                  <th style="padding:8px;">Email</th>
                  <th style="padding:8px;">GSTIN</th>
                  <th style="padding:8px;">Terms</th>
                </tr>
              </thead>
              <tbody>
                ${parsedSuppliers.map((s, idx) => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:8px; color:var(--text-muted);">${idx + 1}</td>
                    <td style="padding:8px; font-weight:700; color:var(--accent-primary);">${s.supplierCode}</td>
                    <td style="padding:8px; font-weight:600;">${s.supplierName}</td>
                    <td style="padding:8px;">${s.primaryContact || '--'}</td>
                    <td style="padding:8px;">${s.phone || '--'}</td>
                    <td style="padding:8px;">${s.email || '--'}</td>
                    <td style="padding:8px; font-family:monospace;">${s.gstin || '--'}</td>
                    <td style="padding:8px;"><span class="badge badge-info">${s.paymentTerms}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:12px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary" id="btn-cancel-import-action" style="padding:10px 18px;">
              ❌ Cancel
            </button>
            <button class="btn-primary" id="btn-confirm-import-action" style="padding:10px 20px; font-weight:700;">
              ✅ Confirm & Import ${parsedSuppliers.length} Suppliers
            </button>
          </div>
        </div>
      `;
  modalMount.appendChild(modal);

  modal.querySelector('#btn-cancel-import-action').addEventListener('click', () => {
    modalMount.removeChild(modal);
  });

  modal.querySelector('#btn-confirm-import-action').addEventListener('click', () => {
    parsedSuppliers.forEach(sup => {
      supplierRepository.create(sup, session);
    });

    const totalSuppliers = (supplierRepository.getAll(session.tenantId) || []).length;
    modalMount.removeChild(modal);
    alert(`🎉 Successfully imported ${parsedSuppliers.length} suppliers!\nTotal active suppliers in database: ${totalSuppliers}`);
    this.render();
  });
}

openAddSupplierModal(session) {
  const modalMount = this.appEl.querySelector('#modal-container-mount');
  const modal = document.createElement('div');
  modal.className = 'lock-screen-overlay animate-fade-in';
  modal.innerHTML = `
        <div class="card modal-card" style="background:var(--bg-surface-1); padding:24px;">
          <h3>+ Add Supplier</h3>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:16px;">Add a new vendor record to master data.</p>
          <div class="flex-col gap-sm">
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Supplier Code *</label>
                <input type="text" id="inp-sup-code" value="SUP-${Math.floor(100 + Math.random() * 900)}" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Supplier / Vendor Name *</label>
                <input type="text" id="inp-sup-name" placeholder="e.g. Apex Farm Traders" style="width:100%;">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Primary Contact Person</label>
                <input type="text" id="inp-sup-contact" placeholder="e.g. Rajesh Kumar" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Phone Number</label>
                <input type="text" id="inp-sup-phone" placeholder="e.g. +91 9876543210" style="width:100%;">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Email Address</label>
                <input type="email" id="inp-sup-email" placeholder="orders@vendor.com" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">GSTIN (Tax ID)</label>
                <input type="text" id="inp-sup-gst" placeholder="27AAAAA0000A1Z5" style="width:100%;">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">FSSAI License No.</label>
                <input type="text" id="inp-sup-fssai" placeholder="10012022000123" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Payment Terms</label>
                <select id="inp-sup-terms" style="width:100%;">
                  <option value="NET30">NET30 (30 Days)</option>
                  <option value="NET15">NET15 (15 Days)</option>
                  <option value="NET7">NET7 (7 Days)</option>
                  <option value="COD">COD (Cash On Delivery)</option>
                  <option value="ADVANCE">Advance Payment</option>
                </select>
              </div>
            </div>
            <div>
              <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Office / Warehouse Address</label>
              <input type="text" id="inp-sup-address" placeholder="e.g. Market Yard Vashi Mumbai" style="width:100%;">
            </div>
            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:16px;">
              <button class="btn-secondary" id="btn-cancel-sup-modal">Cancel</button>
              <button class="btn-primary" id="btn-save-sup">Save Supplier</button>
            </div>
          </div>
        </div>
      `;
  modalMount.appendChild(modal);

  modal.querySelector('#btn-cancel-sup-modal').addEventListener('click', () => { modalMount.innerHTML = ''; });
  modal.querySelector('#btn-save-sup').addEventListener('click', () => {
    const supplierCode = modal.querySelector('#inp-sup-code').value;
    const supplierName = modal.querySelector('#inp-sup-name').value;
    const primaryContact = modal.querySelector('#inp-sup-contact').value;
    const phone = modal.querySelector('#inp-sup-phone').value;
    const email = modal.querySelector('#inp-sup-email').value;
    const gstin = modal.querySelector('#inp-sup-gst').value;
    const fssaiLicense = modal.querySelector('#inp-sup-fssai').value;
    const paymentTerms = modal.querySelector('#inp-sup-terms').value;
    const address = modal.querySelector('#inp-sup-address').value;

    if (!supplierName) { alert('Please enter Supplier Name'); return; }

    supplierRepository.create({
      supplierCode, supplierName, primaryContact, phone, email, gstin, fssaiLicense, paymentTerms, address, status: 'ACTIVE'
    }, session);

    modalMount.innerHTML = '';
    this.render();
  });
}

openEditSupplierModal(supId, session) {
  const modalMount = this.appEl.querySelector('#modal-container-mount');
  const suppliers = offlineStore.getCollection('suppliers') || [];
  const sup = suppliers.find(s => s.id === supId || s.supplierCode === supId);
  if (!sup) {
    alert('❌ Supplier record not found.');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'lock-screen-overlay animate-fade-in';
  modal.innerHTML = `
        <div class="card modal-card" style="background:var(--bg-surface-1); padding:24px;">
          <h3>✏️ Edit Supplier</h3>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:16px;">Update vendor contact, tax registration, and payment terms.</p>
          <div class="flex-col gap-sm">
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Supplier Code *</label>
                <input type="text" id="inp-edit-sup-code" value="${sup.supplierCode || ''}" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Supplier / Vendor Name *</label>
                <input type="text" id="inp-edit-sup-name" value="${(sup.supplierName || '').replace(/"/g, '&quot;')}" style="width:100%;">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Primary Contact Person</label>
                <input type="text" id="inp-edit-sup-contact" value="${(sup.primaryContact || '').replace(/"/g, '&quot;')}" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Phone Number</label>
                <input type="text" id="inp-edit-sup-phone" value="${sup.phone || ''}" style="width:100%;">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Email Address</label>
                <input type="email" id="inp-edit-sup-email" value="${sup.email || ''}" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">GSTIN (Tax ID)</label>
                <input type="text" id="inp-edit-sup-gst" value="${sup.gstin || ''}" style="width:100%;">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">FSSAI License No.</label>
                <input type="text" id="inp-edit-sup-fssai" value="${sup.fssaiLicense || ''}" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Payment Terms</label>
                <select id="inp-edit-sup-terms" style="width:100%;">
                  <option value="NET30" ${sup.paymentTerms === 'NET30' ? 'selected' : ''}>NET30 (30 Days)</option>
                  <option value="NET15" ${sup.paymentTerms === 'NET15' ? 'selected' : ''}>NET15 (15 Days)</option>
                  <option value="NET7" ${sup.paymentTerms === 'NET7' ? 'selected' : ''}>NET7 (7 Days)</option>
                  <option value="COD" ${sup.paymentTerms === 'COD' ? 'selected' : ''}>COD (Cash On Delivery)</option>
                  <option value="ADVANCE" ${sup.paymentTerms === 'ADVANCE' ? 'selected' : ''}>Advance Payment</option>
                </select>
              </div>
            </div>
            <div>
              <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Office / Warehouse Address</label>
              <input type="text" id="inp-edit-sup-address" value="${(sup.address || '').replace(/"/g, '&quot;')}" style="width:100%;">
            </div>
            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:16px;">
              <button class="btn-secondary" id="btn-cancel-edit-sup">Cancel</button>
              <button class="btn-primary" id="btn-save-edit-sup">💾 Save Changes</button>
            </div>
          </div>
        </div>
      `;
  modalMount.appendChild(modal);

  modal.querySelector('#btn-cancel-edit-sup').addEventListener('click', () => { modalMount.innerHTML = ''; });
  modal.querySelector('#btn-save-edit-sup').addEventListener('click', () => {
    const supplierCode = modal.querySelector('#inp-edit-sup-code').value.trim();
    const supplierName = modal.querySelector('#inp-edit-sup-name').value.trim();
    const primaryContact = modal.querySelector('#inp-edit-sup-contact').value.trim();
    const phone = modal.querySelector('#inp-edit-sup-phone').value.trim();
    const email = modal.querySelector('#inp-edit-sup-email').value.trim();
    const gstin = modal.querySelector('#inp-edit-sup-gst').value.trim();
    const fssaiLicense = modal.querySelector('#inp-edit-sup-fssai').value.trim();
    const paymentTerms = modal.querySelector('#inp-edit-sup-terms').value;
    const address = modal.querySelector('#inp-edit-sup-address').value.trim();

    if (!supplierName) { alert('Please enter Supplier Name'); return; }

    offlineStore.updateItem('suppliers', 'id', sup.id, {
      supplierCode, supplierName, primaryContact, phone, email, gstin, fssaiLicense, paymentTerms, address, modifiedAt: new Date().toISOString()
    });

    logAudit(session.employeeName, `Updated Supplier "${supplierName}" (${supplierCode})`, session.tenantId);
    modalMount.innerHTML = '';
    alert(`💾 Supplier "${supplierName}" updated successfully.`);
    this.render();
  });
}

downloadSampleCategoryTemplate() {
  const csv = `CategoryCode,CategoryName,ProductFamilyCode,DefaultBaseUom,Description
CAT-BUTTER,Butter & Ghee,FAM-DAIRY,KG,Salted & unsalted butter
CAT-CHICKEN,Chicken,FAM-MEAT,KG,Fresh bone & boneless chicken
CAT-FISH,Fish & Finfish,FAM-SEAFOOD,KG,Fresh marine & river fish
CAT-VEG,Fresh Vegetables,FAM-PRODUCE,KG,Daily fresh vegetables & herbs
CAT-SPICES,Whole Spices,FAM-SPICES,KG,Whole aromatic spices`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', 'Categories_Import_Template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

    async importCategoriesFromCSV(file, session) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length <= 1) {
    alert('❌ Selected CSV file is empty or missing data rows.');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(cell => cell.trim().replace(/^"(.*)"$/, '$1'));
    if (row.length === 0 || !row[0]) continue;

    const code = row[0] || ('CAT-' + Math.floor(100 + Math.random() * 900));
    const name = row[1] || code;
    const familyCode = row[2] || 'FAM-PRODUCE';
    const uom = row[3] || 'KG';
    const desc = row[4] || '';

    const existing = categoryRepository.getByCode(code, session.tenantId);
    if (existing) {
      skipped++;
      continue;
    }

    categoryRepository.create({
      categoryCode: code,
      categoryName: name,
      productFamilyCode: familyCode,
      defaultUom: uom,
      description: desc,
      status: 'ACTIVE'
    }, session);
    created++;
  }

  alert(`🎉 Category Import Complete!\n\n✔ ${created} new categories imported.\n⏩ ${skipped} duplicate category codes skipped.`);
  this.render();
}

openCategoryModal(catIdOrObj, session) {
  const isEdit = !!catIdOrObj;
  const cat = isEdit ? (typeof catIdOrObj === 'object' ? catIdOrObj : categoryRepository.getById(catIdOrObj, session.tenantId)) : null;

  const familyOptions = Object.values(PRODUCT_FAMILIES_REGISTRY).map(f => `
        <option value="${f.code}" ${cat && (cat.productFamilyCode === f.code || cat.productFamily === f.code) ? 'selected' : ''}>${f.icon} ${f.name} (${f.code})</option>
      `).join('');

  const uomList = uomRepository.getAll();
  const uomOptions = uomList.map(u => `
        <option value="${u.uomCode}" ${cat && cat.defaultUom === u.uomCode ? 'selected' : (u.uomCode === 'KG' ? 'selected' : '')}>${u.uomCode} (${u.uomName})</option>
      `).join('');

  const html = `
        <div class="lock-screen-overlay animate-fade-in" style="display:flex; align-items:center; justify-content:center;">
          <div class="card modal-card" style="background:var(--bg-surface-1); width:100%; max-width:540px; border-radius:8px; padding:24px; border:1px solid var(--border-subtle); box-shadow:0 8px 32px rgba(0,0,0,0.4);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
              <h3 style="margin:0; font-size:1.2rem; color:var(--accent-primary);">${isEdit ? '✏️ Edit Operational Category' : '✨ Add Operational Category'}</h3>
              <button id="btn-close-cat-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.2rem; cursor:pointer;">✕</button>
            </div>

            <div style="display:flex; flex-direction:column; gap:12px;">
              <div class="grid grid-cols-2 gap-sm">
                <div>
                  <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Category Code *</label>
                  <input type="text" id="inp-cat-code" value="${cat ? cat.categoryCode : 'CAT-' + Math.floor(100 + Math.random() * 900)}" ${isEdit ? 'readonly' : ''} style="width:100%; padding:8px;" placeholder="e.g. CAT-BUTTER">
                </div>
                <div>
                  <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Category Name *</label>
                  <input type="text" id="inp-cat-name" value="${cat ? (cat.categoryName || '').replace(/"/g, '&quot;') : ''}" style="width:100%; padding:8px;" placeholder="e.g. Butter & Ghee">
                </div>
              </div>

              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Product Family (15 Canonical Families) *</label>
                <select id="inp-cat-family" style="width:100%; padding:8px;">
                  ${familyOptions}
                </select>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">System-governed canonical family classification.</div>
              </div>

              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Suggested Base UOM</label>
                <select id="inp-cat-uom" style="width:100%; padding:8px;">
                  ${uomOptions}
                </select>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">Item form prefill suggestion only.</div>
              </div>

              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Description</label>
                <textarea id="inp-cat-desc" style="width:100%; padding:8px; height:60px;" placeholder="Category scope & operational notes...">${cat ? (cat.description || '') : ''}</textarea>
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:12px;">
              <button id="btn-cancel-cat" class="btn-secondary" style="padding:8px 16px;">Cancel</button>
              <button id="btn-save-cat" class="btn-primary" style="padding:8px 16px;">${isEdit ? '💾 Save Category' : '✨ Create Category'}</button>
            </div>
          </div>
        </div>
      `;

  const modalMount = this.appEl.querySelector('#modal-container-mount') || document.body;
  modalMount.innerHTML = html;

  const closeModal = () => { modalMount.innerHTML = ''; };

  modalMount.querySelector('#btn-close-cat-modal').addEventListener('click', closeModal);
  modalMount.querySelector('#btn-cancel-cat').addEventListener('click', closeModal);

  modalMount.querySelector('#btn-save-cat').addEventListener('click', () => {
    const code = modalMount.querySelector('#inp-cat-code').value.trim();
    const name = modalMount.querySelector('#inp-cat-name').value.trim();
    const familyCode = modalMount.querySelector('#inp-cat-family').value;
    const uom = modalMount.querySelector('#inp-cat-uom').value;
    const desc = modalMount.querySelector('#inp-cat-desc').value.trim();

    if (!code || !name) {
      alert('❌ Please enter a Category Code and Category Name.');
      return;
    }

    if (isEdit) {
      categoryRepository.update(cat.id, {
        categoryName: name,
        productFamilyCode: familyCode,
        defaultUom: uom,
        description: desc
      }, session);
      alert(`💾 Category "${name}" updated successfully.`);
    } else {
      categoryRepository.create({
        categoryCode: code,
        categoryName: name,
        productFamilyCode: familyCode,
        defaultUom: uom,
        description: desc,
        status: 'ACTIVE'
      }, session);
      alert(`🎉 Category "${name}" created under ${PRODUCT_FAMILIES_REGISTRY[familyCode].name}.`);
    }

    closeModal();
    this.render();
  });
}

openAddMasterItemModal(session) {
  const modalMount = this.appEl.querySelector('#modal-container-mount');
  const modal = document.createElement('div');
  modal.className = 'lock-screen-overlay animate-fade-in';

  const tenantId = session.tenantId;
  const categories = categoryRepository.getAll(tenantId);
  const uomList = uomRepository.getAll();
  const storageLocs = offlineStore.getCollection('storage_locations', tenantId) || [];
  const suppliersList = supplierRepository.getAll(tenantId);

  const uomOptions = uomList.map(u => `<option value="${u.uomCode}">${u.uomCode} (${u.uomName})</option>`).join('');
  const locationOptions = storageLocs.map(l => `<option value="${l.locationCode}">${l.locationName} (${l.locationCode})</option>`).join('');
  const supplierOptions = suppliersList.map(s => `<option value="${s.supplierCode}">${s.supplierName} (${s.supplierCode})</option>`).join('');

  modal.innerHTML = `
        <div class="card modal-card" style="background:var(--bg-surface-1); padding:24px; max-width:760px; max-height:92vh; overflow-y:auto;">
          <h3 style="margin-top:0;">+ Add Master Inventory Item</h3>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:16px;">Section 1 (Identity), Section 2 (Units), Section 3 (Storage), Section 4 (Purchasing) & Section 5 (Stock Policy).</p>
          
          <div class="flex-col gap-sm">
            <!-- SECTION 1: ITEM IDENTITY -->
            <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
              <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--accent-primary);">SECTION 1: ITEM IDENTITY</h4>
              
              <div class="grid grid-cols-2 gap-sm">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Item Code *</label>
                  <input type="text" id="inp-mi-code" value="RM${Math.floor(1000 + Math.random() * 9000)}" style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Item Name *</label>
                  <input type="text" id="inp-mi-name" placeholder="e.g. Chicken Boneless" style="width:100%;">
                </div>
              </div>

              <div class="grid grid-cols-2 gap-sm" style="margin-top:8px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Item Type *</label>
                  <select id="inp-mi-type" style="width:100%;">
                    <option value="Raw Material">Raw Material</option>
                    <option value="Semi Finished">Semi Finished</option>
                    <option value="Finished Good">Finished Good</option>
                    <option value="Packaging">Packaging</option>
                    <option value="Consumable">Consumable</option>
                    <option value="Cleaning Supply">Cleaning Supply</option>
                    <option value="Asset">Asset</option>
                    <option value="Service Item">Service Item</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Category *</label>
                  <select id="inp-mi-cat" style="width:100%;">
                    ${categories.length ? categories.map(c => `<option value="${c.categoryCode}">${c.categoryName} (${c.categoryCode})</option>`).join('') : `<option value="CAT-VEG">Fresh Vegetables</option>`}
                  </select>
                </div>
              </div>

              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:10px;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">PRODUCT FAMILY (AUTO-DERIVED)</div>
                <div id="preview-product-family-box" style="font-weight:700; color:var(--accent-primary); margin-top:2px; font-size:0.9rem;"></div>
              </div>
            </div>

            <!-- SECTION 2: UNITS & CONVERSIONS -->
            <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
              <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--accent-primary);">SECTION 2: UNITS & CONVERSIONS</h4>
              
              <div class="grid grid-cols-2 gap-sm">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Base UOM *</label>
                  <select id="inp-mi-base-uom" style="width:100%;">${uomOptions}</select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Purchase UOM</label>
                  <select id="inp-mi-purchase-uom" style="width:100%;"><option value="">(Same as Base)</option>${uomOptions}</select>
                </div>
              </div>

              <div style="margin-top:10px;">
                <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Conversion Factor</label>
                <input type="number" step="0.001" id="inp-mi-factor" value="1.000" style="width:100%;">
              </div>

              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:10px;">
                <div id="uom-validation-badge"></div>
                <div id="preview-uom-formula" style="font-weight:700; color:var(--accent-primary); margin-top:4px; font-size:0.9rem;"></div>
              </div>
            </div>

            <!-- SECTION 3: STORAGE -->
            <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
              <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--accent-primary);">SECTION 3: STORAGE & STOCK OWNERSHIP</h4>
              
              <div class="grid grid-cols-2 gap-sm">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Receiving Location *</label>
                  <select id="inp-mi-def-loc" style="width:100%;">${locationOptions}</select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Transfer Eligibility</label>
                  <label style="display:flex; align-items:center; gap:8px; margin-top:6px;"><input type="checkbox" id="chk-mi-transfer" checked> Allow transfers</label>
                </div>
              </div>

              <div style="margin-top:10px;">
                <label style="display:block; font-size:0.75rem; margin-bottom:4px; font-weight:600;">Allowed Locations</label>
                <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; background:var(--bg-surface-2); padding:10px; border-radius:6px; border:1px solid var(--border-subtle); max-height:100px; overflow-y:auto;">
                  ${storageLocs.map(l => `<label style="display:flex; align-items:center; gap:6px; font-size:0.78rem;"><input type="checkbox" class="chk-allowed-loc" value="${l.locationCode}" checked> ${l.locationName}</label>`).join('')}
                </div>
              </div>
              <div id="preview-storage-ownership-box" style="font-weight:700; color:var(--accent-primary); margin-top:10px; font-size:0.88rem;"></div>
            </div>

            <!-- SECTION 4: PURCHASING & SUPPLIER CONFIGURATION -->
            <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
              <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--accent-primary);">SECTION 4: PURCHASING & SUPPLIER CONFIGURATION</h4>
              
              <div class="grid grid-cols-2 gap-sm">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Preferred Supplier *</label>
                  <select id="inp-mi-pref-sup" style="width:100%;">${suppliersList.length ? supplierOptions : `<option value="SUP-001">None</option>`}</select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Supplier Item SKU</label>
                  <input type="text" id="inp-mi-sup-sku" style="width:100%;">
                </div>
              </div>

              <div class="grid grid-cols-2 gap-sm" style="margin-top:8px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Last Purchase Price (₹) *</label>
                  <input type="number" step="0.01" id="inp-mi-pur-price" value="0.00" style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Purchase Tax Profile *</label>
                  <select id="inp-mi-pur-tax" style="width:100%;"><option value="12% GST">12% GST</option><option value="5% GST">5% GST</option><option value="18% GST">18% GST</option></select>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-sm" style="margin-top:8px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Minimum Order Qty (MOQ)</label>
                  <input type="number" id="inp-mi-moq" value="1" style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Lead Time (Days)</label>
                  <input type="number" id="inp-mi-lead-time" value="1" style="width:100%;">
                </div>
              </div>

              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:10px;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">COST & VALUATION PREVIEW</div>
                <div id="preview-cost-valuation-box" style="font-weight:700; color:var(--accent-primary); margin-top:2px; font-size:0.88rem;"></div>
              </div>
            </div>

            <!-- SECTION 5: STOCK CONTROL & INVENTORY POLICY -->
            <div style="padding-top:8px;">
              <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--accent-primary);">SECTION 5: STOCK CONTROL & INVENTORY POLICY</h4>
              
              <div class="grid grid-cols-3 gap-sm">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Reorder Level *</label>
                  <input type="number" step="0.01" id="inp-mi-reorder-lvl" value="10.00" style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Min Safety Stock *</label>
                  <input type="number" step="0.01" id="inp-mi-min-stock" value="5.00" style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Max Storage Limit *</label>
                  <input type="number" step="0.01" id="inp-mi-max-stock" value="50.00" style="width:100%;">
                </div>
              </div>

              <div class="grid grid-cols-2 gap-sm" style="margin-top:8px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Suggested Reorder Qty</label>
                  <input type="number" id="inp-mi-reorder-qty" value="10" style="width:100%;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Cycle Count Frequency</label>
                  <select id="inp-mi-cycle-freq" style="width:100%;"><option value="WEEKLY">WEEKLY</option><option value="DAILY">DAILY</option><option value="MONTHLY">MONTHLY</option></select>
                </div>
              </div>

              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:10px;">
                <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; font-size:0.8rem;">
                  <label><input type="checkbox" id="chk-mi-batch" checked> Batch Tracking</label>
                  <label><input type="checkbox" id="chk-mi-expiry" checked> Expiry Tracking</label>
                  <label><input type="checkbox" id="chk-mi-neg-stock"> Allow Neg Stock</label>
                  <label><input type="checkbox" id="chk-mi-low-alerts" checked> Low-Stock Alerts</label>
                </div>
                <div style="margin-top:8px;"><label>Shelf Life (Days):</label> <input type="number" id="inp-mi-shelf-life" value="180" style="width:60px;"></div>
              </div>

              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:10px;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">STOCK POLICY ARCHITECTURE</div>
                <div id="preview-stock-policy-box" style="font-weight:700; color:var(--accent-primary); margin-top:2px; font-size:0.88rem;"></div>
              </div>
            </div>

            <!-- SECTION 6: INVENTORY BEHAVIOUR & CONSUMPTION RULES -->
            <div style="padding-top:12px; border-top:1px solid var(--border-subtle); margin-top:12px;">
              <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:var(--accent-primary);">SECTION 6: INVENTORY BEHAVIOUR & CONSUMPTION RULES</h4>
              
              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; border:1px solid var(--border-subtle); font-size:0.8rem;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; margin-bottom:6px;">OPERATIONAL USAGE FLAGS</div>
                <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px;">
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="chk-mi-stockable" checked> Stockable Item (Holds physical balance)</label>
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="chk-mi-ingredient" checked> Usable as Recipe Ingredient (Selectable in BOM)</label>
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="chk-mi-auto-deduct" checked> Auto-Deduct Stock on POS Order Completion</label>
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="chk-mi-direct-sale"> Direct Sale Item (Sold at POS without BOM)</label>
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="chk-mi-semi-finished"> Semi-Finished Prep (Produced in-house)</label>
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="chk-mi-wastage" checked> Track Prep Trimming & Cooking Wastage</label>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-sm" style="margin-top:10px;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Department Usage Scope *</label>
                  <select id="inp-mi-dept-scope" style="width:100%;">
                    <option value="ALL" selected>ALL Departments (General Inventory)</option>
                    <option value="KITCHEN">KITCHEN Only (Food Ingredients & Preps)</option>
                    <option value="BAR">BAR Only (Liquor, Mixers & Beverage)</option>
                    <option value="RETAIL_BAR">RETAIL BAR (Bottled Drinks & Merchandise)</option>
                    <option value="HOUSEKEEPING">HOUSEKEEPING (Cleaning & Guest Supplies)</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Insufficient Stock Policy *</label>
                  <select id="inp-mi-stock-policy" style="width:100%;">
                    <option value="WARN_AND_ALLOW" selected>WARN & Allow Order (Flag Low Stock)</option>
                    <option value="BLOCK_ORDER">BLOCK Order Creation (Require Stock)</option>
                    <option value="ALLOW_SILENTLY">ALLOW Silently (Negative Ledger Allowed)</option>
                  </select>
                </div>
              </div>

              <div style="margin-top:10px;">
                <label style="display:block; font-size:0.75rem; margin-bottom:2px; font-weight:600;">Standard Usable Prep Yield (%)</label>
                <input type="number" step="0.1" id="inp-mi-yield-pct" value="100.0" style="width:100%;">
                <div style="font-size:0.68rem; color:var(--text-muted); margin-top:2px;">Usable net percentage after trimming & cleaning (e.g. 85.0% for trimmed poultry).</div>
              </div>

              <!-- Yield & Consumption Formula Preview Box -->
              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:10px;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">RECIPE BARS & CONSUMPTION FORMULA PREVIEW</div>
                <div id="preview-yield-formula-box" style="font-weight:700; color:var(--accent-primary); margin-top:2px; font-size:0.88rem;"></div>
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:12px;">
              <button class="btn-secondary" id="btn-mi-cancel">Cancel</button>
              <button class="btn-primary" id="btn-mi-save">💾 Save Master Item</button>
            </div>
          </div>
        </div>
      `;

  modalMount.innerHTML = '';
  modalMount.appendChild(modal);

  const updateFamilyPreview = () => {
    const selectedCatCode = modal.querySelector('#inp-mi-cat').value;
    const catObj = categoryRepository.getByCode(selectedCatCode, tenantId);
    const famCode = catObj ? catObj.productFamilyCode : 'FAM-PRODUCE';
    const famObj = PRODUCT_FAMILIES_REGISTRY[famCode] || { icon: '📦', name: 'General', code: famCode };
    modal.querySelector('#preview-product-family-box').innerHTML = `${famObj.icon} ${famObj.name} (${famObj.code})`;
  };

  const updateUomFormulaPreview = () => {
    const baseUom = modal.querySelector('#inp-mi-base-uom').value;
    const purchaseUom = modal.querySelector('#inp-mi-purchase-uom').value || baseUom;
    const factor = parseFloat(modal.querySelector('#inp-mi-factor').value) || 1;
    modal.querySelector('#preview-uom-formula').innerHTML = `1 ${purchaseUom} = ${factor} ${baseUom}`;
  };

  const updateStorageOwnershipPreview = () => {
    const loc = storageLocs.find(l => l.locationCode === modal.querySelector('#inp-mi-def-loc').value);
    if (loc) modal.querySelector('#preview-storage-ownership-box').innerHTML = `🏬 Receiving at <strong>${loc.locationName}</strong>`;
  };

  const updateCostValuationPreview = () => {
    const factor = parseFloat(modal.querySelector('#inp-mi-factor').value) || 1;
    const purPrice = parseFloat(modal.querySelector('#inp-mi-pur-price').value) || 0;
    const cost = (purPrice / factor).toFixed(2);
    modal.querySelector('#preview-cost-valuation-box').innerHTML = `Purchase: ₹${purPrice.toFixed(2)} → Unit Cost: ₹${cost}`;
  };

  const updateStockPolicyPreview = () => {
    const b = modal.querySelector('#inp-mi-base-uom').value;
    const min = modal.querySelector('#inp-mi-min-stock').value;
    const max = modal.querySelector('#inp-mi-max-stock').value;
    modal.querySelector('#preview-stock-policy-box').innerHTML = `Min: ${min} ${b} • Max: ${max} ${b}`;
  };

  const updateYieldFormulaPreview = () => {
    const baseUom = modal.querySelector('#inp-mi-base-uom').value;
    const yieldPct = parseFloat(modal.querySelector('#inp-mi-yield-pct').value) || 100;
    const grossDeduction = (1.0 / (yieldPct / 100.0)).toFixed(3);
    const previewEl = modal.querySelector('#preview-yield-formula-box');
    if (previewEl) {
      previewEl.innerHTML = `Usable Yield: <strong>${yieldPct}%</strong> • Gross Stock Deducted per 1.000 ${baseUom} Net Recipe: <strong>${grossDeduction} ${baseUom}</strong>`;
    }
  };

  [modal.querySelector('#inp-mi-cat')].forEach(el => el.addEventListener('change', updateFamilyPreview));
  [modal.querySelector('#inp-mi-base-uom'), modal.querySelector('#inp-mi-purchase-uom'), modal.querySelector('#inp-mi-factor')].forEach(el => el.addEventListener('change', () => { updateUomFormulaPreview(); updateCostValuationPreview(); updateStockPolicyPreview(); updateYieldFormulaPreview(); }));
  [modal.querySelector('#inp-mi-pur-price')].forEach(el => el.addEventListener('input', updateCostValuationPreview));
  [modal.querySelector('#inp-mi-min-stock'), modal.querySelector('#inp-mi-max-stock')].forEach(el => el.addEventListener('input', updateStockPolicyPreview));
  [modal.querySelector('#inp-mi-yield-pct')].forEach(el => el.addEventListener('input', updateYieldFormulaPreview));
  modal.querySelector('#inp-mi-def-loc').addEventListener('change', updateStorageOwnershipPreview);

  updateFamilyPreview(); updateUomFormulaPreview(); updateStorageOwnershipPreview(); updateCostValuationPreview(); updateStockPolicyPreview(); updateYieldFormulaPreview();

  modal.querySelector('#btn-mi-cancel').addEventListener('click', () => { modalMount.innerHTML = ''; });
  modal.querySelector('#btn-mi-save').addEventListener('click', () => {
    const itemCode = modal.querySelector('#inp-mi-code').value.trim();
    const itemName = modal.querySelector('#inp-mi-name').value.trim();
    const itemType = modal.querySelector('#inp-mi-type').value;
    const categoryCode = modal.querySelector('#inp-mi-cat').value;
    const status = modal.querySelector('#inp-mi-status').value;
    const baseUom = modal.querySelector('#inp-mi-base-uom').value;
    const purchaseUomRaw = modal.querySelector('#inp-mi-purchase-uom').value;
    const purchaseUom = purchaseUomRaw || baseUom;
    const conversionFactor = parseFloat(modal.querySelector('#inp-mi-factor').value) || 1;
    const defaultLocationCode = modal.querySelector('#inp-mi-def-loc').value;
    const isTransferAllowed = modal.querySelector('#chk-mi-transfer').checked;
    const preferredSupplierCode = modal.querySelector('#inp-mi-pref-sup').value;
    const supplierItemCode = modal.querySelector('#inp-mi-sup-sku').value.trim();
    const lastPurchasePrice = parseFloat(modal.querySelector('#inp-mi-pur-price').value) || 0;
    const purchaseTaxProfile = modal.querySelector('#inp-mi-pur-tax').value;
    const minimumOrderQuantity = parseFloat(modal.querySelector('#inp-mi-moq').value) || 1;
    const purchaseLeadTimeDays = parseInt(modal.querySelector('#inp-mi-lead-time').value) || 1;

    const reorderLevel = parseFloat(modal.querySelector('#inp-mi-reorder-lvl').value) || 0;
    const minimumStockLevel = parseFloat(modal.querySelector('#inp-mi-min-stock').value) || 0;
    const maximumStockLevel = parseFloat(modal.querySelector('#inp-mi-max-stock').value) || 0;
    const reorderQuantity = parseFloat(modal.querySelector('#inp-mi-reorder-qty').value) || 1;
    const cycleCountFrequency = modal.querySelector('#inp-mi-cycle-freq').value;
    const isBatchTracked = modal.querySelector('#chk-mi-batch').checked;
    const isExpiryTracked = modal.querySelector('#chk-mi-expiry').checked;
    const allowNegativeStock = modal.querySelector('#chk-mi-neg-stock').checked;
    const enableLowStockAlerts = modal.querySelector('#chk-mi-low-alerts').checked;
    const shelfLifeDays = parseInt(modal.querySelector('#inp-mi-shelf-life').value) || 180;

    const isStockable = modal.querySelector('#chk-mi-stockable').checked;
    const isRecipeIngredient = modal.querySelector('#chk-mi-ingredient').checked;
    const autoDeductionEnabled = modal.querySelector('#chk-mi-auto-deduct').checked;
    const isDirectSale = modal.querySelector('#chk-mi-direct-sale').checked;
    const isSemiFinished = modal.querySelector('#chk-mi-semi-finished').checked;
    const allowWastageTracking = modal.querySelector('#chk-mi-wastage').checked;
    const departmentUsageScope = modal.querySelector('#inp-mi-dept-scope').value;
    const insufficientStockPolicy = modal.querySelector('#inp-mi-stock-policy').value;
    const standardYieldPercent = parseFloat(modal.querySelector('#inp-mi-yield-pct').value) || 100.0;

    const chkElements = modal.querySelectorAll('.chk-allowed-loc:checked');
    const allowedLocationCodes = Array.from(chkElements).map(el => el.value);
    if (!allowedLocationCodes.includes(defaultLocationCode)) {
      allowedLocationCodes.push(defaultLocationCode);
    }

    if (!itemName || !itemCode) {
      alert('❌ Please enter a valid Item Name and Item Code.');
      return;
    }

    const existing = inventoryRepository.getByCode(itemCode, session.tenantId);
    if (existing) {
      alert(`❌ Duplicate Item Code "${itemCode}"! Item Code must be unique.`);
      return;
    }

    const baseObj = uomConversionEngine.getUom(baseUom);
    const purObj = uomConversionEngine.getUom(purchaseUom);
    if (baseObj && purObj && !purObj.isContainer && baseObj.family !== purObj.family) {
      alert(`❌ Incompatible UOM Families!\nBase UOM (${baseUom}) is ${baseObj.family}, while Purchase UOM (${purchaseUom}) is ${purObj.family}.\nCross-family conversion is not allowed.`);
      return;
    }

    const baseUnitCost = conversionFactor > 0 ? (lastPurchasePrice / conversionFactor) : lastPurchasePrice;

    inventoryRepository.create({
      itemCode,
      itemName,
      itemType,
      categoryCode,
      baseUom,
      purchaseUom,
      conversionFactor,
      defaultLocationCode,
      allowedLocationCodes,
      isTransferAllowed,
      preferredSupplierCode,
      defaultSupplierCode: preferredSupplierCode,
      supplierItemCode,
      lastPurchasePrice,
      unitValuation: baseUnitCost,
      purchaseTaxProfile,
      minimumOrderQuantity,
      purchaseLeadTimeDays,
      costHistory: [{ price: lastPurchasePrice, baseCost: baseUnitCost, date: new Date().toISOString(), supplierCode: preferredSupplierCode }],
      reorderLevel,
      minimumStockLevel,
      maximumStockLevel,
      reorderQuantity,
      cycleCountFrequency,
      isBatchTracked,
      isExpiryTracked,
      allowNegativeStock,
      enableLowStockAlerts,
      shelfLifeDays,
      isStockable,
      isRecipeIngredient,
      autoDeductionEnabled,
      isDirectSale,
      isSemiFinished,
      allowWastageTracking,
      departmentUsageScope,
      insufficientStockPolicy,
      standardYieldPercent,
      status
    }, session);

    alert(`🎉 Master Inventory Item "${itemName}" (${itemCode}) saved successfully!\nAuto-Deduction: ${autoDeductionEnabled ? 'ENABLED' : 'DISABLED'} | Department Scope: ${departmentUsageScope} | Yield: ${standardYieldPercent}%`);
    modalMount.innerHTML = '';
    this.render();
  });
}

downloadSampleMasterInventoryTemplate() {
  const csvHeader = "itemCode,itemName,itemType,categoryCode,baseUom,purchaseUom,conversionFactor,defaultLocationCode,allowedLocationCodes,preferredSupplierCode,supplierItemCode,lastPurchasePrice,purchaseTaxProfile,minimumOrderQuantity,purchaseLeadTimeDays,reorderLevel,minimumStockLevel,maximumStockLevel,reorderQuantity,isBatchTracked,isExpiryTracked,shelfLifeDays,isStockable,isRecipeIngredient,autoDeductionEnabled,isDirectSale,isSemiFinished,allowWastageTracking,departmentUsageScope,insufficientStockPolicy,standardYieldPercent\n";
  const sampleRows = [
    "RM0001,Chicken Boneless,Raw Material,CAT-MEAT,KG,KG,1.000,LOC-CHILL,LOC-CHILL|LOC-KITCHEN,SUP-001,CHK-BONE-1KG,280.00,5% GST,5,1,10.0,5.0,50.0,10,true,true,7,true,true,true,false,false,true,KITCHEN,WARN_AND_ALLOW,85.0",
    "RM0002,Amul Pasteurised Butter,Raw Material,CAT-DAIRY,KG,PACK,0.500,LOC-CHILL,LOC-CHILL|LOC-KITCHEN|LOC-BAR,SUP-001,AMUL-BUT-500G,240.00,12% GST,5,2,10.0,5.0,50.0,10,true,true,180,true,true,true,false,false,true,ALL,WARN_AND_ALLOW,100.0",
    "SF0001,White Gravy Base Batch,Semi Finished,CAT-PREP,LTR,LTR,1.000,LOC-CHILL,LOC-CHILL|LOC-KITCHEN,SUP-001,,0.00,Exempt,1,1,15.0,5.0,40.0,10,true,true,3,true,true,true,false,true,true,KITCHEN,WARN_AND_ALLOW,100.0",
    "PKG0001,Takeaway Meal Box 3-Comp,Packaging,CAT-PKG,PCS,BOX,100.000,LOC-MWH,LOC-MWH|LOC-KITCHEN,SUP-002,BOX-3COMP-100,650.00,18% GST,2,3,200.0,50.0,1000.0,200,false,false,365,true,false,true,true,false,false,ALL,WARN_AND_ALLOW,100.0"
  ].join("\n");

  const blob = new Blob([csvHeader + sampleRows], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", "Master_Inventory_Template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

exportMasterInventoryToCSV(session) {
  const tenantId = session ? session.tenantId : '';
  const items = inventoryRepository.getAll(tenantId);
  if (!items || !items.length) {
    alert('❌ No Master Inventory Items to export.');
    return;
  }

  const headers = ["itemCode", "itemName", "itemType", "categoryCode", "baseUom", "purchaseUom", "conversionFactor", "defaultLocationCode", "allowedLocationCodes", "preferredSupplierCode", "supplierItemCode", "lastPurchasePrice", "purchaseTaxProfile", "minimumOrderQuantity", "purchaseLeadTimeDays", "reorderLevel", "minimumStockLevel", "maximumStockLevel", "reorderQuantity", "isBatchTracked", "isExpiryTracked", "shelfLifeDays", "isStockable", "isRecipeIngredient", "autoDeductionEnabled", "isDirectSale", "isSemiFinished", "allowWastageTracking", "departmentUsageScope", "insufficientStockPolicy", "standardYieldPercent", "status"];

  const csvRows = [headers.join(",")];
  items.forEach(i => {
    const allowedLocs = (i.allowedLocationCodes || []).join("|");
    const row = [
      `"${i.itemCode || ''}"`,
      `"${(i.itemName || '').replace(/"/g, '""')}"`,
      `"${i.itemType || 'Raw Material'}"`,
      `"${i.categoryCode || 'CAT-VEG'}"`,
      `"${i.baseUom || 'KG'}"`,
      `"${i.purchaseUom || i.baseUom || 'KG'}"`,
      i.conversionFactor || 1,
      `"${i.defaultLocationCode || 'LOC-MWH'}"`,
      `"${allowedLocs}"`,
      `"${i.preferredSupplierCode || i.defaultSupplierCode || 'SUP-001'}"`,
      `"${i.supplierItemCode || ''}"`,
      i.lastPurchasePrice || 0,
      `"${i.purchaseTaxProfile || '12% GST'}"`,
      i.minimumOrderQuantity || 1,
      i.purchaseLeadTimeDays || 1,
      i.reorderLevel || 10,
      i.minimumStockLevel || 5,
      i.maximumStockLevel || 50,
      i.reorderQuantity || 10,
      i.isBatchTracked !== false,
      i.isExpiryTracked !== false,
      i.shelfLifeDays || 180,
      i.isStockable !== false,
      i.isRecipeIngredient !== false,
      i.autoDeductionEnabled !== false,
      !!i.isDirectSale,
      !!i.isSemiFinished,
      i.allowWastageTracking !== false,
      `"${i.departmentUsageScope || 'ALL'}"`,
      `"${i.insufficientStockPolicy || 'WARN_AND_ALLOW'}"`,
      i.standardYieldPercent || 100.0,
      `"${i.status || 'ACTIVE'}"`
    ];
    csvRows.push(row.join(","));
  });

  const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `Master_Inventory_Export_${new Date().toISOString().substring(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

renderMasterItemFormPage(items, categories, uoms, locations, suppliers, session) {
  const tenantId = session.tenantId;
  const editingId = this.editingMasterItemId;
  const itemData = editingId ? inventoryRepository.getById(editingId, tenantId) : null;
  const isEdit = !!itemData;

  const uomOptions = uoms.map(u => `<option value="${u.uomCode}">${u.uomCode} (${u.uomName})</option>`).join('');
  const locationOptions = locations.map(l => `<option value="${l.locationCode}">${l.locationName} (${l.locationCode})</option>`).join('');
  const supplierOptions = suppliers.map(s => `<option value="${s.supplierCode}">${s.supplierName} (${s.supplierCode})</option>`).join('');

  return `
        <div class="animate-fade-in flex-col gap-md">
          <!-- Navigation Header Bar -->
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle);">
            <div>
              <button class="btn-secondary" id="btn-back-to-catalog" style="padding:6px 14px; font-weight:600; font-size:0.82rem; margin-bottom:6px;">
                ← Back to Master Catalog
              </button>
              <h2 style="margin:0; font-size:1.5rem;">${isEdit ? '✏ Edit Master Inventory Item' : '+ Add New Master Inventory Item'}</h2>
              <p style="color:var(--text-muted); font-size:0.82rem; margin-top:2px;">
                Dedicated Workspace • Sections 1 through 6 Configuration.
              </p>
            </div>
            <div style="display:flex; gap:12px;">
              <button class="btn-secondary" id="btn-form-cancel" style="padding:10px 18px;">Cancel</button>
              <button class="btn-primary" id="btn-form-save" style="padding:10px 22px; font-weight:700;">💾 Save Master Item</button>
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:24px;">
            <div class="flex-col gap-md">
              <!-- SECTION 1: ITEM IDENTITY -->
              <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
                <h4 style="margin:0 0 12px 0; font-size:1rem; color:var(--accent-primary);">SECTION 1: ITEM IDENTITY</h4>
                
                <div class="grid grid-cols-2 gap-md">
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Item Code *</label>
                    <input type="text" id="inp-pg-code" value="${itemData ? itemData.itemCode : ('RM' + Math.floor(1000 + Math.random() * 9000))}" ${isEdit ? 'disabled style="background:var(--bg-surface-2); cursor:not-allowed;"' : ''} style="width:100%;">
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">Permanent ERP SKU Code. ${isEdit ? '🔒 Immutable after creation.' : ''}</div>
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Item Name *</label>
                    <input type="text" id="inp-pg-name" value="${itemData ? (itemData.itemName || '') : ''}" placeholder="e.g. Chicken Boneless" style="width:100%;">
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-md" style="margin-top:12px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Item Type *</label>
                    <select id="inp-pg-type" style="width:100%;">
                      <option value="Raw Material" ${itemData && itemData.itemType === 'Raw Material' ? 'selected' : ''}>Raw Material</option>
                      <option value="Semi Finished" ${itemData && itemData.itemType === 'Semi Finished' ? 'selected' : ''}>Semi Finished</option>
                      <option value="Finished Good" ${itemData && itemData.itemType === 'Finished Good' ? 'selected' : ''}>Finished Good</option>
                      <option value="Packaging" ${itemData && itemData.itemType === 'Packaging' ? 'selected' : ''}>Packaging</option>
                      <option value="Consumable" ${itemData && itemData.itemType === 'Consumable' ? 'selected' : ''}>Consumable</option>
                      <option value="Cleaning Supply" ${itemData && itemData.itemType === 'Cleaning Supply' ? 'selected' : ''}>Cleaning Supply</option>
                      <option value="Asset" ${itemData && itemData.itemType === 'Asset' ? 'selected' : ''}>Asset</option>
                      <option value="Service Item" ${itemData && itemData.itemType === 'Service Item' ? 'selected' : ''}>Service Item</option>
                    </select>
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Category *</label>
                    <select id="inp-pg-cat" style="width:100%;">
                      ${categories.length ? categories.map(c => `<option value="${c.categoryCode}" ${itemData && itemData.categoryCode === c.categoryCode ? 'selected' : ''}>${c.categoryName} (${c.categoryCode})</option>`).join('') : `<option value="CAT-VEG">Fresh Vegetables</option>`}
                    </select>
                  </div>
                </div>

                <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:12px;">
                  <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">PRODUCT FAMILY (AUTO-DERIVED)</div>
                  <div id="preview-pg-family-box" style="font-weight:700; color:var(--accent-primary); margin-top:2px; font-size:0.95rem;"></div>
                  <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">🔒 Derived automatically from Category. Read-only.</div>
                </div>
              </div>

              <!-- SECTION 2: UNITS & CONVERSIONS -->
              <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
                <h4 style="margin:0 0 12px 0; font-size:1rem; color:var(--accent-primary);">SECTION 2: UNITS & CONVERSIONS</h4>
                
                <div class="grid grid-cols-2 gap-md">
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Base UOM *</label>
                    <select id="inp-pg-base-uom" style="width:100%;">${uomOptions}</select>
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Purchase UOM</label>
                    <select id="inp-pg-purchase-uom" style="width:100%;"><option value="">(Same as Base UOM)</option>${uomOptions}</select>
                  </div>
                </div>

                <div style="margin-top:12px;">
                  <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Purchase → Base Conversion Factor</label>
                  <input type="number" step="0.001" id="inp-pg-factor" value="${itemData ? (itemData.conversionFactor || 1) : 1.000}" style="width:100%;">
                </div>

                <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:12px;">
                  <div id="preview-pg-uom-formula" style="font-weight:700; color:var(--accent-primary); font-size:0.95rem;"></div>
                </div>
              </div>

              <!-- SECTION 3: STORAGE & STOCK OWNERSHIP -->
              <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
                <h4 style="margin:0 0 12px 0; font-size:1rem; color:var(--accent-primary);">SECTION 3: STORAGE & STOCK OWNERSHIP</h4>
                
                <div class="grid grid-cols-2 gap-md">
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Default Receiving Location *</label>
                    <select id="inp-pg-def-loc" style="width:100%;">${locationOptions}</select>
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Transfer Eligibility</label>
                    <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:0.88rem; cursor:pointer;">
                      <input type="checkbox" id="chk-pg-transfer" ${!itemData || itemData.isTransferAllowed !== false ? 'checked' : ''}> Allow inter-store transfers
                    </label>
                  </div>
                </div>

                <div style="margin-top:12px;">
                  <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Initial Stock Received on Onboarding (Base UOM)</label>
                  <input type="number" step="0.01" id="inp-pg-init-stock" value="${itemData ? (itemData.openingStock || itemData.currentStock || 0) : 10.00}" style="width:100%;">
                  <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">Starting physical stock balance seeded at the default location upon item onboarding.</div>
                </div>
              </div>

              <!-- SECTION 4: PURCHASING & SUPPLIER CONFIGURATION -->
              <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
                <h4 style="margin:0 0 12px 0; font-size:1rem; color:var(--accent-primary);">SECTION 4: PURCHASING & SUPPLIER CONFIGURATION</h4>
                
                <div class="grid grid-cols-2 gap-md">
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Preferred Supplier *</label>
                    <select id="inp-pg-pref-sup" style="width:100%;">${suppliers.length ? supplierOptions : `<option value="SUP-001">Amul Dairy Corp</option>`}</select>
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Supplier SKU Code</label>
                    <input type="text" id="inp-pg-sup-sku" value="${itemData ? (itemData.supplierItemCode || '') : ''}" placeholder="e.g. AMUL-BUT-500G" style="width:100%;">
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-md" style="margin-top:12px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Last Purchase Price (₹) *</label>
                    <input type="number" step="0.01" id="inp-pg-pur-price" value="${itemData ? (itemData.lastPurchasePrice || 0) : 240.00}" style="width:100%;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Purchase Tax Profile *</label>
                    <select id="inp-pg-pur-tax" style="width:100%;">
                      <option value="5% GST">5% GST</option>
                      <option value="12% GST" selected>12% GST</option>
                      <option value="18% GST">18% GST</option>
                      <option value="28% GST">28% GST</option>
                      <option value="Exempt">Exempt</option>
                    </select>
                  </div>
                </div>

                <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle); margin-top:12px;">
                  <div id="preview-pg-cost-box" style="font-weight:700; color:var(--accent-primary); font-size:0.95rem;"></div>
                </div>
              </div>

              <!-- SECTION 5: STOCK CONTROL & INVENTORY POLICY -->
              <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
                <h4 style="margin:0 0 12px 0; font-size:1rem; color:var(--accent-primary);">SECTION 5: STOCK CONTROL & INVENTORY POLICY</h4>
                
                <div class="grid grid-cols-3 gap-md">
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Reorder Level *</label>
                    <input type="number" step="0.01" id="inp-pg-reorder-lvl" value="${itemData ? (itemData.reorderLevel || 10) : 10.00}" style="width:100%;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Min Safety Stock *</label>
                    <input type="number" step="0.01" id="inp-pg-min-stock" value="${itemData ? (itemData.minimumStockLevel || 5) : 5.00}" style="width:100%;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Max Storage Limit *</label>
                    <input type="number" step="0.01" id="inp-pg-max-stock" value="${itemData ? (itemData.maximumStockLevel || 50) : 50.00}" style="width:100%;">
                  </div>
                </div>
              </div>

              <!-- SECTION 6: INVENTORY BEHAVIOUR & CONSUMPTION RULES -->
              <div>
                <h4 style="margin:0 0 12px 0; font-size:1rem; color:var(--accent-primary);">SECTION 6: INVENTORY BEHAVIOUR & CONSUMPTION RULES</h4>
                
                <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
                  <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; font-size:0.85rem;">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="chk-pg-stockable" ${!itemData || itemData.isStockable !== false ? 'checked' : ''}> Stockable Item</label>
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="chk-pg-ingredient" ${!itemData || itemData.isRecipeIngredient !== false ? 'checked' : ''}> Recipe Ingredient</label>
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="chk-pg-auto-deduct" ${!itemData || itemData.autoDeductionEnabled !== false ? 'checked' : ''}> Auto-Deduct Stock on POS Order</label>
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="chk-pg-direct-sale" ${itemData && itemData.isDirectSale ? 'checked' : ''}> Direct Sale Item</label>
                  </div>
                </div>

                <div style="margin-top:12px;">
                  <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Standard Usable Prep Yield (%)</label>
                  <input type="number" step="0.1" id="inp-pg-yield-pct" value="${itemData ? (itemData.standardYieldPercent || 100) : 100.0}" style="width:100%;">
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
}

handleMasterInventoryFileUpload(file, session) {
  if (!file) return;

  const parseCSVLine = (line) => {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (c === ',' && !inQuote) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      alert('❌ File is empty or missing headers.');
      return;
    }

    const tenantId = session ? session.tenantId : '';
    const existingItems = inventoryRepository.getAll(tenantId);
    const existingCodes = new Set(existingItems.map(i => i.itemCode));

    const staged = [];

    for (let idx = 1; idx < lines.length; idx++) {
      const rowText = lines[idx];
      if (!rowText) continue;

      const cleanCols = parseCSVLine(rowText);

      const rawCode = cleanCols[0] || ('RM' + (1000 + idx));
      const rawName = cleanCols[1] || ('Item #' + idx);
      const rawType = cleanCols[2] || 'Raw Material';
      const rawCat = cleanCols[3] || 'CAT-VEG';
      const rawBaseUom = (cleanCols[4] || 'KG').toUpperCase();
      const rawPurUom = (cleanCols[5] || rawBaseUom).toUpperCase();
      const factor = parseFloat(cleanCols[6]) || 1.0;
      const purPrice = parseFloat(cleanCols[10]) || 0;

      let baseUom = rawBaseUom;
      let purUom = rawPurUom;
      if (baseUom === 'PIECE') baseUom = 'PCS';
      if (purUom === 'PIECE') purUom = 'PCS';

      let statusFlag = 'READY';
      let warningNote = '';

      if (existingCodes.has(rawCode)) {
        statusFlag = 'DUPLICATE';
        warningNote = `Code ${rawCode} already exists in DB`;
      }

      const uomObj = uomConversionEngine.getUom(purUom);
      if (!uomObj) {
        statusFlag = 'NEEDS_MAPPING';
        warningNote = `Unrecognized Purchase UOM "${purUom}"`;
      } else if (factor <= 0) {
        statusFlag = 'NEEDS_MAPPING';
        warningNote = `Invalid conversion factor ${factor}`;
      }

      staged.push({
        rowNum: idx,
        itemCode: rawCode,
        itemName: rawName,
        itemType: rawType,
        categoryCode: rawCat,
        baseUom: baseUom,
        purchaseUom: purUom,
        conversionFactor: factor,
        defaultLocationCode: cleanCols[7] || 'LOC-MWH',
        preferredSupplierCode: cleanCols[8] || 'SUP-001',
        supplierItemCode: cleanCols[9] || '',
        lastPurchasePrice: purPrice,
        unitValuation: factor > 0 ? (purPrice / factor) : purPrice,
        statusFlag,
        warningNote
      });
    }

    this.stagedMasterItems = staged;
    this.stagedImportFileName = file.name;
    this.activeSubView = 'inv-master-import-preview';
    this.render();
  };

  reader.readAsText(file);
}

renderMasterInventoryImportPreview(session) {
  const staged = this.stagedMasterItems || [];
  const fileName = this.stagedImportFileName || 'Uploaded_Inventory_Master.csv';

  const totalRows = staged.length;
  const readyRows = staged.filter(s => s.statusFlag === 'READY').length;
  const mappingRows = staged.filter(s => s.statusFlag === 'NEEDS_MAPPING').length;
  const dupRows = staged.filter(s => s.statusFlag === 'DUPLICATE').length;

  return `
        <div class="animate-fade-in flex-col gap-md">
          <!-- Top Navigation Header -->
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle);">
            <div>
              <button class="btn-secondary" id="btn-cancel-import" style="padding:6px 14px; font-weight:600; font-size:0.82rem; margin-bottom:6px;">
                ❌ Cancel Import (Discard Staged Memory)
              </button>
              <h2 style="margin:0; font-size:1.5rem; color:var(--accent-primary);">⚡ Pre-Import Review & Audit Studio</h2>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Source File: <strong>${fileName}</strong> • 🔒 Zero Database Mutations Performed Yet.
              </p>
            </div>
            <div style="display:flex; gap:12px;">
              <button class="btn-secondary" id="btn-cancel-import" style="padding:10px 18px;">Cancel</button>
              <button class="btn-primary" id="btn-confirm-commit-import" style="padding:10px 22px; font-weight:700; background:linear-gradient(135deg, var(--status-success), #059669); border:none; color:#fff;">
                🔒 CONFIRM & COMMIT IMPORT (${totalRows} Items)
              </button>
            </div>
          </div>

          <!-- Audit Metrics Banner -->
          <div class="grid-responsive-6">
            <div style="background:var(--bg-surface-1); padding:14px; border-radius:6px; text-align:center; border-top:3px solid var(--accent-primary);">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL ROWS</div>
              <div style="font-size:1.5rem; font-weight:700; margin-top:4px;">${totalRows}</div>
            </div>
            <div style="background:var(--bg-surface-1); padding:14px; border-radius:6px; text-align:center; border-top:3px solid var(--status-success);">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">READY TO IMPORT</div>
              <div style="font-size:1.5rem; font-weight:700; color:var(--status-success); margin-top:4px;">${readyRows}</div>
            </div>
            <div style="background:var(--bg-surface-1); padding:14px; border-radius:6px; text-align:center; border-top:3px solid var(--status-warning);">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">NEEDS UOM MAPPING</div>
              <div style="font-size:1.5rem; font-weight:700; color:var(--status-warning); margin-top:4px;">${mappingRows}</div>
            </div>
            <div style="background:var(--bg-surface-1); padding:14px; border-radius:6px; text-align:center; border-top:3px solid var(--status-danger);">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">DUPLICATE CODES</div>
              <div style="font-size:1.5rem; font-weight:700; color:var(--status-danger); margin-top:4px;">${dupRows}</div>
            </div>
          </div>

          <!-- Staged Items Preview Table -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h4 style="margin:0 0 12px 0;">Staged Master Items Preview (${totalRows} Items)</h4>
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Row #</th>
                    <th style="padding:8px;">Item Code</th>
                    <th style="padding:8px;">Item Name</th>
                    <th style="padding:8px;">Item Type</th>
                    <th style="padding:8px;">Category</th>
                    <th style="padding:8px;">Base UOM</th>
                    <th style="padding:8px;">Purchase UOM Factor</th>
                    <th style="padding:8px;">Price / Unit Cost</th>
                    <th style="padding:8px;">Validation Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${staged.map(s => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px; font-weight:700; color:var(--text-muted);">${s.rowNum}</td>
                      <td style="padding:8px; font-weight:700; color:var(--accent-primary);">${s.itemCode}</td>
                      <td style="padding:8px; font-weight:600; max-width:260px; word-break:break-word;">${s.itemName}</td>
                      <td style="padding:8px;"><span class="badge badge-info">${s.itemType}</span></td>
                      <td style="padding:8px;">${s.categoryCode}</td>
                      <td style="padding:8px;"><span class="badge badge-success">${s.baseUom}</span></td>
                      <td style="padding:8px;">1 ${s.purchaseUom} = ${s.conversionFactor} ${s.baseUom}</td>
                      <td style="padding:8px; font-weight:700; color:var(--status-success);">₹${s.lastPurchasePrice.toFixed(2)} / ${s.purchaseUom}</td>
                      <td style="padding:8px;">
                        <span class="badge ${s.statusFlag === 'READY' ? 'badge-success' : (s.statusFlag === 'NEEDS_MAPPING' ? 'badge-warning' : 'badge-danger')}">
                          ${s.statusFlag}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
}

commitStagedMasterItems(session) {
  const staged = this.stagedMasterItems || [];
  if (!staged.length) {
    alert('❌ No staged items to commit.');
    return;
  }

  let importedCount = 0;
  staged.forEach(s => {
    inventoryRepository.create({
      itemCode: s.itemCode,
      itemName: s.itemName,
      itemType: s.itemType,
      categoryCode: s.categoryCode,
      baseUom: s.baseUom,
      purchaseUom: s.purchaseUom,
      conversionFactor: s.conversionFactor,
      defaultLocationCode: s.defaultLocationCode,
      allowedLocationCodes: [s.defaultLocationCode],
      isTransferAllowed: true,
      preferredSupplierCode: s.preferredSupplierCode,
      defaultSupplierCode: s.preferredSupplierCode,
      lastPurchasePrice: s.lastPurchasePrice,
      unitValuation: s.unitValuation,
      purchaseTaxProfile: '12% GST',
      minimumOrderQuantity: 1,
      purchaseLeadTimeDays: 1,
      reorderLevel: 10,
      minimumStockLevel: 5,
      maximumStockLevel: 50,
      isStockable: true,
      isRecipeIngredient: true,
      autoDeductionEnabled: true,
      standardYieldPercent: 100.0,
      status: 'ACTIVE'
    }, session);
    importedCount++;
  });

  alert(`🎉 Successfully committed ${importedCount} Master Inventory Items to Database & Supabase!`);
  this.stagedMasterItems = null;
  this.activeSubView = 'inv-master';
  this.render();
}

renderPurchaseOrdersPage(session) {
  const tenantId = session ? session.tenantId : '';
  const pos = purchaseOrderRepository.getAll(tenantId);
  const filter = this.poStatusFilter || 'ALL';

  const filteredPos = pos.filter(p => {
    if (filter !== 'ALL' && p.status !== filter) return false;
    return true;
  });

  const draftCount = pos.filter(p => p.status === 'DRAFT').length;
  const submittedCount = pos.filter(p => p.status === 'SUBMITTED').length;
  const approvedCount = pos.filter(p => p.status === 'APPROVED').length;
  const receivedCount = pos.filter(p => p.status === 'FULLY_RECEIVED' || p.status === 'PARTIALLY_RECEIVED').length;

  return `
        <div class="animate-fade-in flex-col gap-md">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">📋 Purchase Orders (${pos.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Procurement Pipeline • Order Commercial Materials from Approved Suppliers.
              </p>
            </div>
            <div>
              <button class="btn-primary" id="btn-open-po-form" style="padding:10px 20px; font-weight:700;">
                + Create Purchase Order
              </button>
            </div>
          </div>

          <!-- PO Status Metrics -->
          <div class="grid-responsive-4">
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">DRAFTS</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--text-secondary); margin-top:2px;">${draftCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">SUBMITTED / PENDING</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-warning); margin-top:2px;">${submittedCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">APPROVED & READY</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;">${approvedCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">RECEIVED POs</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">${receivedCount}</div>
            </div>
          </div>

          <!-- PO Filters -->
          <div style="display:flex; gap:8px; border-bottom:1px solid var(--border-subtle); padding-bottom:10px; overflow-x:auto;">
            ${['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'].map(st => `
              <button type="button" class="btn-po-filter" data-status="${st}" style="padding:6px 14px; font-size:0.8rem; border-radius:4px; border:1px solid var(--border-subtle); background:${filter === st ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${filter === st ? '#fff' : 'var(--text-secondary)'}; cursor:pointer;">
                ${st}
              </button>
            `).join('')}
          </div>

          <!-- PO Table -->
          ${filteredPos.length ? `
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:10px;">PO #</th>
                    <th style="padding:10px;">Supplier</th>
                    <th style="padding:10px;">Order Date</th>
                    <th style="padding:10px;">Destination Store</th>
                    <th style="padding:10px;">Items</th>
                    <th style="padding:10px;">Grand Total</th>
                    <th style="padding:10px;">Status</th>
                    <th style="padding:10px; text-align:right;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredPos.map(p => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${p.poNumber}</td>
                      <td style="padding:10px; font-weight:600;">${p.supplierName} <span style="font-size:0.75rem; color:var(--text-muted);">(${p.supplierCode})</span></td>
                      <td style="padding:10px;">${p.orderDate}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${p.destinationLocationCode}</span></td>
                      <td style="padding:10px;">${p.items.length} Item Lines</td>
                      <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${p.grandTotal.toFixed(2)}</td>
                      <td style="padding:10px;">
                        <span class="badge ${p.status === 'FULLY_RECEIVED' ? 'badge-success' : (p.status === 'APPROVED' ? 'badge-info' : (p.status === 'DRAFT' ? 'badge-secondary' : 'badge-warning'))}">
                          ${p.status}
                        </span>
                      </td>
                      <td style="padding:10px; text-align:right; white-space:nowrap;">
                        ${p.status === 'DRAFT' || p.status === 'SUBMITTED' ? `
                          <button type="button" class="btn-secondary btn-approve-po" data-po="${p.poNumber}" style="padding:4px 8px; font-size:0.75rem; margin-right:4px; background:var(--accent-primary); color:#fff; border:none; cursor:pointer;">
                            ✔ Approve PO
                          </button>
                        ` : ''}
                        ${p.status === 'APPROVED' || p.status === 'PARTIALLY_RECEIVED' ? `
                          <button type="button" class="btn-primary btn-receive-po-grn" data-po="${p.poNumber}" style="padding:4px 10px; font-size:0.75rem; background:linear-gradient(135deg, var(--status-success), #059669); border:none; color:#fff; cursor:pointer;">
                            📥 Receive Goods / GRN
                          </button>
                        ` : ''}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div style="padding:30px; text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">
              📋 No Purchase Orders found. Click <strong>+ Create Purchase Order</strong> above to create your first order!
            </div>
          `}
        </div>
      `;
}

renderCreatePoFormPage(items, suppliers, locations, session) {
  const activeSuppliers = (suppliers && suppliers.length) ? suppliers : supplierRepository.getAll(session ? session.tenantId : null);
  const supplierOpts = activeSuppliers.map(s => {
    const code = s.supplierCode || s.id || s.supplierName;
    return `<option value="${code}">${s.supplierName} (${code})</option>`;
  }).join('');
  const locationOpts = locations.map(l => `<option value="${l.locationCode}">${l.locationName} (${l.locationCode})</option>`).join('');
  const itemOpts = items.map(i => `<option value="${i.itemCode}">${i.itemName} (${i.itemCode}) — ₹${(i.lastPurchasePrice || 0).toFixed(2)}/${i.purchaseUom || i.baseUom || 'KG'}</option>`).join('');

  return `
        <div class="animate-fade-in flex-col gap-md">
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle); flex-wrap:wrap; gap:12px;">
            <div>
              <button type="button" class="btn-secondary" id="btn-back-to-po-list" style="padding:6px 14px; font-weight:600; font-size:0.82rem; margin-bottom:6px; cursor:pointer;">
                ← Back to Purchase Orders
              </button>
              <h2 style="margin:0; font-size:1.5rem; color:var(--accent-primary);">+ Create Purchase Order (PO)</h2>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Snapshot supplier order prices and assign receiving store location.</p>
            </div>
            <div style="display:flex; gap:12px;">
              <button type="button" class="btn-secondary" id="btn-cancel-po-form">Cancel</button>
              <button type="button" class="btn-primary" id="btn-save-po-draft" style="padding:10px 18px;">💾 Save Draft</button>
              <button type="button" class="btn-primary" id="btn-approve-po-submit" style="padding:10px 22px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border:none; color:#fff; cursor:pointer;">✔ Submit & Approve PO</button>
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h4 style="margin:0 0 14px 0; color:var(--accent-primary);">PO HEADER SPECIFICATIONS</h4>
            <div class="grid grid-cols-3 gap-md">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Supplier *</label>
                <select id="inp-po-supplier" style="width:100%; font-size:0.85rem; padding:8px;">${supplierOpts}</select>
                <div id="po-supplier-filter-status" style="font-size:0.75rem; margin-top:4px; font-weight:600; color:var(--accent-primary);"></div>
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Destination Location *</label>
                <select id="inp-po-location" style="width:100%; font-size:0.85rem; padding:8px;">${locationOpts}</select>
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Order Date</label>
                <input type="date" id="inp-po-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%; font-size:0.85rem; padding:8px;">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-md" style="margin-top:12px;">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Expected Delivery Date</label>
                <input type="date" id="inp-po-del-date" value="${new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]}" style="width:100%; font-size:0.85rem; padding:8px;">
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Payment Terms</label>
                <input type="text" id="inp-po-terms" value="Net 30 Days" style="width:100%; font-size:0.85rem; padding:8px;">
              </div>
            </div>

            <h4 style="margin:20px 0 10px 0; color:var(--accent-primary);">ORDERED ITEM LINES</h4>
            <div style="background:var(--bg-surface-2); padding:16px; border-radius:6px; margin-bottom:16px;">
              <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap:10px; align-items:end;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Select Master Item</label>
                  <select id="inp-po-line-item" style="width:100%; font-size:0.85rem; padding:6px;">${itemOpts}</select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Ordered Qty</label>
                  <input type="number" step="0.01" id="inp-po-line-qty" value="100.0" style="width:100%; font-size:0.85rem; padding:6px;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Unit Price (₹)</label>
                  <input type="number" step="0.01" id="inp-po-line-price" value="280.00" style="width:100%; font-size:0.85rem; padding:6px;">
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Tax %</label>
                  <input type="number" step="1" id="inp-po-line-tax" value="0" style="width:100%; font-size:0.85rem; padding:6px;">
                </div>
                <div>
                  <button type="button" class="btn-primary" id="btn-add-po-line" style="padding:8px 16px; font-weight:700;">+ Add Line</button>
                </div>
              </div>
              <div id="po-add-line-feedback" style="font-size:0.8rem; margin-top:8px; font-weight:600;"></div>
            </div>

            <div id="po-lines-container">
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Item</th>
                    <th style="padding:8px;">UOM</th>
                    <th style="padding:8px;">Ordered Qty</th>
                    <th style="padding:8px;">Unit Price</th>
                    <th style="padding:8px;">Line Total</th>
                    <th style="padding:8px; text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody id="po-lines-tbody">
                  <!-- Dynamic PO Lines -->
                </tbody>
              </table>
            </div>

            <div style="display:flex; justify-content:flex-end; margin-top:16px;">
              <div style="background:var(--bg-surface-2); padding:16px; border-radius:6px; width:300px; text-align:right;">
                <div style="font-size:0.8rem; color:var(--text-muted);">Estimated Grand Total</div>
                <div id="po-grand-total-display" style="font-size:1.5rem; font-weight:700; color:var(--status-success); margin-top:2px;">₹0.00</div>
              </div>
            </div>
          </div>
        </div>
      `;
}

renderGoodsReceivingPage(session) {
  const tenantId = session ? session.tenantId : '';
  const grns = goodsReceiptRepository.getAll(tenantId);
  const pos = purchaseOrderRepository.getAll(tenantId);
  const pendingPos = pos.filter(p => p.status === 'APPROVED' || p.status === 'PARTIALLY_RECEIVED');

  return `
        <div class="animate-fade-in flex-col gap-md">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">📥 Goods Receiving / GRN (${grns.length} Posted GRNs)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Single Source of Truth for Physical Stock Creation & Store Ledger Entries.
              </p>
            </div>
            <div>
              <button class="btn-primary" id="btn-open-opening-stock-grn" style="padding:10px 18px; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border:none; color:#fff; font-weight:700; cursor:pointer;">
                + Post Opening Stock GRN
              </button>
            </div>
          </div>

          <!-- Pending PO Receipts Section -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px; border-left:4px solid var(--status-warning);">
            <h4 style="margin:0 0 10px 0; color:var(--status-warning);">📋 PENDING PO SHIPMENT RECEIPTS (${pendingPos.length})</h4>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">Approved Purchase Orders awaiting physical store delivery inspection.</p>
            
            ${pendingPos.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">PO #</th>
                    <th style="padding:8px;">Supplier</th>
                    <th style="padding:8px;">Destination Store</th>
                    <th style="padding:8px;">Order Date</th>
                    <th style="padding:8px;">Status</th>
                    <th style="padding:8px; text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${pendingPos.map(p => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${p.poNumber}</td>
                      <td style="padding:8px; font-weight:600;">${p.supplierName}</td>
                      <td style="padding:8px;"><span class="badge badge-info">${p.destinationLocationCode}</span></td>
                      <td style="padding:8px;">${p.orderDate}</td>
                      <td style="padding:8px;"><span class="badge badge-warning">${p.status}</span></td>
                      <td style="padding:8px; text-align:right;">
                        <button type="button" class="btn-primary btn-receive-po-grn" data-po="${p.poNumber}" style="padding:6px 14px; font-size:0.78rem; font-weight:700; background:linear-gradient(135deg, var(--status-success), #059669); border:none; color:#fff; cursor:pointer;">
                          📥 Receive Shipment & Post GRN
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div style="color:var(--text-muted); font-size:0.82rem;">✔ No pending PO shipments. All approved POs are fully received.</div>`}
          </div>

          <!-- Posted GRN History Section -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h4 style="margin:0 0 12px 0;">HISTORICAL POSTED GRNs (${grns.length})</h4>
            ${grns.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">GRN #</th>
                    <th style="padding:8px;">Document Type</th>
                    <th style="padding:8px;">PO Ref</th>
                    <th style="padding:8px;">Store Location</th>
                    <th style="padding:8px;">Received Date</th>
                    <th style="padding:8px;">Posted By</th>
                    <th style="padding:8px;">Posting Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${grns.map(g => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${g.grnNumber}</td>
                      <td style="padding:8px;"><span class="badge ${g.documentType === 'OPENING_STOCK' ? 'badge-primary' : 'badge-info'}">${g.documentType}</span></td>
                      <td style="padding:8px; font-family:monospace;">${g.poNumber || '--'}</td>
                      <td style="padding:8px;"><span class="badge badge-secondary">${g.receivingLocationCode}</span></td>
                      <td style="padding:8px;">${g.receivedDate}</td>
                      <td style="padding:8px; font-weight:600;">${g.postedBy}</td>
                      <td style="padding:8px;"><span class="badge badge-success">🔒 POSTED & LEDGERED</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">📥 No posted GRNs yet. Receive a PO above or click <strong>+ Post Opening Stock GRN</strong>!</div>`}
          </div>
        </div>
      `;
}

renderReceiveGoodsGrnStudioPage(session) {
  const tenantId = session ? session.tenantId : '';
  const isOpening = this.grnDocumentType === 'OPENING_STOCK';
  const poNum = this.selectedPoForGrn;
  const po = poNum ? purchaseOrderRepository.getByPoNumber(poNum, tenantId) : null;
  const items = inventoryRepository.getAll(tenantId);
  const locations = offlineStore.getCollection('storage_locations', tenantId) || [];

  const locOpts = locations.map(l => `<option value="${l.locationCode}" ${po && po.destinationLocationCode === l.locationCode ? 'selected' : ''}>${l.locationName} (${l.locationCode})</option>`).join('');

  let initialLines = [];
  if (po && po.items) {
    initialLines = po.items.map(pi => {
      const masterItem = inventoryRepository.getByCode(pi.itemCode, tenantId) || {};
      return {
        itemCode: pi.itemCode,
        itemName: pi.itemName,
        purchaseUom: pi.purchaseUom || masterItem.purchaseUom || 'KG',
        baseUom: masterItem.baseUom || 'KG',
        conversionFactor: masterItem.conversionFactor || 1,
        orderedQty: pi.orderedQuantity || 0,
        receivedQty: pi.orderedQuantity || 0,
        acceptedQty: pi.orderedQuantity || 0,
        rejectedQty: 0,
        rejectionReason: 'None',
        batchNumber: `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
        expiryDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        actualPurchaseUnitPrice: pi.purchaseUnitPrice || masterItem.lastPurchasePrice || 0
      };
    });
  }

  this.currentGrnLines = initialLines;

  return `
        <div class="animate-fade-in flex-col gap-md">
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle); flex-wrap:wrap; gap:12px;">
            <div>
              <button type="button" class="btn-secondary" id="btn-back-to-grn-list" style="padding:6px 14px; font-weight:600; font-size:0.82rem; margin-bottom:6px; cursor:pointer;">
                ← Back to Goods Receiving
              </button>
              <h2 style="margin:0; font-size:1.5rem; color:var(--accent-primary);">
                📥 ${isOpening ? 'Post Opening Stock GRN' : `Receive Goods & Inspect Shipment (${poNum || 'PO Receipt'})`}
              </h2>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Inspect accepted/rejected quantities and commit physical stock to store balance.
              </p>
            </div>
            <div>
              <button type="button" class="btn-primary" id="btn-commit-post-grn" style="padding:12px 24px; font-weight:700; background:linear-gradient(135deg, var(--status-success), #059669); border:none; color:#fff; font-size:0.95rem; cursor:pointer;">
                🔒 POST GRN & RECEIVE STOCK
              </button>
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h4 style="margin:0 0 12px 0; color:var(--accent-primary);">GRN HEADER & STORE LOCATION</h4>
            <div class="grid grid-cols-3 gap-md">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Document Type</label>
                <input type="text" readonly value="${isOpening ? 'OPENING_STOCK' : 'PURCHASE_RECEIPT'}" style="width:100%; font-weight:700; background:var(--bg-surface-2);">
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Receiving Store Location *</label>
                <select id="inp-grn-location" style="width:100%; font-size:0.85rem; padding:8px;">${locOpts}</select>
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Received Date</label>
                <input type="date" id="inp-grn-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%; font-size:0.85rem; padding:8px;">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-md" style="margin-top:12px;">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Vendor Invoice No.</label>
                <input type="text" id="inp-grn-invoice" placeholder="INV-88941" style="width:100%; font-size:0.85rem; padding:8px;">
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Delivery Challan No.</label>
                <input type="text" id="inp-grn-challan" placeholder="DC-10293" style="width:100%; font-size:0.85rem; padding:8px;">
              </div>
            </div>

            <h4 style="margin:20px 0 10px 0; color:var(--accent-primary);">LINE-BY-LINE INSPECTION & RECEIVING GRID</h4>
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Item Code & Name</th>
                    <th style="padding:8px;">Purchase UOM</th>
                    <th style="padding:8px;">Ordered Qty</th>
                    <th style="padding:8px;">Received Qty</th>
                    <th style="padding:8px;">Accepted Qty</th>
                    <th style="padding:8px;">Rejected Qty</th>
                    <th style="padding:8px;">Rejection Reason</th>
                    <th style="padding:8px;">Batch #</th>
                    <th style="padding:8px;">Expiry Date</th>
                    <th style="padding:8px;">Unit Price (₹)</th>
                  </tr>
                </thead>
                <tbody id="grn-inspection-tbody">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
}

renderStockTransfersPage(session) {
  const tenantId = session ? session.tenantId : '';
  const transfers = stockTransferRepository.getAll(tenantId);
  const items = inventoryRepository.getAll(tenantId);
  const locations = offlineStore.getCollection('storage_locations', tenantId) || [];

  const locOpts = locations.map(l => `<option value="${l.locationCode}">${l.locationName} (${l.locationCode})</option>`).join('');
  const itemOpts = items.map(i => `<option value="${i.itemCode}">${i.itemName} (${i.itemCode})</option>`).join('');

  return `
        <div class="animate-fade-in flex-col gap-md">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">🚚 Stock Transfers (${transfers.length} Transfers)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Atomic & Idempotent Inter-Store Stock Movements (Paired Ledger Posting).
              </p>
            </div>
            <div>
              <button type="button" class="btn-primary" id="btn-open-transfer-modal" style="padding:10px 20px; font-weight:700; cursor:pointer;">
                + Post Stock Transfer
              </button>
            </div>
          </div>

          <!-- Transfer Creation Form Panel -->
          <div id="transfer-form-panel" class="card" style="display:none; background:var(--bg-surface-1); padding:20px; border-left:4px solid var(--accent-primary); margin-bottom:20px;">
            <h4 style="margin:0 0 14px 0; color:var(--accent-primary);">NEW INTER-STORE STOCK TRANSFER</h4>
            <div class="grid grid-cols-3 gap-md">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Source Store (From) *</label>
                <select id="inp-trf-from-loc" style="width:100%; font-size:0.85rem; padding:8px;">${locOpts}</select>
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Destination Store (To) *</label>
                <select id="inp-trf-to-loc" style="width:100%; font-size:0.85rem; padding:8px;">${locOpts}</select>
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Transfer Date</label>
                <input type="date" id="inp-trf-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%; font-size:0.85rem; padding:8px;">
              </div>
            </div>

            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; margin:16px 0;">
              <div style="display:grid; grid-template-columns: 2fr 1fr auto; gap:10px; align-items:end;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Select Item</label>
                  <select id="inp-trf-line-item" style="width:100%; font-size:0.85rem; padding:6px;">${itemOpts}</select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Transfer Quantity</label>
                  <input type="number" step="0.01" id="inp-trf-line-qty" value="10.0" style="width:100%; font-size:0.85rem; padding:6px;">
                </div>
                <div>
                  <button type="button" class="btn-primary" id="btn-add-trf-line" style="padding:8px 16px;">+ Add Line</button>
                </div>
              </div>
            </div>

            <div id="trf-lines-container" style="margin-bottom:16px;">
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Item Code & Name</th>
                    <th style="padding:8px;">Transfer Qty</th>
                    <th style="padding:8px; text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody id="trf-lines-tbody"></tbody>
              </table>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px;">
              <button type="button" class="btn-secondary" id="btn-cancel-trf-form">Cancel</button>
              <button type="button" class="btn-primary" id="btn-commit-trf" style="padding:10px 22px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border:none; color:#fff; cursor:pointer;">🔒 POST TRANSFER & COMMIT LEDGER</button>
            </div>
          </div>

          <!-- Transfer History Table -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h4 style="margin:0 0 12px 0;">HISTORICAL STOCK TRANSFERS (${transfers.length})</h4>
            ${transfers.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Transfer #</th>
                    <th style="padding:8px;">From Store</th>
                    <th style="padding:8px;">To Store</th>
                    <th style="padding:8px;">Date</th>
                    <th style="padding:8px;">Items</th>
                    <th style="padding:8px;">Posted By</th>
                    <th style="padding:8px;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${transfers.map(t => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${t.transferNo}</td>
                      <td style="padding:8px;"><span class="badge badge-warning">${t.fromLocationCode}</span></td>
                      <td style="padding:8px;"><span class="badge badge-success">${t.toLocationCode}</span></td>
                      <td style="padding:8px;">${t.transferDate}</td>
                      <td style="padding:8px;">${t.lines.length} Line Items</td>
                      <td style="padding:8px; font-weight:600;">${t.postedBy}</td>
                      <td style="padding:8px;"><span class="badge badge-success">🔒 PAIRED LEDGERED</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">🚚 No stock transfers posted yet. Click <strong>+ Post Stock Transfer</strong> above to perform your first inter-store movement!</div>`}
          </div>
        </div>
      `;
}

renderStockIssuesPage(session) {
  const tenantId = session ? session.tenantId : '';
  const issues = stockIssueRepository.getAll(tenantId);
  const items = inventoryRepository.getAll(tenantId);
  const locations = offlineStore.getCollection('storage_locations', tenantId) || [];

  const locOpts = locations.map(l => `<option value="${l.locationCode}">${l.locationName} (${l.locationCode})</option>`).join('');
  const itemOpts = items.map(i => `<option value="${i.itemCode}">${i.itemName} (${i.itemCode})</option>`).join('');

  return `
        <div class="animate-fade-in flex-col gap-md">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">📤 Stock Issues (${issues.length} Issues)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Manual Operational Consumption by Department (Kitchen, Bar, Housekeeping).
              </p>
            </div>
            <div>
              <button type="button" class="btn-primary" id="btn-open-issue-modal" style="padding:10px 20px; font-weight:700; cursor:pointer;">
                + Post Stock Issue
              </button>
            </div>
          </div>

          <!-- Issue Creation Form Panel -->
          <div id="issue-form-panel" class="card" style="display:none; background:var(--bg-surface-1); padding:20px; border-left:4px solid var(--status-warning); margin-bottom:20px;">
            <h4 style="margin:0 0 14px 0; color:var(--status-warning);">NEW OPERATIONAL STOCK ISSUE</h4>
            <div class="grid grid-cols-3 gap-md">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Issuing Store (From) *</label>
                <select id="inp-iss-from-loc" style="width:100%; font-size:0.85rem; padding:8px;">${locOpts}</select>
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Issued To Department *</label>
                <select id="inp-iss-dept" style="width:100%; font-size:0.85rem; padding:8px;">
                  <option value="Kitchen">Kitchen Department</option>
                  <option value="Bar">Bar & Beverage</option>
                  <option value="Housekeeping">Cleaning & Housekeeping</option>
                  <option value="Service">Dining Room & Service</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Recipient Name</label>
                <input type="text" id="inp-iss-person" placeholder="Chef D'Souza" style="width:100%; font-size:0.85rem; padding:8px;">
              </div>
            </div>

            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; margin:16px 0;">
              <div style="display:grid; grid-template-columns: 2fr 1fr auto; gap:10px; align-items:end;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Select Item</label>
                  <select id="inp-iss-line-item" style="width:100%; font-size:0.85rem; padding:6px;">${itemOpts}</select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Issue Quantity</label>
                  <input type="number" step="0.01" id="inp-iss-line-qty" value="5.0" style="width:100%; font-size:0.85rem; padding:6px;">
                </div>
                <div>
                  <button type="button" class="btn-primary" id="btn-add-iss-line" style="padding:8px 16px;">+ Add Line</button>
                </div>
              </div>
            </div>

            <div id="iss-lines-container" style="margin-bottom:16px;">
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Item Code & Name</th>
                    <th style="padding:8px;">Issue Qty</th>
                    <th style="padding:8px; text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody id="iss-lines-tbody"></tbody>
              </table>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px;">
              <button type="button" class="btn-secondary" id="btn-cancel-iss-form">Cancel</button>
              <button type="button" class="btn-primary" id="btn-commit-iss" style="padding:10px 22px; font-weight:700; background:linear-gradient(135deg, var(--status-warning), #d97706); border:none; color:#fff; cursor:pointer;">🔒 POST ISSUE & COMMIT CONSUMPTION</button>
            </div>
          </div>

          <!-- Issue History Table -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h4 style="margin:0 0 12px 0;">HISTORICAL STOCK ISSUES (${issues.length})</h4>
            ${issues.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Issue #</th>
                    <th style="padding:8px;">From Store</th>
                    <th style="padding:8px;">Issued To Department</th>
                    <th style="padding:8px;">Recipient</th>
                    <th style="padding:8px;">Date</th>
                    <th style="padding:8px;">Lines</th>
                    <th style="padding:8px;">Posted By</th>
                  </tr>
                </thead>
                <tbody>
                  ${issues.map(i => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${i.issueNo}</td>
                      <td style="padding:8px;"><span class="badge badge-secondary">${i.fromLocationCode}</span></td>
                      <td style="padding:8px;"><span class="badge badge-warning">${i.issuedToDepartment}</span></td>
                      <td style="padding:8px; font-weight:600;">${i.issuedToPerson || '--'}</td>
                      <td style="padding:8px;">${i.issueDate}</td>
                      <td style="padding:8px;">${i.lines.length} Items</td>
                      <td style="padding:8px;">${i.postedBy}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">📤 No operational stock issues recorded yet.</div>`}
          </div>
        </div>
      `;
}

renderStockAdjustmentsPage(session) {
  const tenantId = session ? session.tenantId : '';
  const adjustments = stockAdjustmentRepository.getAll(tenantId);
  const items = inventoryRepository.getAll(tenantId);
  const locations = offlineStore.getCollection('storage_locations', tenantId) || [];

  const locOpts = locations.map(l => `<option value="${l.locationCode}">${l.locationName} (${l.locationCode})</option>`).join('');
  const itemOpts = items.map(i => `<option value="${i.itemCode}">${i.itemName} (${i.itemCode})</option>`).join('');

  return `
        <div class="animate-fade-in flex-col gap-md">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">⚖️ Stock Adjustments (${adjustments.length} Adjustments)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Controlled Wastage, Spoilage, Expiry & Audit Corrections.
              </p>
            </div>
            <div>
              <button type="button" class="btn-primary" id="btn-open-adj-modal" style="padding:10px 20px; font-weight:700; cursor:pointer;">
                + Post Stock Adjustment
              </button>
            </div>
          </div>

          <!-- Adjustment Creation Form Panel -->
          <div id="adj-form-panel" class="card" style="display:none; background:var(--bg-surface-1); padding:20px; border-left:4px solid var(--status-danger); margin-bottom:20px;">
            <h4 style="margin:0 0 14px 0; color:var(--status-danger);">NEW CONTROLLED STOCK ADJUSTMENT</h4>
            <div class="grid grid-cols-3 gap-md">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Store Location *</label>
                <select id="inp-adj-loc" style="width:100%; font-size:0.85rem; padding:8px;">${locOpts}</select>
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Reason Code *</label>
                <select id="inp-adj-reason" style="width:100%; font-size:0.85rem; padding:8px;">
                  <option value="SPOILAGE">SPOILAGE (Spoiled food / perishables)</option>
                  <option value="EXPIRY">EXPIRY (Passed expiration date)</option>
                  <option value="DAMAGE">DAMAGE (Damaged goods / broken seal)</option>
                  <option value="BREAKAGE">BREAKAGE (Glassware / bottle breakage)</option>
                  <option value="STOCK_AUDIT_CORRECTION">STOCK_AUDIT_CORRECTION (Physical audit correction)</option>
                  <option value="OTHER_APPROVED">OTHER_APPROVED (Other manager approved)</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Adjustment Date</label>
                <input type="date" id="inp-adj-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%; font-size:0.85rem; padding:8px;">
              </div>
            </div>

            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; margin:16px 0;">
              <div style="display:grid; grid-template-columns: 2fr 1fr 1fr auto; gap:10px; align-items:end;">
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Select Item</label>
                  <select id="inp-adj-line-item" style="width:100%; font-size:0.85rem; padding:6px;">${itemOpts}</select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Adjustment Type</label>
                  <select id="inp-adj-line-type" style="width:100%; font-size:0.85rem; padding:6px;">
                    <option value="DECREASE">DECREASE (-) Write-Off</option>
                    <option value="INCREASE">INCREASE (+) Surplus</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Quantity</label>
                  <input type="number" step="0.01" id="inp-adj-line-qty" value="2.0" style="width:100%; font-size:0.85rem; padding:6px;">
                </div>
                <div>
                  <button type="button" class="btn-primary" id="btn-add-adj-line" style="padding:8px 16px;">+ Add Line</button>
                </div>
              </div>
            </div>

            <div id="adj-lines-container" style="margin-bottom:16px;">
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Item Code & Name</th>
                    <th style="padding:8px;">Type</th>
                    <th style="padding:8px;">Quantity</th>
                    <th style="padding:8px; text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody id="adj-lines-tbody"></tbody>
              </table>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px;">
              <button type="button" class="btn-secondary" id="btn-cancel-adj-form">Cancel</button>
              <button type="button" class="btn-primary" id="btn-commit-adj" style="padding:10px 22px; font-weight:700; background:linear-gradient(135deg, var(--status-danger), #dc2626); border:none; color:#fff; cursor:pointer;">🔒 POST ADJUSTMENT & UPDATE BALANCES</button>
            </div>
          </div>

          <!-- Adjustment History Table -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h4 style="margin:0 0 12px 0;">HISTORICAL ADJUSTMENTS (${adjustments.length})</h4>
            ${adjustments.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Adjustment #</th>
                    <th style="padding:8px;">Store</th>
                    <th style="padding:8px;">Reason Code</th>
                    <th style="padding:8px;">Date</th>
                    <th style="padding:8px;">Lines</th>
                    <th style="padding:8px;">Posted By</th>
                  </tr>
                </thead>
                <tbody>
                  ${adjustments.map(a => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${a.adjustmentNo}</td>
                      <td style="padding:8px;"><span class="badge badge-secondary">${a.locationCode}</span></td>
                      <td style="padding:8px;"><span class="badge badge-danger">${a.reasonCode}</span></td>
                      <td style="padding:8px;">${a.adjustmentDate}</td>
                      <td style="padding:8px;">${a.lines.length} Items</td>
                      <td style="padding:8px;">${a.postedBy}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">⚖️ No stock adjustments recorded yet.</div>`}
          </div>
        </div>
      `;
}

renderStockCountsPage(session) {
  const tenantId = session ? session.tenantId : '';
  const counts = stockCountRepository.getAll(tenantId);
  const items = inventoryRepository.getAll(tenantId);
  const locations = offlineStore.getCollection('storage_locations', tenantId) || [];
  const locOpts = locations.map(l => `<option value="${l.locationCode}">${l.locationName} (${l.locationCode})</option>`).join('');

  return `
        <div class="animate-fade-in flex-col gap-md">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">📋 Physical Stock Count & Reconciliation (${counts.length} Audits)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Physical vs System Stock Reconciliation Engine with Automatic Variance Adjustment.
              </p>
            </div>
            <div>
              <button type="button" class="btn-primary" id="btn-open-count-modal" style="padding:10px 20px; font-weight:700; cursor:pointer;">
                + Start Physical Stock Audit
              </button>
            </div>
          </div>

          <!-- Stock Count Audit Studio Panel -->
          <div id="count-form-panel" class="card" style="display:none; background:var(--bg-surface-1); padding:20px; border-left:4px solid var(--accent-secondary); margin-bottom:20px;">
            <h4 style="margin:0 0 14px 0; color:var(--accent-secondary);">PHYSICAL STOCK COUNT AUDIT SESSION</h4>
            <div class="grid grid-cols-2 gap-md">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Select Store Location to Audit *</label>
                <select id="inp-cnt-loc" style="width:100%; font-size:0.85rem; padding:8px;">${locOpts}</select>
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Audit Date</label>
                <input type="date" id="inp-cnt-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%; font-size:0.85rem; padding:8px;">
              </div>
            </div>

            <h4 style="margin:20px 0 10px 0; color:var(--accent-secondary);">SYSTEM BALANCE SNAPSHOT & PHYSICAL COUNT GRID</h4>
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Item Code & Name</th>
                    <th style="padding:8px;">System Snapshot Qty</th>
                    <th style="padding:8px;">Physical Count Qty</th>
                    <th style="padding:8px;">Variance</th>
                  </tr>
                </thead>
                <tbody id="cnt-grid-tbody"></tbody>
              </table>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:16px;">
              <button type="button" class="btn-secondary" id="btn-cancel-cnt-form">Cancel</button>
              <button type="button" class="btn-primary" id="btn-commit-cnt" style="padding:10px 22px; font-weight:700; background:linear-gradient(135deg, var(--accent-secondary), #0284c7); border:none; color:#fff; cursor:pointer;">🔒 APPROVE & RECONCILE AUDIT</button>
            </div>
          </div>

          <!-- Audit Session History -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h4 style="margin:0 0 12px 0;">HISTORICAL STOCK AUDITS (${counts.length})</h4>
            ${counts.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Audit #</th>
                    <th style="padding:8px;">Store Location</th>
                    <th style="padding:8px;">Audit Date</th>
                    <th style="padding:8px;">Audited Items</th>
                    <th style="padding:8px;">Reconciled By</th>
                    <th style="padding:8px;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${counts.map(c => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${c.countNo}</td>
                      <td style="padding:8px;"><span class="badge badge-secondary">${c.locationCode}</span></td>
                      <td style="padding:8px;">${c.countDate}</td>
                      <td style="padding:8px;">${c.lines.length} Items</td>
                      <td style="padding:8px;">${c.reconciledBy}</td>
                      <td style="padding:8px;"><span class="badge badge-success">🔒 RECONCILED</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">📋 No physical stock count sessions recorded yet.</div>`}
          </div>
        </div>
      `;
}

renderLowStockAlertsPage(session) {
  const tenantId = session ? session.tenantId : '';
  const items = inventoryRepository.getAll(tenantId);
  const locations = offlineStore.getCollection('storage_locations', tenantId) || [];
  const balances = offlineStore.getCollection('stock_balances', tenantId) || [];

  const alerts = [];
  items.forEach(i => {
    const reorder = parseFloat(i.reorderLevel) || 0;
    locations.forEach(l => {
      const bal = balances.find(b => b.itemCode === i.itemCode && b.locationCode === l.locationCode && (!tenantId || b.tenantId === tenantId));
      const currentQty = bal ? (parseFloat(bal.quantity) || 0) : 0;
      if (currentQty <= reorder) {
        alerts.push({
          itemCode: i.itemCode,
          itemName: i.itemName,
          supplierCode: i.preferredSupplierCode || i.defaultSupplierCode || 'SUP-001',
          locationCode: l.locationCode,
          locationName: l.locationName,
          currentQty,
          reorderLevel: reorder,
          baseUom: i.baseUom || 'KG'
        });
      }
    });
  });

  return `
        <div class="animate-fade-in flex-col gap-md">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">⚠️ Location-Aware Low Stock Alerts (${alerts.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Store-specific stock levels evaluated against location reorder policies with one-click PO generation.
              </p>
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            ${alerts.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:8px;">Item Code & Name</th>
                    <th style="padding:8px;">Location / Store</th>
                    <th style="padding:8px;">Current Store Stock</th>
                    <th style="padding:8px;">Reorder Level Policy</th>
                    <th style="padding:8px;">Alert Status</th>
                    <th style="padding:8px; text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${alerts.map(a => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px; font-weight:700;">${a.itemName} <span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">(${a.itemCode})</span></td>
                      <td style="padding:8px;"><span class="badge badge-info">${a.locationName} (${a.locationCode})</span></td>
                      <td style="padding:8px; font-weight:700; color:var(--status-danger);">${a.currentQty.toFixed(2)} ${a.baseUom}</td>
                      <td style="padding:8px;">${a.reorderLevel.toFixed(2)} ${a.baseUom}</td>
                      <td style="padding:8px;"><span class="badge badge-danger">⚠️ BELOW REORDER POLICY</span></td>
                      <td style="padding:8px; text-align:right;">
                        <button type="button" class="btn-primary btn-alert-create-po" data-code="${a.itemCode}" data-supplier="${a.supplierCode}" style="padding:4px 10px; font-size:0.75rem; font-weight:700; cursor:pointer;">
                          + Create PO
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div style="padding:24px; text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">✔ All location store balances are healthy and above reorder thresholds!</div>`}
          </div>
        </div>
      `;
}

renderStockLedgerExplorerPage(session) {
  const tenantId = session ? session.tenantId : '';
  const ledger = offlineStore.getCollection('stock_ledger', tenantId) || [];
  const filterLoc = this.ledgerFilterLoc || 'ALL';
  const filterType = this.ledgerFilterType || 'ALL';

  const filteredLedger = ledger.filter(l => {
    if (filterLoc !== 'ALL' && l.locationCode !== filterLoc) return false;
    if (filterType !== 'ALL' && l.transactionType !== filterType) return false;
    return true;
  });

  return `
        <div class="animate-fade-in flex-col gap-md">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary);">📜 Immutable Stock Ledger Explorer (${filteredLedger.length} Movements)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Complete Append-Only Audit History of Every Stock Inbound, Outbound, Transfer & Adjustment.
              </p>
            </div>
          </div>

          <!-- Filters -->
          <div style="display:flex; gap:12px; background:var(--bg-surface-1); padding:12px 16px; border-radius:6px; border:1px solid var(--border-subtle); align-items:center; flex-wrap:wrap;">
            <div style="font-size:0.8rem; font-weight:700;">Filter By:</div>
            <div>
              <label style="font-size:0.75rem; margin-right:4px;">Transaction Type</label>
              <select id="inp-ledger-filter-type" style="font-size:0.8rem; padding:4px;">
                <option value="ALL" ${filterType === 'ALL' ? 'selected' : ''}>All Transaction Types</option>
                <option value="GOODS_RECEIPT_INBOUND" ${filterType === 'GOODS_RECEIPT_INBOUND' ? 'selected' : ''}>GOODS_RECEIPT_INBOUND</option>
                <option value="OPENING_STOCK_INBOUND" ${filterType === 'OPENING_STOCK_INBOUND' ? 'selected' : ''}>OPENING_STOCK_INBOUND</option>
                <option value="TRANSFER_OUT" ${filterType === 'TRANSFER_OUT' ? 'selected' : ''}>TRANSFER_OUT</option>
                <option value="TRANSFER_IN" ${filterType === 'TRANSFER_IN' ? 'selected' : ''}>TRANSFER_IN</option>
                <option value="ISSUE_OUT" ${filterType === 'ISSUE_OUT' ? 'selected' : ''}>ISSUE_OUT</option>
                <option value="ADJUSTMENT_OUT" ${filterType === 'ADJUSTMENT_OUT' ? 'selected' : ''}>ADJUSTMENT_OUT</option>
                <option value="ADJUSTMENT_IN" ${filterType === 'ADJUSTMENT_IN' ? 'selected' : ''}>ADJUSTMENT_IN</option>
              </select>
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            ${filteredLedger.length ? `
              <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                  <thead>
                    <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                      <th style="padding:8px;">Ledger ID</th>
                      <th style="padding:8px;">Type</th>
                      <th style="padding:8px;">Document #</th>
                      <th style="padding:8px;">Item Code</th>
                      <th style="padding:8px;">Location</th>
                      <th style="padding:8px;">Base Qty</th>
                      <th style="padding:8px;">Unit Cost</th>
                      <th style="padding:8px;">Total Valuation</th>
                      <th style="padding:8px;">Timestamp</th>
                      <th style="padding:8px;">Posted By</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredLedger.map(l => `
                      <tr style="border-bottom:1px solid var(--border-subtle);">
                        <td style="padding:8px; font-family:monospace; font-weight:600;">${l.ledgerId}</td>
                        <td style="padding:8px;"><span class="badge ${l.baseQuantity > 0 ? 'badge-success' : 'badge-danger'}">${l.transactionType}</span></td>
                        <td style="padding:8px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${l.documentNo}</td>
                        <td style="padding:8px; font-weight:700;">${l.itemCode}</td>
                        <td style="padding:8px;"><span class="badge badge-secondary">${l.locationCode}</span></td>
                        <td style="padding:8px; font-weight:700; color:${l.baseQuantity > 0 ? 'var(--status-success)' : 'var(--status-danger)'};">${l.baseQuantity > 0 ? '+' : ''}${l.baseQuantity.toFixed(2)} ${l.baseUom}</td>
                        <td style="padding:8px;">₹${(l.unitCost || 0).toFixed(2)}</td>
                        <td style="padding:8px; font-weight:700;">₹${(l.totalValuation || 0).toFixed(2)}</td>
                        <td style="padding:8px;">${new Date(l.timestamp).toLocaleString()}</td>
                        <td style="padding:8px;">${l.postedBy}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `<div style="padding:24px; text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px;">📜 Stock ledger is empty for the selected filter. Perform a receipt, transfer, issue, or adjustment to populate audit entries!</div>`}
          </div>
        </div>
      `;
}

renderMasterItemDetailPage(session) {
  const tenantId = session ? session.tenantId : '';
  const code = this.selectedMasterItemCode;
  const item = inventoryRepository.getByCode(code, tenantId) || inventoryRepository.getById(code, tenantId);

  if (!item) {
    return `
          <div class="animate-fade-in card" style="padding:30px; text-align:center;">
            <h3>❌ Master Item Not Found</h3>
            <p style="color:var(--text-muted);">The requested inventory item "${code}" could not be located.</p>
            <button class="btn-secondary" id="btn-back-from-detail">← Back to Master Catalog</button>
          </div>
        `;
  }

  const purUom = item.purchaseUom || item.baseUom || 'KG';
  const factor = parseFloat(item.conversionFactor) || 1;
  const purPrice = parseFloat(item.lastPurchasePrice) || 0;
  const baseCost = parseFloat(item.unitValuation) || (factor > 0 ? (purPrice / factor) : purPrice);
  const yieldPct = item.standardYieldPercent !== undefined ? item.standardYieldPercent : 100.0;
  const deptScope = item.departmentUsageScope || 'ALL';
  const catObj = categoryRepository.getByCode(item.categoryCode, tenantId);
  const catName = catObj ? catObj.categoryName : (item.categoryName || item.categoryCode);
  const famCode = catObj ? catObj.productFamilyCode : (item.productFamilyCode || 'FAM-PRODUCE');
  const famObj = PRODUCT_FAMILIES_REGISTRY[famCode] || { icon: '📦', name: 'General', code: famCode };

  const locations = offlineStore.getCollection('storage_locations', tenantId) || [];
  const balances = offlineStore.getCollection('stock_balances', tenantId) || [];
  const itemBalances = balances.filter(b => b.itemCode === item.itemCode || b.itemId === item.id);

  let locStockMap = [];
  if (itemBalances.length > 0) {
    locStockMap = itemBalances.map(b => {
      const loc = locations.find(l => l.locationCode === b.locationCode) || { locationName: b.locationCode, locationType: 'Store' };
      return {
        locationCode: b.locationCode,
        locationName: loc.locationName,
        locationType: loc.locationType || 'Store',
        quantity: parseFloat(b.quantity) || 0
      };
    });
  } else {
    const allowedLocs = item.allowedLocationCodes || [item.defaultLocationCode || 'LOC-MWH'];
    const totalStock = parseFloat(item.currentStock !== undefined ? item.currentStock : (item.openingStock !== undefined ? item.openingStock : (item.reorderQuantity || 10)));

    allowedLocs.forEach((locCode, idx) => {
      const loc = locations.find(l => l.locationCode === locCode) || { locationName: locCode, locationType: 'Store' };
      const qty = allowedLocs.length === 1 ? totalStock : (idx === 0 ? Math.round(totalStock * 0.7 * 1000) / 1000 : Math.round((totalStock * 0.3 / (allowedLocs.length - 1)) * 1000) / 1000);
      locStockMap.push({
        locationCode: locCode,
        locationName: loc.locationName,
        locationType: loc.locationType || 'Store',
        quantity: qty
      });
    });
  }

  const totalCombinedStock = locStockMap.reduce((sum, l) => sum + l.quantity, 0);
  const totalCombinedValuation = totalCombinedStock * baseCost;

  return `
        <div class="animate-fade-in flex-col gap-md">
          <!-- Top Navigation Header -->
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle);">
            <div>
              <button class="btn-secondary" id="btn-back-from-detail" style="padding:6px 14px; font-weight:600; font-size:0.82rem; margin-bottom:6px;">
                ← Back to Master Catalog
              </button>
              <h2 style="margin:0; font-size:1.5rem; display:flex; align-items:center; gap:10px;">
                ${item.itemName} <span class="badge badge-primary" style="font-size:0.85rem;">${item.itemCode}</span>
              </h2>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Category: <strong>${catName}</strong> • Product Family: <strong>${famObj.icon} ${famObj.name} (${famCode})</strong>
              </p>
            </div>
            <div style="display:flex; gap:12px;">
              <button class="btn-primary" id="btn-edit-from-detail" data-id="${item.id || item.itemCode}" style="padding:10px 20px; font-weight:700;">
                ✏ Edit Item
              </button>
            </div>
          </div>

          <!-- Valuation Banner Card -->
          <div class="card" style="background:linear-gradient(135deg, var(--bg-surface-2), var(--bg-surface-1)); padding:20px; border-left:5px solid var(--accent-primary);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">CANONICAL ERP VALUATION ARCHITECTURE (BASE UOM STANDARD)</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-top:12px;">
              <div>
                <div style="font-size:0.78rem; color:var(--text-muted);">Base Unit Cost (unitValuation)</div>
                <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">₹${baseCost.toFixed(2)} / ${item.baseUom}</div>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">🔒 Primary valuation basis for stock ledgers & BOM recipes</div>
              </div>
              <div>
                <div style="font-size:0.78rem; color:var(--text-muted);">Last Purchase Price</div>
                <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;">₹${purPrice.toFixed(2)} / ${purUom}</div>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">Supplier purchase packaging price</div>
              </div>
              <div>
                <div style="font-size:0.78rem; color:var(--text-muted);">Conversion Ratio</div>
                <div style="font-size:1.1rem; font-weight:700; margin-top:4px;">1 ${purUom} = ${factor} ${item.baseUom}</div>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">Base Unit Cost = Purchase Price / Conversion Factor</div>
              </div>
            </div>
          </div>

          <!-- Distributed Location Stock Breakdown Card -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <div>
                <h4 style="margin:0; color:var(--accent-primary);">🏬 DISTRIBUTED LOCATION STOCK BALANCES</h4>
                <p style="color:var(--text-muted); font-size:0.8rem; margin-top:2px;">Physical inventory breakdown across Main Warehouse, Kitchen, and Bar stores.</p>
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL COMBINED STOCK</div>
                <div style="font-size:1.25rem; font-weight:700; color:var(--status-success);">${totalCombinedStock.toFixed(3)} ${item.baseUom} (₹${totalCombinedValuation.toLocaleString('en-IN')})</div>
              </div>
            </div>

            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Store Location Code</th>
                  <th style="padding:10px;">Location Name</th>
                  <th style="padding:10px;">Store Type</th>
                  <th style="padding:10px;">Stock Balance (Base UOM)</th>
                  <th style="padding:10px;">Location Valuation (₹)</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${locStockMap.map(l => {
    const val = l.quantity * baseCost;
    return `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${l.locationCode}</td>
                      <td style="padding:10px; font-weight:600;">${l.locationName}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${l.locationType}</span></td>
                      <td style="padding:10px; font-weight:700; color:var(--status-success);">${l.quantity.toFixed(3)} ${item.baseUom}</td>
                      <td style="padding:10px; font-weight:700;">₹${val.toFixed(2)}</td>
                      <td style="padding:10px;"><span class="badge badge-success">Active Store Balance</span></td>
                    </tr>
                  `;
  }).join('')}
              </tbody>
            </table>
          </div>

          <!-- 6-Section Detail Inspector Grid -->
          <div class="grid grid-cols-2 gap-md">
            <!-- SECTION 1: IDENTITY & CLASSIFICATION -->
            <div class="card" style="background:var(--bg-surface-1); padding:20px;">
              <h4 style="margin:0 0 12px 0; color:var(--accent-primary);">SECTION 1: IDENTITY & CLASSIFICATION</h4>
              <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Item Permanent Code:</td><td style="padding:8px 0; font-weight:700; font-family:monospace;">${item.itemCode}</td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Item Display Name:</td><td style="padding:8px 0; font-weight:600;">${item.itemName}</td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Item Classification Type:</td><td style="padding:8px 0;"><span class="badge badge-info">${item.itemType}</span></td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Operational Category:</td><td style="padding:8px 0; font-weight:600;">${catName} (${item.categoryCode})</td></tr>
                <tr><td style="padding:8px 0; color:var(--text-muted);">Canonical Product Family:</td><td style="padding:8px 0; font-weight:700;">${famObj.icon} ${famObj.name} (${famCode})</td></tr>
              </table>
            </div>

            <!-- SECTION 2: UNITS & CONVERSION ENGINE -->
            <div class="card" style="background:var(--bg-surface-1); padding:20px;">
              <h4 style="margin:0 0 12px 0; color:var(--accent-primary);">SECTION 2: UNITS & CONVERSIONS</h4>
              <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Canonical Base UOM:</td><td style="padding:8px 0;"><span class="badge badge-success">${item.baseUom}</span></td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Supplier Purchase UOM:</td><td style="padding:8px 0; font-weight:600;">${purUom}</td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Conversion Factor:</td><td style="padding:8px 0; font-weight:700; color:var(--accent-primary);">${factor}</td></tr>
                <tr><td style="padding:8px 0; color:var(--text-muted);">Recipe Consumption Units:</td><td style="padding:8px 0; color:var(--text-muted); font-size:0.8rem;">Compatible Canonical UOMs in ${item.baseUom} Family</td></tr>
              </table>
            </div>

            <!-- SECTION 3: STORAGE & STOCK OWNERSHIP -->
            <div class="card" style="background:var(--bg-surface-1); padding:20px;">
              <h4 style="margin:0 0 12px 0; color:var(--accent-primary);">SECTION 3: STORAGE & OWNERSHIP</h4>
              <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Default Receiving Location:</td><td style="padding:8px 0; font-weight:700;">${item.defaultLocationCode || 'LOC-MWH'}</td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Allowed Store Locations:</td><td style="padding:8px 0;">${(item.allowedLocationCodes || [item.defaultLocationCode || 'LOC-MWH']).map(l => `<span class="badge badge-secondary" style="margin-right:4px;">${l}</span>`).join('')}</td></tr>
                <tr><td style="padding:8px 0; color:var(--text-muted);">Inter-Store Transfers:</td><td style="padding:8px 0;"><span class="badge ${item.isTransferAllowed !== false ? 'badge-success' : 'badge-danger'}">${item.isTransferAllowed !== false ? 'Allowed' : 'Disabled'}</span></td></tr>
              </table>
            </div>

            <!-- SECTION 4: SUPPLIER CONFIGURATION & TAX -->
            <div class="card" style="background:var(--bg-surface-1); padding:20px;">
              <h4 style="margin:0 0 12px 0; color:var(--accent-primary);">SECTION 4: SUPPLIER CONFIGURATION & TAX</h4>
              <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Preferred Supplier Code:</td><td style="padding:8px 0; font-weight:700;">${item.preferredSupplierCode || item.defaultSupplierCode || 'SUP-001'}</td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Supplier Item SKU:</td><td style="padding:8px 0; font-family:monospace;">${item.supplierItemCode || '--'}</td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Purchase Tax Profile:</td><td style="padding:8px 0;"><span class="badge badge-info">${item.purchaseTaxProfile || '12% GST'}</span></td></tr>
                <tr><td style="padding:8px 0; color:var(--text-muted);">Purchase Lead Time:</td><td style="padding:8px 0;">${item.purchaseLeadTimeDays || 1} Days</td></tr>
              </table>
            </div>

            <!-- SECTION 5: STOCK CONTROL & POLICY -->
            <div class="card" style="background:var(--bg-surface-1); padding:20px;">
              <h4 style="margin:0 0 12px 0; color:var(--accent-primary);">SECTION 5: STOCK CONTROL & POLICY</h4>
              <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Reorder Alert Level:</td><td style="padding:8px 0; font-weight:700; color:var(--accent-primary);">${item.reorderLevel || 10} ${item.baseUom}</td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Minimum Safety Stock:</td><td style="padding:8px 0; font-weight:700; color:var(--status-danger);">${item.minimumStockLevel || 5} ${item.baseUom}</td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Maximum Storage Capacity:</td><td style="padding:8px 0; font-weight:700;">${item.maximumStockLevel || 50} ${item.baseUom}</td></tr>
                <tr><td style="padding:8px 0; color:var(--text-muted);">Tracking Controls:</td><td style="padding:8px 0;"><span class="badge badge-info">Batch</span> <span class="badge badge-warning">FEFO Expiry (${item.shelfLifeDays || 180}d)</span></td></tr>
              </table>
            </div>

            <!-- SECTION 6: INVENTORY BEHAVIOURS & YIELD -->
            <div class="card" style="background:var(--bg-surface-1); padding:20px;">
              <h4 style="margin:0 0 12px 0; color:var(--accent-primary);">SECTION 6: INVENTORY BEHAVIOURS & YIELD</h4>
              <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">POS Auto-Deduction Engine:</td><td style="padding:8px 0;"><span class="badge ${item.autoDeductionEnabled !== false ? 'badge-success' : 'badge-warning'}">${item.autoDeductionEnabled !== false ? 'ENABLED (Deducts on Order)' : 'DISABLED'}</span></td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">BOM Recipe Ingredient:</td><td style="padding:8px 0;"><span class="badge ${item.isRecipeIngredient !== false ? 'badge-info' : 'badge-secondary'}">${item.isRecipeIngredient !== false ? 'Eligible' : 'Not Ingredient'}</span></td></tr>
                <tr style="border-bottom:1px solid var(--border-subtle);"><td style="padding:8px 0; color:var(--text-muted);">Department Usage Scope:</td><td style="padding:8px 0;"><span class="badge badge-secondary">${deptScope}</span></td></tr>
                <tr><td style="padding:8px 0; color:var(--text-muted);">Standard Usable Yield:</td><td style="padding:8px 0; font-weight:700; color:var(--status-success);">${yieldPct}% Usable Net Yield</td></tr>
              </table>
            </div>
          </div>
        </div>
      `;
}

// 🏛️ Card 2: Dining Areas Configuration View (PD-019 & PD-019B)
renderConfigAreas(mount, session) {
  const tenantId = session.tenantId;
  const areas = offlineStore.getCollection('dining_areas', tenantId) || [];
  const tables = tableRepository.getAll(tenantId);
  const activeAreas = areas.filter(a => a.status !== 'ARCHIVED');
  const totalSeats = activeAreas.reduce((sum, a) => {
    const areaTables = tables.filter(t => t.areaId === a.id && t.status !== 'ARCHIVED');
    return sum + areaTables.reduce((ts, t) => ts + (t.seats || 0), 0);
  }, 0);

  mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 style="font-size:1.75rem; margin:0;">⚙ Configuration → Card 2: Dining Areas</h2>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                PD-019 & PD-019B Specification • Physical zones & seating capacity.
              </p>
            </div>
            <button class="btn-primary" id="btn-add-area-modal" style="padding:10px 18px; font-weight:600;">
              + Add Dining Area
            </button>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:16px;">
            <div style="display:flex; gap:24px;">
              <div>Active Areas: <strong>${activeAreas.length}</strong></div>
              <div>Total Configured Seats: <strong>${totalSeats}</strong></div>
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h3>Dining Areas Catalog (${activeAreas.length})</h3>
            ${activeAreas.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-top:12px;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:10px;">Area Code</th>
                    <th style="padding:10px;">Area Name</th>
                    <th style="padding:10px;">Area Type</th>
                    <th style="padding:10px;">Configured Tables</th>
                    <th style="padding:10px;">Total Capacity</th>
                    <th style="padding:10px;">Operating Status</th>
                    <th style="padding:10px;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${activeAreas.map(a => {
    const areaTables = tables.filter(t => t.areaId === a.id && t.status !== 'ARCHIVED');
    const areaSeats = areaTables.reduce((sum, t) => sum + (t.seats || 0), 0);
    return `
                      <tr style="border-bottom:1px solid var(--border-subtle);">
                        <td style="padding:10px; font-weight:700;">${a.areaCode}</td>
                        <td style="padding:10px; font-weight:600;">${a.areaName}</td>
                        <td style="padding:10px;"><span class="badge badge-info">${a.areaType || 'Indoor'}</span></td>
                        <td style="padding:10px; font-weight:700;">${areaTables.length} tables</td>
                        <td style="padding:10px; font-weight:700; color:var(--accent-primary);">${areaSeats} seats</td>
                        <td style="padding:10px;"><span class="badge badge-success">${a.status || 'OPEN'}</span></td>
                        <td style="padding:10px;">
                          <button class="btn-secondary btn-archive-area" data-id="${a.id}" style="font-size:0.75rem; color:var(--status-danger);">Archive</button>
                        </td>
                      </tr>
                    `;
  }).join('')}
                </tbody>
              </table>
            ` : `
              <div style="text-align:center; padding:30px; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px; margin-top:12px;">
                🏛️ No dining areas configured yet. Click <strong>+ Add Dining Area</strong> above to define zones (e.g. Main Dining Hall, Outdoor Terrace, Bar)!
              </div>
            `}
          </div>
        </div>
      `;

  mount.querySelector('#btn-add-area-modal').addEventListener('click', () => this.openAddAreaModal(session));
  mount.querySelectorAll('.btn-archive-area').forEach(btn => {
    btn.addEventListener('click', () => {
      const areaId = btn.dataset.id;
      const assigned = tables.filter(t => t.areaId === areaId && t.status !== 'ARCHIVED');
      if (assigned.length > 0) {
        alert(`❌ Cannot archive area! ${assigned.length} table(s) are assigned to this area. Reassign tables first.`);
        return;
      }
      if (confirm('Archive this dining area?')) {
        offlineStore.updateItem('dining_areas', 'id', areaId, { status: 'ARCHIVED' });
        alert('Area archived!');
        this.renderConfigAreas(mount, session);
      }
    });
  });
}

openAddAreaModal(session) {
  const modalMount = this.appEl.querySelector('#modal-container-mount');
  const modal = document.createElement('div');
  modal.className = 'lock-screen-overlay animate-fade-in';

  modal.innerHTML = `
        <div class="card" style="width:480px; background:var(--bg-surface-1); padding:24px;">
          <h3>+ Add Dining Area</h3>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:16px;">Define a physical dining zone (PD-019 Specification).</p>
          <div class="flex-col gap-sm">
            <div>
              <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Area Name *</label>
              <input type="text" id="inp-area-name" placeholder="e.g. Main Dining Hall" style="width:100%;">
            </div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Area Code Prefix *</label>
                <input type="text" id="inp-area-code" placeholder="e.g. MH" style="width:100%; text-transform:uppercase;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Area Type *</label>
                <select id="inp-area-type" style="width:100%;">
                  <option value="Indoor Main Hall">Indoor Main Hall</option>
                  <option value="Outdoor Terrace">Outdoor Terrace</option>
                  <option value="Bar Counter Seating">Bar Counter Seating</option>
                  <option value="VIP Private Room">VIP Private Room</option>
                  <option value="Rooftop Deck">Rooftop Deck</option>
                </select>
              </div>
            </div>
            <div>
              <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Reservation Policy</label>
              <select id="inp-area-policy" style="width:100%;">
                <option value="Reservations Allowed">Reservations Allowed</option>
                <option value="Walk-in Only">Walk-in Only</option>
                <option value="Private Booking Only">Private Booking Only</option>
              </select>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:16px;">
              <button class="btn-secondary" id="btn-area-cancel">Cancel</button>
              <button class="btn-primary" id="btn-area-save">Save Dining Area</button>
            </div>
          </div>
        </div>
      `;

  modalMount.innerHTML = '';
  modalMount.appendChild(modal);

  modal.querySelector('#btn-area-cancel').addEventListener('click', () => { modalMount.innerHTML = ''; });
  modal.querySelector('#btn-area-save').addEventListener('click', () => {
    const areaName = modal.querySelector('#inp-area-name').value.trim();
    const areaCode = modal.querySelector('#inp-area-code').value.trim().toUpperCase();
    const areaType = modal.querySelector('#inp-area-type').value;
    const reservationPolicy = modal.querySelector('#inp-area-policy').value;

    if (!areaName || !areaCode) {
      alert('❌ Please enter an Area Name and Area Code Prefix.');
      return;
    }

    const newArea = {
      id: 'area-' + Math.random().toString(36).substring(2, 7),
      tenantId: session.tenantId,
      areaCode,
      areaName,
      areaType,
      reservationPolicy,
      status: 'OPEN'
    };

    offlineStore.appendItem('dining_areas', newArea);
    offlineJournal.createSyncJob('CREATE_DINING_AREA', session.tenantId, 'dining_areas', newArea, session);
    logAudit(session.employeeName, `Created Dining Area "${areaName}" (${areaCode})`, session.tenantId);

    alert(`🎉 Dining Area "${areaName}" created successfully!`);
    modalMount.innerHTML = '';
    this.renderConfigAreas(this.appEl.querySelector('#main-mount'), session);
  });
}

// 🍽️ Card 3: Dining Tables & Assets Configuration View (PD-020 & PD-021)
renderConfigTables(mount, session) {
  const tenantId = session.tenantId;
  const areas = offlineStore.getCollection('dining_areas', tenantId) || [];
  const tables = tableRepository.getAll(tenantId);
  const activeTables = tables.filter(t => t.status !== 'ARCHIVED');

  mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 style="font-size:1.75rem; margin:0;">⚙ Configuration → Card 3: Dining Tables & Assets</h2>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                PD-020 & PD-021 Specification • TableRepository & Bulk Seating Generator.
              </p>
            </div>
            <div style="display:flex; gap:10px;">
              <button class="btn-secondary" id="btn-bulk-table-modal" style="padding:10px 18px; font-weight:600;">
                ⚡ Bulk Generate Tables
              </button>
              <button class="btn-primary" id="btn-add-table-modal" style="padding:10px 18px; font-weight:600;">
                + Add Single Table Asset
              </button>
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:16px;">
            <div>Total Active Tables: <strong>${activeTables.length}</strong></div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h3>Dining Tables Master Catalog (${activeTables.length})</h3>
            ${activeTables.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-top:12px;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:10px;">Table Code</th>
                    <th style="padding:10px;">Parent Area</th>
                    <th style="padding:10px;">Capacity (Seats)</th>
                    <th style="padding:10px;">Shape</th>
                    <th style="padding:10px;">Mergeable</th>
                    <th style="padding:10px;">Sync State</th>
                    <th style="padding:10px;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${activeTables.map(t => {
    const area = areas.find(a => a.id === t.areaId);
    return `
                      <tr style="border-bottom:1px solid var(--border-subtle);">
                        <td style="padding:10px; font-weight:700;">${t.tableCode}</td>
                        <td style="padding:10px; font-weight:600;">${area ? area.areaName : 'Unassigned'}</td>
                        <td style="padding:10px; font-weight:700; color:var(--accent-primary);">${t.seats} seats</td>
                        <td style="padding:10px;"><span class="badge badge-info">${t.shape || 'SQUARE'}</span></td>
                        <td style="padding:10px;">${t.isMergeable ? 'YES' : 'NO'}</td>
                        <td style="padding:10px;"><span class="badge badge-success">${t.syncState || 'QUEUED'}</span></td>
                        <td style="padding:10px;">
                          <button class="btn-secondary btn-archive-table" data-id="${t.id}" style="font-size:0.75rem; color:var(--status-danger);">Archive</button>
                        </td>
                      </tr>
                    `;
  }).join('')}
                </tbody>
              </table>
            ` : `
              <div style="text-align:center; padding:30px; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px; margin-top:12px;">
                🍽️ No dining tables created. Use <strong>⚡ Bulk Generate Tables</strong> or click <strong>+ Add Single Table Asset</strong> above!
              </div>
            `}
          </div>
        </div>
      `;

  mount.querySelector('#btn-add-table-modal').addEventListener('click', () => this.openAddTableModal(session));
  mount.querySelector('#btn-bulk-table-modal').addEventListener('click', () => this.openBulkGenerateTablesModal(session));

  mount.querySelectorAll('.btn-archive-table').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.id;
      if (confirm('Archive this table asset?')) {
        offlineStore.updateItem('tables_master', 'id', tid, { status: 'ARCHIVED' });
        alert('Table archived!');
        this.renderConfigTables(mount, session);
      }
    });
  });
}

openBulkGenerateTablesModal(session) {
  const modalMount = this.appEl.querySelector('#modal-container-mount');
  const modal = document.createElement('div');
  modal.className = 'lock-screen-overlay animate-fade-in';

  const tenantId = session.tenantId;
  const areas = offlineStore.getCollection('dining_areas', tenantId) || [];
  const activeAreas = areas.filter(a => a.status !== 'ARCHIVED');

  modal.innerHTML = `
        <div class="card" style="width:540px; background:var(--bg-surface-1); padding:24px;">
          <h3>⚡ Bulk Generate Dining Tables</h3>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:16px;">Quickly generate a sequence of dining table assets for a selected area.</p>
          <div class="flex-col gap-sm">
            <div>
              <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Select Target Dining Area *</label>
              <select id="inp-bulk-area" style="width:100%;">
                ${activeAreas.length ? activeAreas.map(a => `<option value="${a.id}" data-code="${a.areaCode}">${a.areaName} (${a.areaCode})</option>`).join('') : `<option value="">No areas created yet</option>`}
              </select>
            </div>

            <div class="grid grid-cols-3 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Table Prefix *</label>
                <input type="text" id="inp-bulk-prefix" value="T" style="width:100%; text-transform:uppercase;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Start Number *</label>
                <input type="number" id="inp-bulk-start" value="1" min="1" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Quantity (Count) *</label>
                <input type="number" id="inp-bulk-count" value="10" min="1" max="50" style="width:100%;">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Default Seats per Table</label>
                <input type="number" id="inp-bulk-seats" value="4" min="1" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Table Shape</label>
                <select id="inp-bulk-shape" style="width:100%;">
                  <option value="SQUARE">SQUARE</option>
                  <option value="ROUND">ROUND</option>
                  <option value="RECTANGLE">RECTANGLE</option>
                  <option value="BAR_STOOL">BAR STOOL</option>
                </select>
              </div>
            </div>

            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; margin-top:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">GENERATION PREVIEW</div>
              <div id="bulk-preview-text" style="font-size:0.85rem; font-family:monospace; color:var(--status-success);">
                Will generate: MH-T-01, MH-T-02, MH-T-03 ... MH-T-10 (4 seats each)
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:16px;">
              <button class="btn-secondary" id="btn-bulk-cancel">Cancel</button>
              <button class="btn-primary" id="btn-bulk-save">⚡ Generate Tables Now</button>
            </div>
          </div>
        </div>
      `;

  modalMount.innerHTML = '';
  modalMount.appendChild(modal);

  const updatePreview = () => {
    const areaSel = modal.querySelector('#inp-bulk-area');
    if (!areaSel || !areaSel.options.length || areaSel.selectedIndex === -1) return;
    const areaCode = areaSel.options[areaSel.selectedIndex].dataset.code || 'MH';
    const prefix = modal.querySelector('#inp-bulk-prefix').value.trim().toUpperCase() || 'T';
    const start = parseInt(modal.querySelector('#inp-bulk-start').value) || 1;
    const count = parseInt(modal.querySelector('#inp-bulk-count').value) || 1;
    const seats = parseInt(modal.querySelector('#inp-bulk-seats').value) || 4;

    const end = start + count - 1;
    const startStr = `${areaCode}-${prefix}-${start.toString().padStart(2, '0')}`;
    const endStr = `${areaCode}-${prefix}-${end.toString().padStart(2, '0')}`;

    modal.querySelector('#bulk-preview-text').textContent = `Will generate ${count} tables: ${startStr} through ${endStr} (${seats} seats each)`;
  };

  modal.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updatePreview));
  updatePreview();

  modal.querySelector('#btn-bulk-cancel').addEventListener('click', () => { modalMount.innerHTML = ''; });
  modal.querySelector('#btn-bulk-save').addEventListener('click', () => {
    const areaId = modal.querySelector('#inp-bulk-area').value;
    const prefix = modal.querySelector('#inp-bulk-prefix').value.trim().toUpperCase() || 'T';
    const start = parseInt(modal.querySelector('#inp-bulk-start').value) || 1;
    const count = parseInt(modal.querySelector('#inp-bulk-count').value) || 1;
    const seats = parseInt(modal.querySelector('#inp-bulk-seats').value) || 4;
    const shape = modal.querySelector('#inp-bulk-shape').value;

    if (!areaId) {
      alert('❌ Please select a parent Dining Area.');
      return;
    }

    const areaSel = modal.querySelector('#inp-bulk-area');
    const areaCode = areaSel.options[areaSel.selectedIndex].dataset.code || 'MH';

    let createdCount = 0;
    for (let i = 0; i < count; i++) {
      const numStr = (start + i).toString().padStart(2, '0');
      const tableCode = `${areaCode}-${prefix}-${numStr}`;

      tableRepository.create({
        areaId,
        tableCode,
        seats,
        shape,
        isMergeable: true
      }, session);
      createdCount++;
    }

    alert(`⚡ Successfully bulk generated ${createdCount} tables for area ${areaCode} via TableRepository!`);
    modalMount.innerHTML = '';
    this.renderConfigTables(this.appEl.querySelector('#main-mount'), session);
  });
}

openAddTableModal(session) {
  const modalMount = this.appEl.querySelector('#modal-container-mount');
  const modal = document.createElement('div');
  modal.className = 'lock-screen-overlay animate-fade-in';

  const tenantId = session.tenantId;
  const areas = offlineStore.getCollection('dining_areas', tenantId) || [];
  const activeAreas = areas.filter(a => a.status !== 'ARCHIVED');

  modal.innerHTML = `
        <div class="card" style="width:500px; background:var(--bg-surface-1); padding:24px;">
          <h3>+ Add Dining Table Asset</h3>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:16px;">Physical seating asset (TableRepository Managed).</p>
          <div class="flex-col gap-sm">
            <div>
              <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Parent Dining Area *</label>
              <select id="inp-tbl-area" style="width:100%;">
                ${activeAreas.length ? activeAreas.map(a => `<option value="${a.id}" data-code="${a.areaCode}">${a.areaName} (${a.areaCode})</option>`).join('') : `<option value="">No areas created yet</option>`}
              </select>
            </div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Table Code *</label>
                <input type="text" id="inp-tbl-code" value="T-01" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Seats Capacity *</label>
                <input type="number" id="inp-tbl-seats" value="4" style="width:100%;">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Table Shape</label>
                <select id="inp-tbl-shape" style="width:100%;">
                  <option value="SQUARE">SQUARE</option>
                  <option value="ROUND">ROUND</option>
                  <option value="RECTANGLE">RECTANGLE</option>
                  <option value="BAR_STOOL">BAR STOOL</option>
                </select>
              </div>
              <div style="display:flex; align-items:center; margin-top:16px;">
                <label><input type="checkbox" id="chk-tbl-merge" checked> Mergeable Asset</label>
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:16px;">
              <button class="btn-secondary" id="btn-tbl-cancel">Cancel</button>
              <button class="btn-primary" id="btn-tbl-save">Save Table Asset</button>
            </div>
          </div>
        </div>
      `;

  modalMount.innerHTML = '';
  modalMount.appendChild(modal);

  modal.querySelector('#btn-tbl-cancel').addEventListener('click', () => { modalMount.innerHTML = ''; });
  modal.querySelector('#btn-tbl-save').addEventListener('click', () => {
    const areaId = modal.querySelector('#inp-tbl-area').value;
    const rawCode = modal.querySelector('#inp-tbl-code').value.trim();
    const seats = parseInt(modal.querySelector('#inp-tbl-seats').value) || 4;
    const shape = modal.querySelector('#inp-tbl-shape').value;
    const isMergeable = modal.querySelector('#chk-tbl-merge').checked;

    if (!areaId || !rawCode) {
      alert('❌ Please select a parent Dining Area and enter a Table Code.');
      return;
    }

    const areaSel = modal.querySelector('#inp-tbl-area');
    const areaCode = areaSel.options[areaSel.selectedIndex].dataset.code || 'MH';
    const tableCode = rawCode.includes('-') ? rawCode : `${areaCode}-${rawCode}`;

    tableRepository.create({
      areaId,
      tableCode,
      seats,
      shape,
      isMergeable
    }, session);

    alert(`🎉 Table Asset "${tableCode}" (${seats} seats) saved via TableRepository!`);
    modalMount.innerHTML = '';
    this.renderConfigTables(this.appEl.querySelector('#main-mount'), session);
  });
}

// 👤 Card 4: Staff & Access Configuration View (PD-022 & PD-023)
renderConfigStaff(mount, session) {
  const tenantId = session.tenantId;
  const emps = staffRepository.getAll(tenantId);
  const activeStaff = emps.filter(e => e.status === 'ACTIVE');

  mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 style="font-size:1.75rem; margin:0;">⚙ Configuration → Card 4: Staff & Access</h2>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                PD-022 & PD-023 Specification • Role Templates & 6-Digit PIN Access (StaffRepository Managed).
              </p>
            </div>
            <button class="btn-primary" id="btn-add-staff-modal" style="padding:10px 18px; font-weight:600;">
              + Add Staff Account
            </button>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:16px;">
            <div>Total Active Staff Accounts: <strong>${activeStaff.length}</strong></div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h3>Staff Operational Accounts (${activeStaff.length})</h3>
            ${activeStaff.length ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-top:12px;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:10px;">Emp Code</th>
                    <th style="padding:10px;">Employee Name</th>
                    <th style="padding:10px;">Role Template</th>
                    <th style="padding:10px;">Assigned 6-Digit PIN</th>
                    <th style="padding:10px;">Default Workspace</th>
                    <th style="padding:10px;">Status</th>
                    <th style="padding:10px;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${activeStaff.map(e => {
    const role = ROLE_TEMPLATES[e.roleId] || { name: e.roleId || 'Staff', icon: '👤' };
    return `
                      <tr style="border-bottom:1px solid var(--border-subtle);">
                        <td style="padding:10px; font-weight:700;">${e.employeeCode}</td>
                        <td style="padding:10px; font-weight:600;">${e.name}</td>
                        <td style="padding:10px;"><span class="badge badge-info">${role.icon} ${role.name}</span></td>
                        <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--status-success);">${e.pinDisplay || '******'}</td>
                        <td style="padding:10px;">${e.workspaceDefault || 'admin'}</td>
                        <td style="padding:10px;"><span class="badge badge-success">${e.status}</span></td>
                        <td style="padding:10px;">
                          <button class="btn-secondary btn-archive-staff" data-id="${e.id}" style="font-size:0.75rem; color:var(--status-danger);">Suspend</button>
                        </td>
                      </tr>
                    `;
  }).join('')}
                </tbody>
              </table>
            ` : `
              <div style="text-align:center; padding:30px; color:var(--text-muted); background:var(--bg-surface-2); border-radius:6px; margin-top:12px;">
                👤 No staff accounts configured. Click <strong>+ Add Staff Account</strong> above to onboard waiters, chefs, bartenders, or cashiers!
              </div>
            `}
          </div>
        </div>
      `;

  mount.querySelector('#btn-add-staff-modal').addEventListener('click', () => this.openAddStaffModal(session));
  mount.querySelectorAll('.btn-archive-staff').forEach(btn => {
    btn.addEventListener('click', () => {
      const eid = btn.dataset.id;
      if (confirm('Suspend this staff member account?')) {
        offlineStore.updateItem('employees', 'id', eid, { status: 'SUSPENDED' });
        alert('Staff member suspended!');
        this.renderConfigStaff(mount, session);
      }
    });
  });
}

openAddStaffModal(session) {
  const modalMount = this.appEl.querySelector('#modal-container-mount');
  const modal = document.createElement('div');
  modal.className = 'lock-screen-overlay animate-fade-in';

  const emps = staffRepository.getAll(session.tenantId);
  const nextNum = emps.length + 1;
  const empCode = 'EMP-' + nextNum.toString().padStart(5, '0');
  const randomPin = Math.floor(100000 + Math.random() * 900000).toString();

  modal.innerHTML = `
        <div class="card" style="width:520px; background:var(--bg-surface-1); padding:24px;">
          <h3>+ Add Staff Account (3-Step Wizard)</h3>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:16px;">PD-022 & PD-023 Role Templates & PIN Security.</p>
          <div class="flex-col gap-sm">
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Employee Code</label>
                <input type="text" id="inp-emp-code" value="${empCode}" readonly style="width:100%; font-family:monospace; background:var(--bg-surface-2);">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Full Name *</label>
                <input type="text" id="inp-emp-name" placeholder="e.g. Ramesh Kumar" style="width:100%;">
              </div>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Operational Role Template *</label>
              <select id="inp-emp-role" style="width:100%;">
                <option value="role-inventory">📦 Inventory Manager (Full Stock & Procurement Control)</option>
                <option value="role-waiter">🍽️ Floor Waiter (Floor Map & Orders)</option>
                <option value="role-chef">👨‍🍳 Head Chef (Kitchen KDS Display)</option>
                <option value="role-bartender">🍺 Bartender (Bar BDS Display)</option>
                <option value="role-cashier">🧾 Billing Cashier (POS & Billing)</option>
                <option value="role-admin">⚙️ Restaurant Admin (Full Setup Control)</option>
              </select>
            </div>

            <div style="border:1px solid var(--border-subtle); padding:12px; border-radius:6px; background:var(--bg-surface-2);">
              <label style="display:block; font-size:0.75rem; margin-bottom:4px; font-weight:700;">6-Digit Security PIN Access *</label>
              <div style="display:flex; gap:8px;">
                <input type="text" id="inp-emp-pin" value="${randomPin}" maxlength="6" style="flex:1; font-family:monospace; font-size:1.1rem; font-weight:700; text-align:center;">
                <button class="btn-secondary" id="btn-gen-pin" style="font-size:0.8rem;">🎲 Generate Random PIN</button>
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:16px;">
              <button class="btn-secondary" id="btn-emp-cancel">Cancel</button>
              <button class="btn-primary" id="btn-emp-save">Create Staff Account</button>
            </div>
          </div>
        </div>
      `;

  modalMount.innerHTML = '';
  modalMount.appendChild(modal);

  modal.querySelector('#btn-gen-pin').addEventListener('click', () => {
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    modal.querySelector('#inp-emp-pin').value = newPin;
  });

  modal.querySelector('#btn-emp-cancel').addEventListener('click', () => { modalMount.innerHTML = ''; });
  modal.querySelector('#btn-emp-save').addEventListener('click', async () => {
    const name = modal.querySelector('#inp-emp-name').value.trim();
    const roleId = modal.querySelector('#inp-emp-role').value;
    const pin = modal.querySelector('#inp-emp-pin').value.trim();

    if (!name || !pin || pin.length !== 6) {
      alert('❌ Please enter a valid Full Name and 6-Digit PIN.');
      return;
    }

    const role = ROLE_TEMPLATES[roleId] || ROLE_TEMPLATES['role-waiter'];
    const identityId = 'id-' + Math.random().toString(36).substring(2, 7);
    const pinHash = await hashPin(pin);

    offlineStore.appendItem('identities', { id: identityId, pinHash, tenantId: session.tenantId, status: 'ACTIVE' });

    staffRepository.create({
      identityId,
      employeeCode: empCode,
      name,
      roleId,
      workspaceDefault: role.defaultWorkspace,
      pinDisplay: pin,
      status: 'ACTIVE'
    }, session);

    alert(`🎉 Staff Account "${name}" created with PIN "${pin}"!\nWorkspaces assigned: ${role.name}`);
    modalMount.innerHTML = '';
    this.renderConfigStaff(this.appEl.querySelector('#main-mount'), session);
  });
}

renderConfigDevices(mount) {
  mount.innerHTML = `<h2>⚙ Configuration → Devices & Printers</h2><p style="color:var(--text-muted);">Floor Tablets, KDS, BDS, Thermal Printers.</p>`;
}

renderConfigPayments(mount) {
  mount.innerHTML = `<h2>⚙ Configuration → Payment Configuration</h2><p style="color:var(--text-muted);">UPI VPA, Cash & Card Terminal Settings.</p>`;
}

renderCard1FullPage(mount, session) {
  const tenant = tenantRepository.getById(session.tenantId) || tenantModel.getPrimaryTenant();
  if (!tenant) {
    mount.innerHTML = `<h2>Card 1: Business Profile & Preferences</h2><p>No active tenant found.</p>`;
    return;
  }

  const activeTab = this.card1ActiveTab || 'identity';

  mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 style="font-size:1.75rem; margin:0;">Card 1 — Business Profile & Preferences</h2>
              <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">
                PD-017, PD-017A, PD-032 & PD-034 Specification • Tenant: <strong>${tenant.name}</strong> (${tenant.tenantId})
              </p>
            </div>
            <span class="badge badge-success" style="padding:6px 12px; font-size:0.85rem;">
              Profile Version ${tenant.profileVersion || 1}
            </span>
          </div>

          <!-- Section Navigation Tabs -->
          <div style="display:flex; gap:8px; overflow-x:auto; background:var(--bg-surface-1); padding:8px; border-radius:8px; border:1px solid var(--border-subtle);">
            <button class="btn-secondary card1-tab-btn ${activeTab === 'identity' ? 'active' : ''}" data-t="identity">🏢 Identity</button>
            <button class="btn-secondary card1-tab-btn ${activeTab === 'contact' ? 'active' : ''}" data-t="contact">📞 Contact</button>
            <button class="btn-secondary card1-tab-btn ${activeTab === 'address' ? 'active' : ''}" data-t="address">📍 Address</button>
            <button class="btn-secondary card1-tab-btn ${activeTab === 'compliance' ? 'active' : ''}" data-t="compliance">📜 Compliance</button>
            <button class="btn-secondary card1-tab-btn ${activeTab === 'regional' ? 'active' : ''}" data-t="regional">🌐 Regional</button>
            <button class="btn-secondary card1-tab-btn ${activeTab === 'branding' ? 'active' : ''}" data-t="branding">🎨 Branding</button>
            <button class="btn-secondary card1-tab-btn ${activeTab === 'preferences' ? 'active' : ''}" data-t="preferences">⚙ Preferences</button>
            <button class="btn-secondary card1-tab-btn ${activeTab === 'billing' ? 'active' : ''}" data-t="billing">💰 Billing</button>
            <button class="btn-secondary card1-tab-btn ${activeTab === 'receipts' ? 'active' : ''}" data-t="receipts">🧾 Receipts</button>
          </div>

          <!-- Section Content Card -->
          <div class="card" style="background:var(--bg-surface-1); padding:24px;">
            ${this.renderCard1SectionBody(activeTab, tenant, session)}
          </div>
        </div>
      `;

  mount.querySelectorAll('.card1-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      this.card1ActiveTab = btn.dataset.t;
      this.renderCard1FullPage(mount, session);
    });
  });

  this.bindCard1FormEvents(mount, activeTab, tenant, session);
}

renderCard1SectionBody(tabKey, tenant, session) {
  if (tabKey === 'identity') {
    const idData = tenant.identity || {};
    return `
          <h3>🏢 Business Identity</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Core legal and operational identity of the restaurant.</p>
          <div class="flex-col gap-md" style="max-width:600px;">
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Restaurant Display Name *</label>
              <input type="text" id="inp-c1-name" value="${tenant.name || ''}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Legal Registered Entity Name</label>
              <input type="text" id="inp-c1-legal" value="${tenant.legalName || ''}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Short Tagline / Description</label>
              <input type="text" id="inp-c1-desc" value="${idData.shortDesc || ''}" style="width:100%;">
            </div>
            <button class="btn-primary" id="btn-save-c1-identity" style="align-self:flex-start; margin-top:8px;">
              💾 Save Identity Section
            </button>
          </div>
        `;
  }

  if (tabKey === 'contact') {
    const c = tenant.contact || {};
    return `
          <h3>📞 Contact Information</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Customer and vendor communication channels.</p>
          <div class="grid grid-cols-2 gap-md" style="max-width:700px;">
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Primary Phone Number</label>
              <input type="text" id="inp-c1-phone" value="${c.primaryPhone || ''}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Secondary / Landline</label>
              <input type="text" id="inp-c1-phone2" value="${c.secondaryPhone || ''}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Primary Email</label>
              <input type="email" id="inp-c1-email" value="${c.email || ''}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">WhatsApp Number</label>
              <input type="text" id="inp-c1-wa" value="${c.whatsapp || ''}" style="width:100%;">
            </div>
            <div style="grid-column: span 2;">
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Website URL</label>
              <input type="text" id="inp-c1-web" value="${c.website || ''}" style="width:100%;">
            </div>
            <div style="grid-column: span 2;">
              <button class="btn-primary" id="btn-save-c1-contact" style="margin-top:8px;">
                💾 Save Contact Information
              </button>
            </div>
          </div>
        `;
  }

  if (tabKey === 'address') {
    const a = tenant.address || {};
    return `
          <h3>📍 Structured Address</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Physical location details used for invoices & delivery.</p>
          <div class="flex-col gap-sm" style="max-width:650px;">
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Address Line 1 *</label>
              <input type="text" id="inp-c1-addr1" value="${a.line1 || ''}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Address Line 2</label>
              <input type="text" id="inp-c1-addr2" value="${a.line2 || ''}" style="width:100%;">
            </div>
            <div class="grid grid-cols-3 gap-sm">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px;">City</label>
                <input type="text" id="inp-c1-city" value="${a.city || ''}" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px;">State</label>
                <input type="text" id="inp-c1-state" value="${a.state || ''}" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px;">PIN / Postal Code</label>
                <input type="text" id="inp-c1-pin" value="${a.pinCode || ''}" style="width:100%;">
              </div>
            </div>
            <button class="btn-primary" id="btn-save-c1-address" style="align-self:flex-start; margin-top:8px;">
              💾 Save Structured Address
            </button>
          </div>
        `;
  }

  if (tabKey === 'compliance') {
    const comp = tenant.compliance || {};
    return `
          <h3>📜 Compliance & Licences</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Legal tax numbers and statutory food safety licences.</p>
          <div class="grid grid-cols-2 gap-md" style="max-width:700px;">
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">GSTIN (15 Digits)</label>
              <input type="text" id="inp-c1-gstin" value="${comp.gstin || ''}" style="width:100%; font-family:monospace;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">FSSAI Licence Number (14 Digits)</label>
              <input type="text" id="inp-c1-fssai" value="${comp.fssai || ''}" style="width:100%; font-family:monospace;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">PAN Number</label>
              <input type="text" id="inp-c1-pan" value="${comp.pan || ''}" style="width:100%; font-family:monospace;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Liquor Licence Number</label>
              <input type="text" id="inp-c1-liquor" value="${comp.liquorLicence || ''}" style="width:100%;">
            </div>
            <div style="grid-column: span 2;">
              <button class="btn-primary" id="btn-save-c1-compliance" style="margin-top:8px;">
                💾 Save Compliance Details
              </button>
            </div>
          </div>
        `;
  }

  if (tabKey === 'regional') {
    const r = tenant.regional || {};
    return `
          <h3>🌐 Regional Settings</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Currency, timezone, and date formatting options.</p>
          <div class="grid grid-cols-2 gap-md" style="max-width:600px;">
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Base Currency</label>
              <select id="inp-c1-curr" style="width:100%;">
                <option value="INR" ${r.currency === 'INR' ? 'selected' : ''}>INR (₹ - Indian Rupee)</option>
                <option value="USD" ${r.currency === 'USD' ? 'selected' : ''}>USD ($ - US Dollar)</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Timezone</label>
              <select id="inp-c1-tz" style="width:100%;">
                <option value="Asia/Kolkata" ${r.timezone === 'Asia/Kolkata' ? 'selected' : ''}>Asia/Kolkata (IST)</option>
                <option value="America/New_York" ${r.timezone === 'America/New_York' ? 'selected' : ''}>America/New_York (EST)</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Date Format</label>
              <select id="inp-c1-datefmt" style="width:100%;">
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Time Format</label>
              <select id="inp-c1-timefmt" style="width:100%;">
                <option value="12 Hour">12 Hour (AM/PM)</option>
                <option value="24 Hour">24 Hour (Military)</option>
              </select>
            </div>
            <div style="grid-column: span 2;">
              <button class="btn-primary" id="btn-save-c1-regional" style="margin-top:8px;">
                💾 Save Regional Settings
              </button>
            </div>
          </div>
        `;
  }

  if (tabKey === 'branding') {
    const b = tenant.branding || {};
    return `
          <h3>🎨 Branding & Colors</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Logos and UI theme tokens.</p>
          <div class="flex-col gap-sm" style="max-width:600px;">
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Logo Image URL</label>
              <input type="text" id="inp-c1-logo" value="${b.logo || ''}" placeholder="https://..." style="width:100%;">
            </div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Primary Brand Color</label>
                <input type="color" id="inp-c1-pcolor" value="${b.primaryColor || '#10b981'}" style="width:100%; height:38px;">
              </div>
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Accent Color</label>
                <input type="color" id="inp-c1-acolor" value="${b.accentColor || '#3b82f6'}" style="width:100%; height:38px;">
              </div>
            </div>
            <button class="btn-primary" id="btn-save-c1-branding" style="align-self:flex-start; margin-top:8px;">
              💾 Save Branding Tokens
            </button>
          </div>
        `;
  }

  if (tabKey === 'preferences') {
    const pref = tenant.businessPreferences || {};
    return `
          <h3>⚙ Business Preferences</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Service modes and dining features.</p>
          <div class="flex-col gap-sm" style="max-width:500px;">
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Restaurant Type</label>
              <select id="inp-c1-type" style="width:100%;">
                <option value="Casual Dining">Casual Dining</option>
                <option value="Fine Dining">Fine Dining</option>
                <option value="Fast Food / QSR">Fast Food / QSR</option>
                <option value="Cafe / Bakery">Cafe / Bakery</option>
              </select>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
              <label><input type="checkbox" id="chk-c1-veg" ${pref.isVeg ? 'checked' : ''}> Pure Vegetarian Restaurant</label>
              <label><input type="checkbox" id="chk-c1-alcohol" ${pref.isAlcoholServed ? 'checked' : ''}> Alcohol Served (Bar Operations Active)</label>
              <label><input type="checkbox" id="chk-c1-pet" ${pref.isPetFriendly ? 'checked' : ''}> Pet Friendly Seating</label>
            </div>
            <button class="btn-primary" id="btn-save-c1-pref" style="align-self:flex-start; margin-top:12px;">
              💾 Save Business Preferences
            </button>
          </div>
        `;
  }

  if (tabKey === 'billing') {
    const bill = tenant.billingDefaults || {};
    return `
          <h3>💰 Billing Defaults</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Tax profiles, service charge %, and rounding configuration.</p>
          <div class="grid grid-cols-2 gap-md" style="max-width:600px;">
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Default Tax Profile</label>
              <select id="inp-c1-taxprof" style="width:100%;">
                <option value="5% GST">5% GST (Restaurant Standard)</option>
                <option value="12% GST">12% GST</option>
                <option value="18% GST">18% GST</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Service Charge %</label>
              <input type="number" id="inp-c1-svc" value="${bill.serviceChargePercent || 5}" style="width:100%;">
            </div>
            <div style="grid-column: span 2;">
              <button class="btn-primary" id="btn-save-c1-billing" style="margin-top:8px;">
                💾 Save Billing Defaults
              </button>
            </div>
          </div>
        `;
  }

  if (tabKey === 'receipts') {
    const rec = tenant.receiptDefaults || {};
    return `
          <h3>🧾 Receipt Defaults</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Thermal print receipt headers, footers, and template toggles.</p>
          <div class="flex-col gap-sm" style="max-width:600px;">
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Receipt Header Title</label>
              <input type="text" id="inp-c1-rheader" value="${rec.header || ''}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Thank You Message / Footer</label>
              <input type="text" id="inp-c1-rfooter" value="${rec.thankYouMessage || ''}" style="width:100%;">
            </div>
            <button class="btn-primary" id="btn-save-c1-receipts" style="align-self:flex-start; margin-top:8px;">
              💾 Save Receipt Defaults
            </button>
          </div>
        `;
  }

  return `<div>Select a tab above to edit section details.</div>`;
}

bindCard1FormEvents(mount, activeTab, tenant, session) {
  const tenantId = session.tenantId;

  const saveIdentity = mount.querySelector('#btn-save-c1-identity');
  if (saveIdentity) {
    saveIdentity.addEventListener('click', () => {
      const name = mount.querySelector('#inp-c1-name').value.trim();
      const legalName = mount.querySelector('#inp-c1-legal').value.trim();
      const shortDesc = mount.querySelector('#inp-c1-desc').value.trim();

      if (!name) { alert('❌ Restaurant name cannot be empty.'); return; }
      tenantModel.updateSection(tenantId, 'identity', { shortDesc });
      tenantModel.updateSection(tenantId, 'name', name);
      tenantModel.updateSection(tenantId, 'legalName', legalName);
      alert('✔ Business Identity saved via TenantRepository!');
      this.renderCard1FullPage(mount, session);
    });
  }

  const saveContact = mount.querySelector('#btn-save-c1-contact');
  if (saveContact) {
    saveContact.addEventListener('click', () => {
      const primaryPhone = mount.querySelector('#inp-c1-phone').value.trim();
      const secondaryPhone = mount.querySelector('#inp-c1-phone2').value.trim();
      const email = mount.querySelector('#inp-c1-email').value.trim();
      const whatsapp = mount.querySelector('#inp-c1-wa').value.trim();
      const website = mount.querySelector('#inp-c1-web').value.trim();

      tenantModel.updateSection(tenantId, 'contact', { primaryPhone, secondaryPhone, email, whatsapp, website });
      alert('✔ Contact Information saved via TenantRepository!');
      this.renderCard1FullPage(mount, session);
    });
  }

  const saveAddress = mount.querySelector('#btn-save-c1-address');
  if (saveAddress) {
    saveAddress.addEventListener('click', () => {
      const line1 = mount.querySelector('#inp-c1-addr1').value.trim();
      const line2 = mount.querySelector('#inp-c1-addr2').value.trim();
      const city = mount.querySelector('#inp-c1-city').value.trim();
      const state = mount.querySelector('#inp-c1-state').value.trim();
      const pinCode = mount.querySelector('#inp-c1-pin').value.trim();

      tenantModel.updateSection(tenantId, 'address', { line1, line2, city, state, pinCode });
      alert('✔ Structured Address saved via TenantRepository!');
      this.renderCard1FullPage(mount, session);
    });
  }

  const saveCompliance = mount.querySelector('#btn-save-c1-compliance');
  if (saveCompliance) {
    saveCompliance.addEventListener('click', () => {
      const gstin = mount.querySelector('#inp-c1-gstin').value.trim();
      const fssai = mount.querySelector('#inp-c1-fssai').value.trim();
      const pan = mount.querySelector('#inp-c1-pan').value.trim();
      const liquorLicence = mount.querySelector('#inp-c1-liquor').value.trim();

      tenantModel.updateSection(tenantId, 'compliance', { gstin, fssai, pan, liquorLicence });
      alert('✔ Compliance details saved via TenantRepository!');
      this.renderCard1FullPage(mount, session);
    });
  }

  const saveRegional = mount.querySelector('#btn-save-c1-regional');
  if (saveRegional) {
    saveRegional.addEventListener('click', () => {
      const currency = mount.querySelector('#inp-c1-curr').value;
      const timezone = mount.querySelector('#inp-c1-tz').value;
      const dateFormat = mount.querySelector('#inp-c1-datefmt').value;
      const timeFormat = mount.querySelector('#inp-c1-timefmt').value;

      tenantModel.updateSection(tenantId, 'regional', { currency, currencySymbol: currency === 'INR' ? '₹' : '$', timezone, dateFormat, timeFormat });
      alert('✔ Regional Settings saved via TenantRepository!');
      this.renderCard1FullPage(mount, session);
    });
  }

  const saveBranding = mount.querySelector('#btn-save-c1-branding');
  if (saveBranding) {
    saveBranding.addEventListener('click', () => {
      const logo = mount.querySelector('#inp-c1-logo').value.trim();
      const primaryColor = mount.querySelector('#inp-c1-pcolor').value;
      const accentColor = mount.querySelector('#inp-c1-acolor').value;

      tenantModel.updateSection(tenantId, 'branding', { logo, primaryColor, accentColor });
      alert('✔ Branding tokens saved via TenantRepository!');
      this.renderCard1FullPage(mount, session);
    });
  }

  const savePref = mount.querySelector('#btn-save-c1-pref');
  if (savePref) {
    savePref.addEventListener('click', () => {
      const restaurantType = mount.querySelector('#inp-c1-type').value;
      const isVeg = mount.querySelector('#chk-c1-veg').checked;
      const isAlcoholServed = mount.querySelector('#chk-c1-alcohol').checked;
      const isPetFriendly = mount.querySelector('#chk-c1-pet').checked;

      tenantModel.updateSection(tenantId, 'businessPreferences', { restaurantType, isVeg, isAlcoholServed, isPetFriendly });
      alert('✔ Business Preferences saved via TenantRepository!');
      this.renderCard1FullPage(mount, session);
    });
  }

  const saveBilling = mount.querySelector('#btn-save-c1-billing');
  if (saveBilling) {
    saveBilling.addEventListener('click', () => {
      const defaultTaxProfile = mount.querySelector('#inp-c1-taxprof').value;
      const serviceChargePercent = parseFloat(mount.querySelector('#inp-c1-svc').value) || 0;

      tenantModel.updateSection(tenantId, 'billingDefaults', { defaultTaxProfile, serviceChargePercent });
      alert('✔ Billing Defaults saved via TenantRepository!');
      this.renderCard1FullPage(mount, session);
    });
  }

  const saveReceipts = mount.querySelector('#btn-save-c1-receipts');
  if (saveReceipts) {
    saveReceipts.addEventListener('click', () => {
      const header = mount.querySelector('#inp-c1-rheader').value.trim();
      const thankYouMessage = mount.querySelector('#inp-c1-rfooter').value.trim();

      tenantModel.updateSection(tenantId, 'receiptDefaults', { header, thankYouMessage });
      alert('✔ Receipt Defaults saved via TenantRepository!');
      this.renderCard1FullPage(mount, session);
    });
  }
}

renderWaiterWorkspace(mount, session) {
  const tenantId = session.tenantId;
  const tables = tableRepository.getAll(tenantId) || [];
  const sampleTables = tables.length > 0 ? tables : [
    { id: 't-1', tableCode: 'T-01', tableName: 'Table 01', capacity: 4, status: 'OCCUPIED', areaId: 'da-1', activeOrder: { id: 'ord-101', itemsCount: 3, totalAmount: 850 } },
    { id: 't-2', tableCode: 'T-02', tableName: 'Table 02', capacity: 2, status: 'AVAILABLE', areaId: 'da-1' },
    { id: 't-3', tableCode: 'T-03', tableName: 'Table 03', capacity: 6, status: 'RESERVED', areaId: 'da-1' },
    { id: 't-4', tableCode: 'T-04', tableName: 'Table 04', capacity: 4, status: 'OCCUPIED', areaId: 'da-1', activeOrder: { id: 'ord-102', itemsCount: 5, totalAmount: 1420 } },
    { id: 't-5', tableCode: 'T-05', tableName: 'Table 05', capacity: 2, status: 'AVAILABLE', areaId: 'da-2' },
    { id: 't-6', tableCode: 'T-06', tableName: 'Table 06', capacity: 8, status: 'OCCUPIED', areaId: 'da-2', activeOrder: { id: 'ord-103', itemsCount: 4, totalAmount: 1980 } }
  ];

  const occupiedCount = sampleTables.filter(t => t.status === 'OCCUPIED').length;
  const availCount = sampleTables.filter(t => t.status === 'AVAILABLE').length;

  mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h2 style="font-size:1.75rem; margin:0;">🍽️ Floor Waiter Command Center</h2>
              <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">
                Floor Plan Situational Awareness & Active Table Orders
              </p>
            </div>
            <div style="display:flex; gap:10px;">
              <button class="btn-primary" id="btn-waiter-new-kot" style="font-weight:600;">➕ Create New Order / KOT</button>
            </div>
          </div>

          <div class="grid grid-cols-4 gap-md">
            <div class="card" style="background:var(--bg-surface-1); text-align:center;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL TABLES</div>
              <div style="font-size:1.8rem; font-weight:700; color:var(--accent-primary); margin-top:4px;">${sampleTables.length}</div>
            </div>
            <div class="card" style="background:var(--bg-surface-1); text-align:center;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">AVAILABLE</div>
              <div style="font-size:1.8rem; font-weight:700; color:var(--status-success); margin-top:4px;">${availCount}</div>
            </div>
            <div class="card" style="background:var(--bg-surface-1); text-align:center;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">OCCUPIED SEATED</div>
              <div style="font-size:1.8rem; font-weight:700; color:var(--status-warning); margin-top:4px;">${occupiedCount}</div>
            </div>
            <div class="card" style="background:var(--bg-surface-1); text-align:center;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">LIVE KOT TICKETS</div>
              <div style="font-size:1.8rem; font-weight:700; color:var(--accent-primary); margin-top:4px;">${occupiedCount}</div>
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <h3 style="font-size:1.1rem; margin:0;">Dining Floor Map</h3>
              <div style="font-size:0.8rem; color:var(--text-muted);">
                <span style="color:var(--status-success);">● Available</span> &nbsp;
                <span style="color:var(--status-warning);">● Occupied</span> &nbsp;
                <span style="color:var(--status-info);">● Reserved</span>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-md">
              ${sampleTables.map(t => {
    const statusBg = t.status === 'AVAILABLE' ? 'rgba(16,185,129,0.1)' : (t.status === 'OCCUPIED' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)');
    const statusBorder = t.status === 'AVAILABLE' ? 'var(--status-success)' : (t.status === 'OCCUPIED' ? 'var(--status-warning)' : 'var(--accent-primary)');
    return `
                  <div class="card" style="background:${statusBg}; border-left:4px solid ${statusBorder}; padding:14px; position:relative;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <strong style="font-size:1.1rem;">${t.tableCode || t.tableName}</strong>
                      <span class="badge ${t.status === 'AVAILABLE' ? 'badge-success' : (t.status === 'OCCUPIED' ? 'badge-warning' : 'badge-info')}" style="font-size:0.75rem;">${t.status}</span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">Capacity: ${t.capacity || 4} Guests</div>
                    ${t.activeOrder ? `
                      <div style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border-subtle); font-size:0.82rem;">
                        <div>Order #${t.activeOrder.id} • ${t.activeOrder.itemsCount} items</div>
                        <div style="font-weight:700; color:var(--status-success); margin-top:2px;">₹${t.activeOrder.totalAmount}</div>
                      </div>
                    ` : ''}
                    <div style="display:flex; gap:6px; margin-top:10px;">
                      <button class="btn-secondary btn-table-action" data-code="${t.tableCode || t.tableName}" style="font-size:0.78rem; padding:4px 8px; flex:1;">
                        ${t.status === 'AVAILABLE' ? '🪑 Seat Guests' : '📝 Take Order'}
                      </button>
                    </div>
                  </div>
                `;
  }).join('')}
            </div>
          </div>
        </div>
      `;

  mount.querySelector('#btn-waiter-new-kot').addEventListener('click', () => {
    alert('📝 New KOT Order Ticket Drawer opened. Select items from menu catalog.');
  });
  mount.querySelectorAll('.btn-table-action').forEach(btn => {
    btn.addEventListener('click', () => {
      alert(`📝 Taking order for ${btn.dataset.code}...`);
    });
  });
}

renderKitchenWorkspace(mount, session) {
  const tickets = [
    { id: 'KOT-101', table: 'T-01', time: '5 mins ago', status: 'NEW', items: [{ name: 'Paneer Butter Masala', qty: 2, note: 'Less spicy' }, { name: 'Butter Naan', qty: 4, note: 'Extra butter' }] },
    { id: 'KOT-102', table: 'T-04', time: '12 mins ago', status: 'PREPARING', items: [{ name: 'Chicken Biryani (Handi)', qty: 1, note: 'Double Raita' }, { name: 'Garlic Naan', qty: 2, note: '' }] },
    { id: 'KOT-103', table: 'T-06', time: '20 mins ago', status: 'READY', items: [{ name: 'Dal Makhani', qty: 1, note: '' }, { name: 'Jeera Rice', qty: 2, note: '' }] }
  ];

  mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 style="font-size:1.75rem; margin:0;">👨‍🍳 Kitchen Display System (KDS)</h2>
              <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">
                Live Food Ticket Queue & Preparation Control Tower
              </p>
            </div>
            <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px;">🔥 Live Orders: ${tickets.length}</span>
          </div>

          <div class="grid grid-cols-3 gap-md">
            ${tickets.map(t => {
    const borderCol = t.status === 'NEW' ? 'var(--status-danger)' : (t.status === 'PREPARING' ? 'var(--status-warning)' : 'var(--status-success)');
    const badgeCls = t.status === 'NEW' ? 'badge-warning' : (t.status === 'PREPARING' ? 'badge-info' : 'badge-success');
    return `
                <div class="card" style="background:var(--bg-surface-1); border-top:4px solid ${borderCol}; display:flex; flex-direction:column; justify-content:space-between;">
                  <div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <strong style="font-size:1.1rem;">${t.id}</strong>
                      <span class="badge ${badgeCls}">${t.status}</span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">Table: <strong>${t.table}</strong> • ${t.time}</div>

                    <div style="margin-top:12px; background:var(--bg-surface-2); padding:10px; border-radius:6px;">
                      ${t.items.map(i => `
                        <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:4px;">
                          <span><strong>${i.qty}x</strong> ${i.name}</span>
                        </div>
                        ${i.note ? `<div style="font-size:0.75rem; color:var(--status-warning); font-style:italic; margin-bottom:4px;">Note: ${i.note}</div>` : ''}
                      `).join('')}
                    </div>
                  </div>

                  <div style="margin-top:14px;">
                    ${t.status === 'NEW' ? `
                      <button class="btn-primary btn-kot-state" data-id="${t.id}" data-state="PREPARING" style="width:100%;">🔥 Start Preparation</button>
                    ` : (t.status === 'PREPARING' ? `
                      <button class="btn-primary btn-kot-state" data-id="${t.id}" data-state="READY" style="width:100%; background:var(--status-success); border-color:var(--status-success);">✅ Mark Ticket Ready</button>
                    ` : `
                      <button class="btn-secondary" disabled style="width:100%; opacity:0.6;">✔ Ticket Ready & Dispatched</button>
                    `)}
                  </div>
                </div>
              `;
  }).join('')}
          </div>
        </div>
      `;

  mount.querySelectorAll('.btn-kot-state').forEach(b => {
    b.addEventListener('click', () => {
      alert(`✔ KOT ${b.dataset.id} status updated to ${b.dataset.state}!`);
    });
  });
}

renderBarWorkspace(mount, session) {
  const tickets = [
    { id: 'BOT-201', table: 'T-06', time: '3 mins ago', status: 'QUEUED', items: [{ name: 'Mojito (Classic)', qty: 2, note: 'Extra mint' }, { name: 'Kingfisher Premium 650ml', qty: 2, note: 'Chilled' }] },
    { id: 'BOT-202', table: 'T-01', time: '8 mins ago', status: 'MIXING', items: [{ name: 'Old Fashioned', qty: 1, note: 'Single malt' }] }
  ];

  mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 style="font-size:1.75rem; margin:0;">🍺 Bar Display System (BDS)</h2>
              <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">
                Live Drink Ticket Queue & Cocktail Dispense Control
              </p>
            </div>
            <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px;">🍹 Active Drink Tickets: ${tickets.length}</span>
          </div>

          <div class="grid grid-cols-2 gap-md">
            ${tickets.map(t => `
              <div class="card" style="background:var(--bg-surface-1); border-left:4px solid var(--accent-primary);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <strong style="font-size:1.1rem;">${t.id}</strong>
                  <span class="badge badge-warning">${t.status}</span>
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">Table: <strong>${t.table}</strong> • ${t.time}</div>

                <div style="margin-top:12px; background:var(--bg-surface-2); padding:10px; border-radius:6px;">
                  ${t.items.map(i => `
                    <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:4px;">
                      <span><strong>${i.qty}x</strong> ${i.name}</span>
                    </div>
                    ${i.note ? `<div style="font-size:0.75rem; color:var(--accent-primary); font-style:italic; margin-bottom:4px;">Note: ${i.note}</div>` : ''}
                  `).join('')}
                </div>

                <button class="btn-primary btn-bot-done" data-id="${t.id}" style="width:100%; margin-top:14px;">
                  🍹 Mark Drink Ticket Ready
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `;

  mount.querySelectorAll('.btn-bot-done').forEach(b => {
    b.addEventListener('click', () => {
      alert(`🍸 Bar Ticket ${b.dataset.id} marked READY for server pick-up!`);
    });
  });
}

renderCashierWorkspace(mount, session) {
  const openBills = [
    { table: 'T-01', waiter: 'Rahul Sharma', subtotal: 850, gst: 42.50, serviceCharge: 42.50, total: 935 },
    { table: 'T-04', waiter: 'Amit Patel', subtotal: 1420, gst: 71.00, serviceCharge: 71.00, total: 1562 },
    { table: 'T-06', waiter: 'Rahul Sharma', subtotal: 1980, gst: 99.00, serviceCharge: 99.00, total: 2178 }
  ];

  mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 style="font-size:1.75rem; margin:0;">🧾 Billing Cashier Counter</h2>
              <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">
                Guest Settlement, GST Tax Invoices, & Split Payments
              </p>
            </div>
            <span class="badge badge-success" style="font-size:0.85rem; padding:6px 12px;">💰 Register Open</span>
          </div>

          <div class="grid-2col-responsive">
            <div>
              <h3>Tables Awaiting Settlement (${openBills.length})</h3>
              <div class="flex-col gap-sm" style="margin-top:12px;">
                ${openBills.map(b => `
                  <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1);">
                    <div>
                      <strong style="font-size:1.1rem;">Table ${b.table}</strong>
                      <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">Waiter: ${b.waiter}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:1.1rem; font-weight:700; color:var(--status-success);">₹${b.total}</div>
                      <button class="btn-primary btn-settle-table" data-table="${b.table}" data-total="${b.total}" style="font-size:0.8rem; padding:4px 10px; margin-top:4px;">
                        💳 Settle Bill
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="card" style="background:var(--bg-surface-1);">
              <h3>Payment & Checkout Modal</h3>
              <p style="font-size:0.85rem; color:var(--text-muted);">Select payment method to complete settlement and issue official GST Tax Invoice.</p>

              <div style="margin-top:14px; display:flex; flex-direction:column; gap:10px;">
                <div>
                  <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Payment Method</label>
                  <select id="sel-pay-method" style="width:100%;">
                    <option value="CASH">💵 Cash</option>
                    <option value="CARD">💳 Credit / Debit Card</option>
                    <option value="UPI">📱 UPI / Dynamic QR</option>
                    <option value="SPLIT">💳 Split Payment</option>
                  </select>
                </div>
                <button class="btn-primary" id="btn-cashier-print" style="padding:12px; font-weight:700; margin-top:6px;">
                  🖨 Issue GST Tax Invoice & Clear Table
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

  mount.querySelectorAll('.btn-settle-table').forEach(b => {
    b.addEventListener('click', () => {
      alert(`🧾 Ready to settle Table ${b.dataset.table} for ₹${b.dataset.total}. Choose payment mode.`);
    });
  });
  mount.querySelector('#btn-cashier-print').addEventListener('click', () => {
    alert('✔ GST Tax Invoice Printed & Table status reset to AVAILABLE!');
  });
}
  }

function startApp() {
  try {
    const app = new ApplicationShell();
    app.init();
  } catch (e) {
    console.error('App initialization error:', e);
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  startApp();
} else {
  document.addEventListener('DOMContentLoaded', startApp);
}
}) ();
