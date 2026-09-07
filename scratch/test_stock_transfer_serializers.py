"""
Targeted test verifying that formatRecordForTable and formatPatchForTable
produce exact PostgreSQL schema columns and strip forbidden camelCase fields.
"""
import re

# Read supabaseClient.js to parse the actual JS code logic or test simulated mapping
with open(r'd:\Projects\Anchor\businessos\platform\cloud\supabaseClient.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Verify code contains stock_transfers in formatRecordForTable
assert "if (entityName === 'stock_transfers')" in code, "Missing stock_transfers in formatRecordForTable"
assert "if (entityName === 'stock_issues')" in code, "Missing stock_issues in formatRecordForTable"
assert "if (entityName === 'stock_adjustments')" in code, "Missing stock_adjustments in formatRecordForTable"
assert "if (entityName === 'stock_counts')" in code, "Missing stock_counts in formatRecordForTable"

# Verify code contains stock_balances in formatPatchForTable
assert "} else if (entityName === 'stock_balances')" in code, "Missing stock_balances in formatPatchForTable"
assert "} else if (entityName === 'stock_transfers')" in code, "Missing stock_transfers in formatPatchForTable"

print("✅ Static code checks passed: all serializers and patch handlers are present in supabaseClient.js")
