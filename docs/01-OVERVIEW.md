# 01 — Overview

> Read this first. It defines *what* we build and *for whom*. Links: [architecture](02-ARCHITECTURE.md) · [data model](03-DATA-MODEL.md) · [rbac](04-RBAC.md) · [payments](05-PAYMENTS.md).

## Vision

A single marketplace platform where **many independent vendors** sell many kinds of
products, and **customers buy across vendors in one basket**. We (the platform) are the
merchant-of-record and the operator: we onboard vendors, host the catalog, run checkout,
take a **commission** on every sale, and **pay vendors out** on a schedule.

It must be **dynamic** (any vendor type can be added without code changes to the core
model) yet **type-safe** (nothing enters the system unvalidated).

## Actors (roles)

| Role | Sees | Can do |
|------|------|--------|
| **super_admin** | Everything, all stores, all money | Full control. Creates roles, grants/revokes permissions, approves vendors, sets commission, releases payouts, manages category schemas. |
| **admin** | Only what super_admin granted | A platform staff member. Permissions are a configurable subset (e.g. "support" admin can read orders + issue refunds but not touch payouts). |
| **vendor** (store owner + staff) | **Only their own store** | Manage their store profile, products, inventory, their orders, their payouts/wallet. Never sees other vendors' data. |
| **customer** | The storefront | Browse, search, add to cart across vendors, checkout, track orders, review. |

Roles are not hard-coded lists of screens — they are **bundles of permissions**, and the UI
is generated from permissions. See [04-RBAC.md](04-RBAC.md).

## Vendor types we must support on day one

Food, Grocery, Clothes/Fashion, Oil, Utensils, and **third-party API vendors**
(e.g. a BookMyShow-style events/tickets vendor whose catalog and "purchase" come from an
external API). The trick is that **all of them use the same product model** — the
differences are expressed as *data*, not new code. See [03-DATA-MODEL.md](03-DATA-MODEL.md).

Concrete requirements that shaped the model:

- **Food — pizza:** base price + **customization** ("extra cheese" +₹50, "double cheese"
  +₹90) → these are **modifiers**.
- **Grocery — rice:** same product sold as **500g / 1000g** at different prices → these are
  **variants**.
- **Utensils — container:** has a **capacity** spec (2L, 5L) → an **attribute** (and maybe
  also a variant if each capacity is separately purchasable).
- **Clothes:** size (S/M/L) × color → **variants** on two axes.
- **Third-party (BookMyShow):** catalog synced via an **integration adapter**; "buy" calls
  an external booking API. Still shows up as a vendor with products.

## The three deliverables

1. **Backend** — the API + database + jobs. Node + Express + MongoDB + TypeScript.
   The single brain; both frontends talk only to it. → [backend/PLAN.md](../backend/PLAN.md)
2. **Admin dashboard** — one app, permission-driven, used by super_admin, admin, and
   vendors. What you see depends entirely on your permissions. → [adminDashboard/PLAN.md](../adminDashboard/PLAN.md)
3. **Customer-facing website** — the storefront + checkout. Angular + Angular SSR for SEO.
   → [customerfacing/PLAN.md](../customerfacing/PLAN.md)

Plus a small **`shared/`** package (types/contracts) that all three import.

## Money model (summary — full detail in [05-PAYMENTS.md](05-PAYMENTS.md))

- Customer pays the platform for the whole cart.
- The order is split into **per-vendor sub-orders**.
- For each sub-order we compute **platform commission** and **vendor payable**, and record
  both in a **double-entry ledger** (snapshotted so later rate changes don't rewrite history).
- A scheduled **payout job** settles vendors (minus commission, refunds, fees) to their
  connected account / bank.
- Refunds/cancellations reverse the ledger and claw back commission proportionally.

## Non-negotiables

- Type safety end to end (shared Zod schemas → inferred TS types).
- Idempotent payment + webhook handling (no double-processing — a real bug we hit in duka).
- Vendor isolation (store scoping enforced server-side).
- Docs stay current — they are the plan of record.

## Glossary

| Term | Meaning |
|------|---------|
| **Store / Vendor** | A seller account on the platform. One store = one vendor. |
| **Category** | A node in the catalog tree that also **defines the attribute schema** for its products. |
| **Attribute** | A descriptive spec of a product (material, capacity, ingredients). Defined by the category. |
| **Variant** | A distinct purchasable SKU of a product (500g, size M/red) with its own price + stock. |
| **Modifier** | A per-line customization chosen at cart time that adjusts price (extra cheese). Not a separate SKU. |
| **Order** | A customer's whole checkout. |
| **Sub-order** | The slice of an order belonging to one vendor. Fulfilled and settled independently. |
| **Commission** | The platform's cut of a sale. |
| **Ledger** | Double-entry record of every money movement. |
| **Payout** | Settlement of a vendor's accrued balance to their bank/connected account. |
| **Permission** | A `resource:action` capability (e.g. `product:create`). |
| **Connected account** | The vendor's account at the payment provider that receives transfers. |

## Decision log (append-only)

| # | Decision | Why | Reversible? |
|---|----------|-----|-------------|
| D1 | TypeScript everywhere | "type safety" requirement | costly |
| D2 | Monorepo (pnpm workspaces) with a `shared/` contracts package | single source of truth for types, no duplication | medium |
| D3 | Category-driven attributes + variants + modifiers for products | supports any vendor type via data, not code | costly (core model) |
| D4 | Zod validation at API edge | Mongo is schemaless; Zod is the gate | cheap |
| D5 | Permission-based RBAC + server-generated navigation | super_admin can grant granular access; sidebar reflects it | medium |
| D6 | Marketplace split payments via `PaymentProvider` adapter, Stripe Connect as reference | swappable to Razorpay/Selcom later | cheap (adapter) |
| D7 | Double-entry ledger + idempotent handlers | money truth + no double-processing | medium |
| D8 | Angular for both frontends (admin app + storefront) | one framework/skillset, max consistency; storefront SEO via Angular SSR | medium |
| D9 | NgRx (Store/Effects/Entity) for frontend domain state; signals for local UI; feature state lazy-loaded | predictable, scalable state; realtime flows through same pipeline | medium |
| D10 | Socket.IO for realtime, typed via `shared/events`, Redis adapter for multi-instance | live orders/tracking/notifications/chat; type-safe events | cheap |
