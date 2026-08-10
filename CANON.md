# The RestaurantOS Canon

> **Guiding Philosophy**  
> **RestaurantOS should feel invisible. Employees should focus on serving customers, not operating software.**

> **Core Engineering Philosophy**  
> **Every feature should remove work from the restaurant, not add work to the staff.**

> **Constitutional Engineering Rule**  
> **No feature is allowed to be implemented until its complete lifecycle is documented.**

---

## Overview

While the **Master Blueprint** defines **what** we are building, the **RestaurantOS Canon** defines **how the restaurant actually operates** and provides the deterministic specification for AI agent execution.

The Canon consists of **10 core documents**:

1. **[Master Blueprint](file:///d:/Projects/Anchor/docs/canon/01_master_blueprint.md)** ✅ – Vision, principles, core platform, business engines, definition of done.
2. **[Business Capabilities](file:///d:/Projects/Anchor/docs/canon/02_business_capabilities.md)** – Single-purpose, zero-overlap domain ownership specs.
3. **[Operational Flows](file:///d:/Projects/Anchor/docs/canon/03_operational_flows.md)** – End-to-end real-world operational restaurant manuals.
4. **[Domain Model](file:///d:/Projects/Anchor/docs/canon/04_domain_model.md)** – Complete entity-relationship specifications for database mapping.
5. **[State Machines](file:///d:/Projects/Anchor/docs/canon/05_state_machines.md)** – Explicit lifecycle state transition definitions for all core entities.
6. **[Event Catalogue](file:///d:/Projects/Anchor/docs/canon/06_event_catalogue.md)** – Complete publish/subscribe business event registry with side effects.
7. **[Workspace Specifications](file:///d:/Projects/Anchor/docs/canon/07_workspace_specifications.md)** – Role-focused UI/UX workspace requirements.
8. **[Integrations](file:///d:/Projects/Anchor/docs/canon/08_integrations.md)** – External services (Razorpay, ESC/POS, WhatsApp, Tally, etc.).
9. **[BusinessOS Design System](file:///d:/Projects/Anchor/docs/canon/09_design_system.md)** – Platform design tokens, components, patterns, and motion.
10. **[Implementation Roadmap](file:///d:/Projects/Anchor/docs/canon/10_implementation_roadmap.md)** – Execution roadmap broken into Phase 0 Domain Lockdown + 8 implementation phases.

---

## Phase 0 – Domain Lockdown ✅

Before writing implementation code, the core business domain is locked in [docs/phase_0/](file:///d:/Projects/Anchor/docs/phase_0/):
1. **[Ubiquitous Language](file:///d:/Projects/Anchor/docs/phase_0/01_ubiquitous_language.md)**
2. **[Entity Ownership Matrix](file:///d:/Projects/Anchor/docs/phase_0/02_entity_ownership_matrix.md)**
3. **[Event Responsibility Matrix](file:///d:/Projects/Anchor/docs/phase_0/03_event_responsibility_matrix.md)**
4. **[Automation Matrix ⭐](file:///d:/Projects/Anchor/docs/phase_0/04_automation_matrix.md)**
5. **[Permission Matrix](file:///d:/Projects/Anchor/docs/phase_0/05_permission_matrix.md)**

*Product decisions are recorded in [PRODUCT_DECISION_LOG.md](file:///d:/Projects/Anchor/PRODUCT_DECISION_LOG.md).*

---

## Standardized 18-Point Capability Artifact Workflow

Capabilities are built **one at a time** using a standardized implementation specification format:

```text
1. Capability Name
2. Purpose
3. User Story
4. Business Rules
5. Domain Objects
6. State Machine
7. Commands
8. Queries
9. Events
10. Automations
11. API Endpoints
12. Database Tables
13. Frontend Screens
14. Offline Behaviour
15. Notifications
16. Permissions
17. Acceptance Tests
18. Future Extensions
```

---

## Execution Pipeline

```text
Canon → Phase 0 Domain Lockdown → Capability Artifact → AI Implementation → Verification → Merge
```

---

## Execution Roadmap Order

* **Phase 0: Domain Lockdown ✅** (Ubiquitous Language, Ownership, Event Responsibilities, Automations, Permissions)
* **Phase 1: Identity & Foundation** (Auth, PIN, Clock In/Out, Configuration, BusinessOS Design System)
* **Phase 2: Restaurant Setup** (Areas, Tables, Printers, Taxes, Gateways)
* **Phase 3: Front of House** (Floor Map, Seating, Sessions, Order Builder, KOT, BOT)
* **Phase 4: Production Engine** (Recipe Manager, Menu Builder, KDS, BDS, Auto Stock Deduction, Availability)
* **Phase 5: Payments & Billing** (Billing Engine, Dynamic QR, Cashier, Webhooks, Receipts)
* **Phase 6: Inventory & Purchasing** (Master Inventory, Supplier Catalogue, POs, Receiving, Stock Count)
* **Phase 7: Operations & Management** (Manager Center, Live Floor, Approvals, Timeline, Notifications)
* **Phase 8: Owner BI & Analytics** (Revenue, Food/Labour Costs, Margins, Reports, Tally Export)
