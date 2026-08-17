import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';

async function inspectEmployees() {
  const client = new SupabaseClient();
  const adapter = new SupabaseDataAdapter(client);

  const emps = await adapter.getCollection('employees');
  console.log('--- EMPLOYEES TABLE ROWS IN SUPABASE ---');
  emps.forEach(e => {
    console.log(`ID: ${e.id} | Name: ${e.name} | PIN: ${e.pin || e.admin_pin} | RoleID: ${e.roleId || e.role_id} | Workspace: ${e.workspaceDefault || e.workspace_default}`);
  });

  const ids = await adapter.getCollection('identities');
  console.log('\n--- IDENTITIES TABLE ROWS IN SUPABASE ---');
  ids.forEach(i => {
    console.log(`ID: ${i.id} | Name: ${i.displayName || i.display_name} | PIN: ${i.pin || i.pin_hash} | RoleID: ${i.roleId || i.role_id}`);
  });
}

inspectEmployees().catch(console.error);
