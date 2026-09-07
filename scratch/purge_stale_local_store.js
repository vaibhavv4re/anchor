/**
 * Utility: Purge stale offlineStore collections
 * Resets local cache arrays so DataGateway fetches fresh cloud data from Supabase.
 */

import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

console.log('🧹 Purging stale local cache collections in offlineStore...');

offlineStore.setCollection('purchase_orders', []);
offlineStore.setCollection('goods_receipt_notes', []);
offlineStore.setCollection('goods_received_notes', []);
offlineStore.setCollection('supplier_invoices', []);
offlineStore.setCollection('supplier_payments', []);
offlineStore.setCollection('stock_balances', []);

console.log('✅ Stale local cache collections purged. DataGateway will now read live Supabase tables.');
