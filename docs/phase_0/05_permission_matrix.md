# Phase 0.5: Permission Matrix

Role-Based Access Control (RBAC) matrix governing capabilities across workspaces.

---

## Role Capabilities Matrix

| Capability / Action | Waiter | Chef | Bartender | Cashier | Inv. Mgr | Manager | Admin | Super Admin | Owner |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Seat Guest / Start Session** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | 👁️ |
| **Take / Modify Order** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | 👁️ |
| **Mark Food Item Ready** | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | 👁️ |
| **Mark Drink Item Ready** | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | 👁️ |
| **Manage Recipes & Specs** | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | 👁️ |
| **Generate Bill** | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | 👁️ |
| **Receive Payment / Close Bill** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | 👁️ |
| **Apply Special Discount / Void** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | 👁️ |
| **Manage Stock & Receiving** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| **Create Purchase Order** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| **Approve Purchase Order** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | 👁️ |
| **Onboard Users / Issue PINs** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | 👁️ |
| **View Profit / Margins BI** | ❌ | ❌ | ❌ | ❌ | ❌ | 👁️ | ❌ | ❌ | ✅ |

*Legend: ✅ = Allowed (Full access), ❌ = Forbidden, 👁️ = Read-only access*
