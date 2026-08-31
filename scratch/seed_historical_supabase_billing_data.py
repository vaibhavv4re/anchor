import json
import urllib.request
import random
from datetime import datetime, timedelta

BASE_URL = "https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw"

TENANT_ID = "tenant_h0qc7wf"

WAITERS = ["Rahul Sharma", "Priya Patel", "Vikram Singh", "Ananya Sen"]
CASHIERS = ["Priya Cashier", "Amit Varma"]
PAYMENT_METHODS = ["UPI", "CASH", "CARD"]

DISHES = [
    {"name": "Butter Chicken", "price": 450.00},
    {"name": "Garlic Naan", "price": 80.00},
    {"name": "Paneer Tikka", "price": 320.00},
    {"name": "Dal Makhani", "price": 290.00},
    {"name": "Jeera Rice", "price": 180.00},
    {"name": "Mango Lassi", "price": 140.00},
    {"name": "Gulab Jamun", "price": 120.00}
]

def insert_record(table_name, record):
    url = f"{BASE_URL}/{table_name}"
    req = urllib.request.Request(
        url,
        data=json.dumps(record).encode('utf-8'),
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data[0]
    except Exception as e:
        print(f"Error inserting into {table_name}: {e}")
        return None

def seed_historical_data():
    print("Seeding Historical Billing & Financial Data (Aug 24 - Aug 30, 2026) to Supabase Cloud...")
    
    start_date = datetime(2026, 8, 24, 12, 0, 0)
    inv_seq = 1001

    for day_offset in range(7):
        current_day = start_date + timedelta(days=day_offset)
        
        sessions_today = random.randint(2, 3)
        for s_idx in range(sessions_today):
            hour = random.choice([13, 14, 20, 21])
            minute = random.randint(5, 55)
            txn_time = current_day.replace(hour=hour, minute=minute).isoformat() + "Z"
            
            table_num = random.randint(1, 8)
            sessionId = f"sess_hist_{day_offset}_{s_idx}_{random.randint(100, 999)}"
            inv_number = f"INV/26-27/{inv_seq}"
            inv_seq += 1

            chosen_items = random.sample(DISHES, k=random.randint(2, 4))
            subtotal = 0.0
            items_payload = []
            for item in chosen_items:
                qty = random.randint(1, 2)
                line_total = item["price"] * qty
                subtotal += line_total
                items_payload.append({
                    "itemId": f"item_{item['name'].lower().replace(' ', '_')}",
                    "name": item["name"],
                    "quantity": qty,
                    "price": item["price"],
                    "lineTotal": line_total
                })

            cgst = round(subtotal * 0.025, 2)
            sgst = round(subtotal * 0.025, 2)
            service_charge = round(subtotal * 0.05, 2)
            grand_total = round(subtotal + cgst + sgst + service_charge, 2)
            
            waiter = random.choice(WAITERS)
            cashier = random.choice(CASHIERS)
            pay_method = random.choice(PAYMENT_METHODS)
            ref_no = f"UPI-REF-{random.randint(100000, 999999)}" if pay_method == "UPI" else (f"CARD-AUTH-{random.randint(1000, 9999)}" if pay_method == "CARD" else "CASH-REC")

            # 1. Insert bill_revision
            rev_payload = {
                "id": f"rev_{sessionId}",
                "tenant_id": TENANT_ID,
                "session_id": sessionId,
                "bill_number": f"BILL-2026-{inv_seq}",
                "revision_number": 1,
                "grand_total": grand_total,
                "revision_status": "ACCEPTED",
                "data": {
                    "id": f"rev_{sessionId}",
                    "sessionId": sessionId,
                    "tableNumber": table_num,
                    "tableCode": f"T-0{table_num}",
                    "billNumber": f"BILL-2026-{inv_seq}",
                    "revisionNumber": 1,
                    "subtotal": subtotal,
                    "cgstAmount": cgst,
                    "sgstAmount": sgst,
                    "serviceChargeAmount": service_charge,
                    "grandTotal": grand_total,
                    "items": items_payload,
                    "waiterName": waiter,
                    "revisionStatus": "ACCEPTED",
                    "invoiceStatus": "ISSUED",
                    "paymentStatus": "PAID",
                    "invoiceNumber": inv_number,
                    "createdAt": txn_time,
                    "updatedAt": txn_time
                }
            }
            insert_record("bill_revisions", rev_payload)

            # 2. Insert invoice
            inv_payload = {
                "id": f"inv_{sessionId}",
                "tenant_id": TENANT_ID,
                "session_id": sessionId,
                "invoice_number": inv_number,
                "bill_number": f"BILL-2026-{inv_seq}",
                "grand_total": grand_total,
                "status": "ISSUED",
                "data": {
                    "id": f"inv_{sessionId}",
                    "tenantId": TENANT_ID,
                    "financialYear": "2026-27",
                    "invoiceSeries": "POS",
                    "invoiceSequence": inv_seq - 1,
                    "invoiceNumber": inv_number,
                    "sessionId": sessionId,
                    "tableNumber": table_num,
                    "grossSales": subtotal,
                    "subtotal": subtotal,
                    "discountsTotal": 0,
                    "taxableAmount": subtotal,
                    "cgstAmount": cgst,
                    "sgstAmount": sgst,
                    "serviceChargeAmount": service_charge,
                    "grandTotal": grand_total,
                    "cashierId": "emp-cashier",
                    "cashierName": cashier,
                    "issuedAt": txn_time,
                    "createdAt": txn_time
                }
            }
            insert_record("invoices", inv_payload)

            # 3. Insert payment
            pay_payload = {
                "id": f"pay_{sessionId}",
                "tenant_id": TENANT_ID,
                "session_id": sessionId,
                "bill_number": f"BILL-2026-{inv_seq}",
                "invoice_number": inv_number,
                "amount": grand_total,
                "payment_method": pay_method,
                "status": "COMPLETED",
                "data": {
                    "id": f"pay_{sessionId}",
                    "paymentId": f"pay_{sessionId}",
                    "tenantId": TENANT_ID,
                    "sessionId": sessionId,
                    "invoiceNumber": inv_number,
                    "tableNumber": table_num,
                    "amount": grand_total,
                    "paymentMethod": pay_method,
                    "referenceNo": ref_no,
                    "receivedBy": "emp-cashier",
                    "receivedByName": cashier,
                    "receivedAt": txn_time,
                    "status": "SETTLED"
                }
            }
            insert_record("payments", pay_payload)
            print(f"  [OK] Seeded {txn_time[:10]} | Invoice {inv_number} | {grand_total} via {pay_method}")

    print("\nHISTORICAL BILLING DATA SEEDED SUCCESSFULLY INTO SUPABASE CLOUD!")

if __name__ == "__main__":
    seed_historical_data()
