# CLAUDE.md — Multi-Vendor Marketplace (always-load rules)

> This file is auto-loaded every session. It is the **router + rulebook**.
> Read the linked doc for the area you are touching — do **not** read everything.
> All deep detail lives in `docs/`. Keep this file short.

## What we are building

A **multi-vendor e-commerce marketplace**. The platform owner (us) onboards vendors
(food, grocery, clothes, oil, utensils, third-party APIs like BookMyShow). Customers
buy across vendors in one cart. We take a **commission**; vendors get **payouts**.

Three apps + one shared package (a monorepo):

| App | Folder | Stack | Who uses it |
|-----|--------|-------|-------------|
| Backend API | `backend/` | Node + Express + MongoDB + TypeScript | all |
| Admin dashboard | `adminDashboard/` | Angular + TypeScript | super_admin, admin, vendor |
| Customer site | `customerfacing/` | Angular + Angular SSR + TypeScript | customer |
| Shared contracts | `shared/` | TypeScript + Zod | imported by all three |

## The 8 rules we NEVER break

1. **TypeScript everywhere.** No plain JS. "Type safety" is a hard requirement.
2. **One source of truth for types = `shared/`.** Types, Zod schemas, enums, permission
   keys, and API response shapes are defined **once** in `shared/` and imported. Never
   redefine a type in an app. This is how we "join together without repeating."
3. **Validate at the edge with Zod.** Every API input is parsed by a Zod schema before
   it reaches a service. Mongo is schemaless — Zod is our gate.
4. **Layered backend:** `route → controller → service → model`. Business logic lives in
   **services** only. Controllers are thin. Models are dumb.
5. **Permissions are enforced on the API, always.** UI hiding is UX only, never security.
   See `docs/04-RBAC.md`.
6. **Money is double-entry + idempotent.** Every rupee movement writes ledger entries.
   Every webhook/payment handler is idempotent (we already got burned by duplicate
   callbacks in duka — never again). See `docs/05-PAYMENTS.md`.
7. **Vendor data is store-scoped.** A vendor can only ever touch rows where
   `storeId === their store`. Enforce with middleware, not by trusting the client.
8. **Every new feature updates the doc it belongs to.** Docs are the plan of record.

## Which doc do I read for this task?

| I'm working on… | Read |
|-----------------|------|
| Big picture, actors, glossary | `docs/01-OVERVIEW.md` |
| Stack, folders, how apps connect | `docs/02-ARCHITECTURE.md` |
| Products, variants, customization, any schema | `docs/03-DATA-MODEL.md` |
| Roles, permissions, sidebar, who-sees-what | `docs/04-RBAC.md` |
| Payments, commission, payouts, refunds | `docs/05-PAYMENTS.md` |
| What to build next / phase order | `docs/06-ROADMAP.md` |
| Flutter customer app (mobile, BB/Blinkit-style) | `docs/09-FLUTTER-APP.md` |
| Naming, git, testing, error format | `docs/07-CONVENTIONS.md` |
| Folder structure, NgRx, sockets setup | `docs/08-STRUCTURE.md` + each app's `STRUCTURE.md` |
| Backend build steps / full tree | `backend/PLAN.md` · `backend/STRUCTURE.md` |
| Admin dashboard build steps / full tree | `adminDashboard/PLAN.md` · `adminDashboard/STRUCTURE.md` |
| Customer site build steps / full tree | `customerfacing/PLAN.md` · `customerfacing/STRUCTURE.md` |

## Key architectural decisions (short form — rationale in docs)

- **Flexible product schema** = Category-defined **attributes** + **variants** + **modifier
  groups**. Pizza "extra cheese" = a modifier. Grocery "500g/1000g" = variants. Utensil
  "capacity" = an attribute. One model, every vendor type. → `docs/03-DATA-MODEL.md`.
- **RBAC** = granular `resource:action` permissions bundled into roles; super_admin grants
  them; the **sidebar is generated from the user's permissions** via `GET /me/navigation`.
- **Payments** = marketplace split settlement via a swappable `PaymentProvider` adapter
  (reference impl: **Stripe Connect**; can swap for Razorpay Route / Selcom). Platform
  collects, ledger records commission + vendor payable, payout job settles vendors.
- **Multi-vendor cart** = split into per-vendor **sub-orders** (same idea as duka suborders).
- **Jobs/email/webhooks** run through a queue (BullMQ + Redis), never inline in a request.
- **Frontend state** = **NgRx** (Store/Effects/Entity) for domain state, component `signals`
  for local UI. Feature state is lazy-loaded per feature. → `docs/08-STRUCTURE.md`.
- **Realtime** = **Socket.IO** (typed events in `shared/events`, Redis adapter for scale);
  inbound socket events dispatch NgRx actions. → `docs/08-STRUCTURE.md`.

## Status

See the checklist at the bottom of `docs/06-ROADMAP.md`. Update it as phases complete.
