# 5. State Machines

State machines govern the lifecycles of all core entities in RestaurantOS. Transitions are strictly enforced.

---

## 1. Table State Machine

```text
               ┌──────────────┐
               │  AVAILABLE   │
               └──────┬───────┘
                      │ Guest Seated / Reserved
                      ▼
               ┌──────────────┐
               │   OCCUPIED   │
               └──────┬───────┘
                      │ Order Placed
                      ▼
               ┌──────────────┐
               │   ORDERING   │
               └──────┬───────┘
                      │ Food Delivered
                      ▼
               ┌──────────────┐
               │    DINING    │
               └──────┬───────┘
                      │ Bill Generated
                      ▼
               ┌──────────────┐
               │   BILLING    │
               └──────┬───────┘
                      │ Payment Confirmed
                      ▼
               ┌──────────────┐
               │     PAID     │
               └──────┬───────┘
                      │ Guests Depart
                      ▼
               ┌──────────────┐
               │   CLEANING   │
               └──────┬───────┘
                      │ Table Reset
                      ▼
               ┌──────────────┐
               │  AVAILABLE   │
               └──────────────┘
```

---

## 2. Order Item State Machine (KDS / BDS)

```text
               ┌──────────────┐
               │    QUEUED    │ (Order Created)
               └──────┬───────┘
                      │ Station Staff Starts Prep
                      ▼
               ┌──────────────┐
               │  PREPARING   │
               └──────┬───────┘
                      │ Item Ready (Auto Deducts Stock)
                      ▼
               ┌──────────────┐
               │    READY     │ (Triggers Waiter Notification)
               └──────┬───────┘
                      │ Served to Guest
                      ▼
               ┌──────────────┐
               │    SERVED    │
               └──────────────┘
```

*Derived KOT / BOT Status:*
* If all items `QUEUED` ⇒ KOT = `Queued`
* If any item `PREPARING` ⇒ KOT = `In Progress`
* If some items `READY`, others not ⇒ KOT = `Partially Ready`
* If all items `READY` ⇒ KOT = `Ready`
* If all items `SERVED` ⇒ KOT = `Completed`

---

## 3. Bill State Machine

```text
               ┌──────────────┐
               │    DRAFT     │
               └──────┬───────┘
                      │ Waiter Triggers Bill Generation
                      ▼
               ┌──────────────┐
               │  GENERATED   │ (Prints ESC/POS + Dynamic QR)
               └──────┬───────┘
                      │ Awaiting Payment
                      ▼
               ┌──────────────┐
               │   PENDING    │
               └──────┬───────┘
                      │ Payment Confirmed (Webhook / Cashier)
                      ▼
               ┌──────────────┐
               │     PAID     │ (Auto Closes Table Session)
               └──────┬───────┘
                      │ Settlement Finalized
                      ▼
               ┌──────────────┐
               │    CLOSED    │
               └──────────────┘
```

---

## 4. Purchase Order State Machine

```text
               ┌──────────────┐
               │    DRAFT     │
               └──────┬───────┘
                      │ Manager Approves PO
                      ▼
               ┌──────────────┐
               │   SUBMITTED  │
               └──────┬───────┘
                      │ Supplier Confirms
                      ▼
               ┌──────────────┐
               │  DISPATCHED  │
               └──────┬───────┘
                      │ Goods Received at Store
                      ▼
               ┌──────────────┐
               │   RECEIVED   │ (Auto Adjusts Inventory Stock)
               └──────────────┘
```
