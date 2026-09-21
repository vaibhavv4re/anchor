import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

with open('scratch/forensic_matrix_output.json', encoding='utf-8') as f:
    rows = json.load(f)

print('Total Variant Rows:', len(rows))
modes = {}
statuses = {}
issues = []
for r in rows:
    modes[r['mode']] = modes.get(r['mode'], 0) + 1
    statuses[r['status']] = statuses.get(r['status'], 0) + 1
    if r['notes'] != 'Clean':
        issues.append((r['menu_code'], r['menu_name'], r['variant'], r['notes']))

print('\nBy Consumption Mode:')
for m, c in modes.items():
    print(f"  {m}: {c} rows")

print('\nBy Status:')
for s, c in statuses.items():
    print(f"  {s}: {c} rows")

print(f'\nTotal Variant Rows with Forensic Observations: {len(issues)}')
for item in issues[:20]:
    print(f"  {item[0]} {item[1]} [{item[2]}]: {item[3]}")
