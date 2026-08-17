import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';

async function testCat() {
  const adapter = new SupabaseDataAdapter();
  const res = await adapter.getCollection('inventory_categories');
  console.log('Categories from Supabase adapter:', res);
}

testCat();
