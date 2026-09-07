import urllib.request
import json

headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

# Test 1: What supabaseClient was doing with order_number=eq.ord_4rf1ih9
url_bad = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1/orders?order_number=eq.ord_4rf1ih9'
req_bad = urllib.request.Request(url_bad, data=json.dumps({'status': 'TEST'}).encode(), headers=headers, method='PATCH')
with urllib.request.urlopen(req_bad) as resp:
    res = json.loads(resp.read().decode())
    print('PATCH with order_number=eq.ord_4rf1ih9 matched rows:', len(res))

# Test 2: What happens with id=eq.ord_4rf1ih9
url_good = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1/orders?id=eq.ord_4rf1ih9'
req_good = urllib.request.Request(url_good, data=json.dumps({'status': 'CONFIRMED'}).encode(), headers=headers, method='PATCH')
with urllib.request.urlopen(req_good) as resp:
    res = json.loads(resp.read().decode())
    print('PATCH with id=eq.ord_4rf1ih9 matched rows:', len(res))
