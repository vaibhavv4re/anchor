# 8. Integrations

Defines external software, hardware, and service integrations for RestaurantOS.

---

## Hardware & Local Integrations (Phase 1)

### 1. ESC/POS Thermal Printers
* **Purpose:** Order ticket printing (KOT/BOT) and guest bill receipt printing.
* **Protocol:** Local Network (LAN TCP/IP) or USB.
* **Automations:** Instant print job fired upon `OrderCreated` and `BillGenerated`.

---

## Payment & Communication Integrations (Phase 1)

### 2. Razorpay Payment Gateway
* **Purpose:** Dynamic UPI QR Code generation on bills and real-time payment webhook processing.
* **Events:** Webhook triggers `PaymentReceived`, auto-closing table sessions.

### 3. WhatsApp Business API & SMS Gateway
* **Purpose:** Customer e-receipt delivery, digital feedback requests, and supplier Purchase Order dispatch.

### 4. Tally Accounting Export
* **Purpose:** Financial ledger export for day-end sales, tax breakdowns, and inventory valuation.

---

## Future Integrations (Phase 2+)

* **Aggregators:** Swiggy, Zomato (Order synchronization & menu management).
* **Payment Hardware:** PineLabs / Paytm POS Terminals (Direct card terminal push).
* **Accounting Software:** Zoho Books (Automated cloud accounting sync).
