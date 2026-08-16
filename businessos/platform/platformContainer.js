import { AuditLogger } from './audit/auditLogger.js';
import { SupabaseClient } from './cloud/supabaseClient.js';
import { PRODUCT_FAMILIES_REGISTRY } from './inventory/productFamiliesRegistry.js';
import { getDeviceId, attachStandardMetadata } from './metadata/entityMetadata.js';
import { OfflineJournal } from './sync/offlineJournal.js';
import { UOM_REGISTRY } from './uom/uomRegistry.js';
import { UomConversionEngine } from './uom/uomConversionEngine.js';

import { DataGateway } from './data/dataGateway.js';
import { SupabaseRealtime } from './realtime/supabaseRealtime.js';

import { CategoryRepository } from './repositories/categoryRepository.js';
import { GoodsReceiptRepository } from './repositories/goodsReceiptRepository.js';
import { InventoryRepository } from './repositories/inventoryRepository.js';
import { PurchaseOrderRepository } from './repositories/purchaseOrderRepository.js';
import { StaffRepository } from './repositories/staffRepository.js';
import { StockAdjustmentRepository } from './repositories/stockAdjustmentRepository.js';
import { StockCountRepository } from './repositories/stockCountRepository.js';
import { StockIssueRepository } from './repositories/stockIssueRepository.js';
import { StockTransferRepository } from './repositories/stockTransferRepository.js';
import { StorageLocationRepository } from './repositories/storageLocationRepository.js';
import { SupplierRepository } from './repositories/supplierRepository.js';
import { TableRepository } from './repositories/tableRepository.js';
import { TenantRepository } from './repositories/tenantRepository.js';
import { UomRepository } from './repositories/uomRepository.js';

/**
 * PlatformContainer composition root.
 *
 * Exposes platform services (this.services), cloud transport adapters (this.cloud),
 * real-time data gateway (this.dataGateway), and domain repositories (this.repositories)
 * with explicit dependency contracts without relying on global state.
 */
export class PlatformContainer {
  constructor(config = {}) {
    const storeInstance = config.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const deviceId = config.getDeviceId || getDeviceId;

    const journalInstance = config.offlineJournal ||
      (storeInstance ? new OfflineJournal(storeInstance, deviceId) :
      (typeof offlineJournal !== 'undefined' ? offlineJournal : null));

    const auditLoggerInstance = config.auditLogger ||
      (storeInstance ? new AuditLogger(storeInstance) : null);

    const entityMetadata = config.entityMetadata || {
      getDeviceId: deviceId,
      attachStandardMetadata: config.attachStandardMetadata || attachStandardMetadata
    };

    const productFamilies = config.productFamilies || PRODUCT_FAMILIES_REGISTRY;
    const uomRegistry = config.uomRegistry || UOM_REGISTRY;
    const uomEngine = config.uomEngine || new UomConversionEngine(uomRegistry);

    this.services = {
      offlineStore: storeInstance,
      getDeviceId: deviceId,
      offlineJournal: journalInstance,
      auditLogger: auditLoggerInstance,
      entityMetadata,
      productFamilies,
      uomRegistry,
      uomEngine
    };

    this.cloud = {
      supabase: config.supabaseClient || new SupabaseClient(config.supabase || {})
    };

    this.realtime = config.realtime || new SupabaseRealtime(config.realtimeConfig || {});

    this.dataGateway = config.dataGateway || new DataGateway({
      cloudAdapter: config.cloudAdapter,
      localAdapter: config.localAdapter,
      offlineStore: this.services.offlineStore,
      offlineJournal: this.services.offlineJournal,
      realtime: this.realtime,
      supabaseClient: this.cloud.supabase,
      isOnline: config.isOnline !== undefined ? config.isOnline : true
    });

    if (config.autoInitRepositories !== false) {
      this.initRepositories(config.repositories);
    }
  }

  initRepositories(customRepos = {}) {
    const commonDeps = {
      dataGateway: this.dataGateway,
      offlineStore: this.services.offlineStore,
      offlineJournal: this.services.offlineJournal,
      auditLogger: this.services.auditLogger,
      entityMetadata: this.services.entityMetadata
    };

    const category = customRepos.category || new CategoryRepository({
      ...commonDeps,
      productFamiliesRegistry: this.services.productFamilies
    });

    const supplier = customRepos.supplier || new SupplierRepository(commonDeps);
    const storageLocation = customRepos.storageLocation || new StorageLocationRepository(commonDeps);

    const uom = customRepos.uom || new UomRepository({
      dataGateway: this.dataGateway,
      offlineStore: this.services.offlineStore,
      offlineJournal: this.services.offlineJournal,
      uomRegistry: this.services.uomRegistry
    });

    const inventory = customRepos.inventory || new InventoryRepository({
      ...commonDeps,
      categoryRepository: category,
      productFamiliesRegistry: this.services.productFamilies
    });

    const purchaseOrder = customRepos.purchaseOrder || new PurchaseOrderRepository(commonDeps);

    const goodsReceipt = customRepos.goodsReceipt || new GoodsReceiptRepository({
      ...commonDeps,
      inventoryRepository: inventory,
      purchaseOrderRepository: purchaseOrder
    });

    const stockTransfer = customRepos.stockTransfer || new StockTransferRepository({
      ...commonDeps,
      inventoryRepository: inventory
    });

    const stockIssue = customRepos.stockIssue || new StockIssueRepository({
      ...commonDeps,
      inventoryRepository: inventory
    });

    const stockAdjustment = customRepos.stockAdjustment || new StockAdjustmentRepository({
      ...commonDeps,
      inventoryRepository: inventory
    });

    const stockCount = customRepos.stockCount || new StockCountRepository({
      dataGateway: this.dataGateway,
      offlineStore: this.services.offlineStore,
      auditLogger: this.services.auditLogger,
      entityMetadata: this.services.entityMetadata,
      stockAdjustmentRepository: stockAdjustment
    });

    const table = customRepos.table || new TableRepository(commonDeps);
    const staff = customRepos.staff || new StaffRepository(commonDeps);

    const tenant = customRepos.tenant || new TenantRepository({
      dataGateway: this.dataGateway,
      offlineStore: this.services.offlineStore,
      offlineJournal: this.services.offlineJournal,
      auditLogger: this.services.auditLogger
    });

    this.repositories = {
      category,
      supplier,
      storageLocation,
      uom,
      inventory,
      purchaseOrder,
      goodsReceipt,
      stockTransfer,
      stockIssue,
      stockAdjustment,
      stockCount,
      table,
      staff,
      tenant
    };

    return this.repositories;
  }
}

/**
 * Factory helper to construct a configured PlatformContainer composition root.
 */
export function createPlatformContainer(config = {}) {
  return new PlatformContainer(config);
}
