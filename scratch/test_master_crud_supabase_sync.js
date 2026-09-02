/**
 * Test Suite: Master Inventory CRUD Supabase Sync Verification
 * Verifies that Create, Edit, and Deactivate actions on Master Inventory items
 * execute synchronous REST calls to Supabase Cloud Storage.
 */

import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { inventoryItemModel } from '../businessos/platform/inventory/inventoryItemModel.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function runMasterCrudSupabaseSyncTest() {
  console.log('----------------------------------------------------');
  console.log('☁ MASTER INVENTORY CRUD SUPABASE SYNC TEST');
  console.log('----------------------------------------------------\n');

  const tenantId = 'tenant-crud-cloud-sync';
  const restCalls = [];

  // Mock Supabase REST client
  const mockSupabaseClient = {
    async createRecord(tableName, record) {
      restCalls.push({ action: 'CREATE', tableName, record });
      return { success: true, data: record };
    },
    async updateRecord(tableName, id, patch) {
      restCalls.push({ action: 'UPDATE', tableName, id, patch });
      return { success: true, data: patch };
    },
    async fetchTableData(tableName) {
      return { success: true, data: [] };
    }
  };

  const cloudAdapter = new SupabaseDataAdapter(mockSupabaseClient);
  const dataGateway = new DataGateway({ cloudAdapter, isOnline: true });

  if (typeof window === 'undefined') {
    global.window = { __APP__: { platform: { dataGateway } } };
  } else {
    window.__APP__ = { platform: { dataGateway } };
  }

  // Seed item in offlineStore for lookup
  offlineStore.setCollection('inventory', [
    {
      id: 'inv-rm0999',
      tenantId,
      itemCode: 'RM0999',
      itemName: 'Baseline Cloud Item',
      itemType: 'Raw Material',
      categoryCode: 'CAT-VEG',
      baseUom: 'KG',
      reorderLevel: 10,
      active: true,
      changeHistory: []
    }
  ]);

  console.log('1. Testing Master Item Creation Sync to Supabase...');
  const newItem = {
    id: 'inv-rm0998',
    tenantId,
    itemCode: 'RM0998',
    itemName: 'New Manual Cloud Item',
    itemType: 'Raw Material',
    categoryCode: 'CAT-MEAT',
    baseUom: 'KG',
    reorderLevel: 15,
    status: 'ACTIVE'
  };

  await dataGateway.create('inventory', newItem);
  const createCall = restCalls.find(r => r.tableName === 'inventory' && (r.record.itemCode === 'RM0998' || r.record.item_code === 'RM0998'));
  console.log(`  Supabase REST Create Call: ${createCall ? 'SUCCESS' : 'FAILED'}`);
  if (!createCall) throw new Error('New Item creation failed to sync to Supabase!');
  console.log('✓ Master Item Creation Supabase Sync verified!');

  console.log('\n2. Testing Master Item Attribute Edit Sync to Supabase...');
  await inventoryItemModel.updateItem('RM0999', { itemName: 'Updated Organic Baseline Item', reorderLevel: 25 }, 'Inventory Manager', tenantId);
  const updateCall = restCalls.find(r => r.action === 'UPDATE' || r.action === 'CREATE');
  console.log(`  Supabase REST Update/Upsert Calls Recorded: ${restCalls.length}`);
  if (restCalls.length < 2) throw new Error('Item edit failed to post update to Supabase!');
  console.log('✓ Master Item Attribute Edit Supabase Sync verified!');

  console.log('\n3. Testing Master Item Deactivation Sync to Supabase...');
  await inventoryItemModel.updateItem('RM0999', { active: false }, 'Inventory Manager', tenantId);
  const deactCall = restCalls.find(r => (r.patch && r.patch.active === false) || (r.record && r.record.active === false));
  console.log(`  Supabase REST Deactivation Call: ${deactCall ? 'SUCCESS' : 'FAILED'}`);
  if (!deactCall) throw new Error('Item deactivation failed to sync to Supabase!');
  console.log('✓ Master Item Deactivation Supabase Sync verified!');

  console.log('\n----------------------------------------------------');
  console.log('✅ MASTER INVENTORY CRUD SUPABASE SYNC PASSED (100%)');
  console.log('----------------------------------------------------');
}

runMasterCrudSupabaseSyncTest();
