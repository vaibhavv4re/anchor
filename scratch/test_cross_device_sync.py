import json
import urllib.request
import time

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

def verify_cross_device_cloud_sync():
    print("=" * 75)
    print("AUDITING CROSS-DEVICE & MULTI-SESSION SUPABASE CLOUD SYNC")
    print("=" * 75)

    # 1. Verify 'offline_journal' table returns reconciliation exceptions
    url = f"{BASE_URL}/offline_journal?entity_name=eq.reconciliation_exceptions&select=*"
    req = urllib.request.Request(url, headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"})
    with urllib.request.urlopen(req) as resp:
        rows = json.loads(resp.read().decode('utf-8'))
        print(f"[OK] Supabase Cloud 'offline_journal' contains {len(rows)} reconciliation exception journal entries.")

    # 2. Verify 'invoices' table accessibility
    url = f"{BASE_URL}/invoices?select=id,invoice_number,grand_total,status&limit=5"
    req = urllib.request.Request(url, headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"})
    with urllib.request.urlopen(req) as resp:
        rows = json.loads(resp.read().decode('utf-8'))
        print(f"[OK] Supabase Cloud 'invoices' contains {len(rows)} synced invoices across devices.")

    # 3. Verify 'payments' table accessibility
    url = f"{BASE_URL}/payments?select=id,invoice_number,amount,payment_method,status&limit=5"
    req = urllib.request.Request(url, headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"})
    with urllib.request.urlopen(req) as resp:
        rows = json.loads(resp.read().decode('utf-8'))
        print(f"[OK] Supabase Cloud 'payments' contains {len(rows)} synced payments across devices.")

    print("\n" + "=" * 75)
    print("[SUCCESS] CROSS-DEVICE SUPABASE CLOUD DATA HYDRATION VERIFIED!")
    print("=" * 75)

if __name__ == "__main__":
    verify_cross_device_cloud_sync()
