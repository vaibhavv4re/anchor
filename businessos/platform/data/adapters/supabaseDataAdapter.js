import { formatRecordForTable } from '../../cloud/supabaseClient.js';

/**
 * SupabaseDataAdapter handles cloud REST requests via SupabaseClient.
 */
export class SupabaseDataAdapter {
  constructor(supabaseClient) {
    this.client = supabaseClient;
  }

  async getCollection(collection, tenantId = null) {
    if (!this.client) return [];
    const res = await this.client.fetchTableData(collection);
    if (!res.success || !Array.isArray(res.data)) return [];
    
    let list = res.data.map(row => (row && row.data ? row.data : row));
    if (tenantId) {
      list = list.filter(item => !item.tenantId || item.tenantId === tenantId);
    }
    return list;
  }

  async getById(collection, id, tenantId = null) {
    const list = await this.getCollection(collection, tenantId);
    return list.find(item => item.id === id || item.uuid === id || item.code === id) || null;
  }

  async create(collection, data, session = null) {
    if (!this.client) return data;
    const formatted = formatRecordForTable(collection, {
      payload: data,
      tenantId: session ? session.tenantId : (data.tenantId || '')
    });

    const res = await this.client.upsertRecord(collection, formatted);
    if (res.success && res.data) {
      const returned = Array.isArray(res.data) ? res.data[0] : res.data;
      return returned && returned.data ? returned.data : data;
    }
    return data;
  }

  async update(collection, id, patch, session = null) {
    if (!this.client) return null;
    const existing = await this.getById(collection, id, session ? session.tenantId : null);
    if (!existing) return null;

    const merged = { ...existing, ...patch };
    return this.create(collection, merged, session);
  }

  async delete(collection, id, session = null) {
    if (!this.client) return false;
    const tenantId = session ? session.tenantId : '';
    const filter = tenantId ? `id=eq.${id}&tenant_id=eq.${tenantId}` : `id=eq.${id}`;
    const res = await this.client.deleteRecords(collection, filter);
    return !!res.success;
  }
}
