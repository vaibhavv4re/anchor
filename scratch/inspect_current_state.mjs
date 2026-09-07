const SUPABASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1";
const HEADERS = {
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
  'Content-Type': 'application/json'
};

async function get(path) {
  const resp = await fetch(`${SUPABASE_URL}/${path}`, { headers: HEADERS });
  return await resp.json();
}

async function main() {
  console.log("=== STOCK BALANCES FOR RM0310 ===");
  const balances = await get("stock_balances?item_code=eq.RM0310");
  if (Array.isArray(balances)) {
    for (const b of balances) {
      const d = b.data || {};
      const inner_d = d.data || {};
      console.log(`ID: ${b.id} | Loc: ${b.location_code} | SQL Qty: ${b.quantity} | data.qty: ${d.quantity} | inner_data.qty: ${inner_d.quantity}`);
    }
  } else {
    console.log("Balances response:", balances);
  }

  console.log("\n=== STOCK OPERATIONS ===");
  const ops = await get("stock_operations?order=occurred_at.desc&limit=5");
  if (Array.isArray(ops)) {
    console.log(`Count: ${ops.length}`);
    for (const op of ops) {
      console.log(`Op: ${op.operation_id} | Type: ${op.operation_type} | Ref: ${op.reference_number} | At: ${op.occurred_at}`);
    }
  } else {
    console.log("Ops response:", ops);
  }

  console.log("\n=== STOCK TRANSACTIONS ===");
  const txns = await get("stock_transactions?order=occurred_at.desc&limit=5");
  if (Array.isArray(txns)) {
    console.log(`Count: ${txns.length}`);
    for (const tx of txns) {
      console.log(`Tx: ${tx.transaction_id} | Item: ${tx.item_code} | Loc: ${tx.location_code} | Qty: ${tx.quantity} | At: ${tx.occurred_at}`);
    }
  } else {
    console.log("Txns response:", txns);
  }

  console.log("\n=== RECENT ORDERS ===");
  const orders = await get("orders?order=created_at.desc&limit=3");
  if (Array.isArray(orders)) {
    for (const o of orders) {
      console.log(`Order: ${o.order_number} | ID: ${o.id} | Status: ${o.status} | Table: ${o.table_code} | Sess: ${o.session_id}`);
    }
  } else {
    console.log("Orders response:", orders);
  }
}

main().catch(console.error);
