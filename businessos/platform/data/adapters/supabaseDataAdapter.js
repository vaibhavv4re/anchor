import { formatRecordForTable } from '../../cloud/supabaseClient.js';

/**
 * SupabaseDataAdapter handles cloud REST requests via SupabaseClient.
 * Normalizes PostgreSQL snake_case columns (tenant_id, identity_id, pin_hash, role_id)
 * to JavaScript camelCase while preserving original row attributes.
 * Excludes virtual in-memory/local collections ('roles', 'sessions') from Cloud REST calls.
 */
export class SupabaseDataAdapter {
  constructor(supabaseClient) {
    this.client = supabaseClient;
  }

  async getCollection(collection, tenantId = null) {
    // 'roles' and 'sessions' are in-memory/local state catalogs, not physical PostgreSQL tables
    if (!this.client || collection === 'roles' || collection === 'sessions') return [];
    
    const res = await this.client.fetchTableData(collection);
    if (!res.success || !Array.isArray(res.data)) return [];
    
    let list = res.data.map(row => {
      let item = (row && row.data) ? { ...row.data, ...row } : { ...row };
      if (item.tenant_id && !item.tenantId) item.tenantId = item.tenant_id;
      if (item.identity_id && !item.identityId) item.identityId = item.identity_id;
      if (item.pin_hash && !item.pinHash) item.pinHash = item.pin_hash;
      if (item.role_id && !item.roleId) item.roleId = item.role_id;
      if (item.workspace_default && !item.workspaceDefault) item.workspaceDefault = item.workspace_default;
      if (item.employee_code && !item.employeeCode) item.employeeCode = item.employee_code;
      return item;
    });

    if (tenantId) {
      list = list.filter(item => !item.tenantId || item.tenantId === tenantId);
    }
    return list;
  }

  async getById(collection, id, tenantId = null) {
    const list = await this.getCollection(collection, tenantId);
    return list.find(item => item.id === id || item.uuid === id || item.code === id || item.itemCode === id) || null;
  }

  async create(collection, data, session = null) {
    if (!this.client || collection === 'roles' || collection === 'sessions') return data;
    const formatted = formatRecordForTable(collection, {
      payload: data,
      tenantId: session ? session.tenantId : (data.tenantId || data.tenant_id || '')
    });

    const res = await this.client.upsertRecord(collection, formatted);
    if (res.success && res.data) {
      const returned = Array.isArray(res.data) ? res.data[0] : res.data;
      return returned && returned.data ? { ...returned.data, ...returned } : data;
    }
    return data;
  }

  async update(collection, id, patch, session = null) {
    if (!this.client || collection === 'roles' || collection === 'sessions') return null;
    const existing = await this.getById(collection, id, session ? session.tenantId : null);
    if (!existing) return null;

    const merged = { ...existing, ...patch };
    return this.create(collection, merged, session);
  }

  async delete(collection, id, session = null) {
    if (!this.client || collection === 'roles' || collection === 'sessions') return false;
    const tenantId = session ? session.tenantId : '';
    const filter = tenantId ? `id=eq.${id}&tenant_id=eq.${tenantId}` : `id=eq.${id}`;
    const res = await this.client.deleteRecords(collection, filter);
    return !!res.success;
  }
}
