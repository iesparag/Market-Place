# 06 — Roadmap

> The order we build in. Each phase is shippable and de-risks the next. Links: [overview](01-OVERVIEW.md) · app plans: [backend](../backend/PLAN.md) · [admin](../adminDashboard/PLAN.md) · [web](../customerfacing/PLAN.md).

## Principles

- **Vertical slices.** Each phase touches backend + a frontend and produces something usable,
  not a half-built layer.
- **Contracts first.** Before building a feature, add its Zod schemas/types to `shared/`.
- **Hardest risks early.** The flexible product model and payments are the risky bits — prove
  them before polishing UI.

## Phase 0 — Foundations (skeleton that compiles + deploys)

- Monorepo (pnpm workspaces), `shared/` package, TS config, ESLint/Prettier, Husky.
- Backend skeleton: Express, Mongo connection, Zod-validated env, Pino logger, error
  middleware, health check, Docker + docker-compose (mongo, redis, mailhog).
- Auth: register/login, JWT access+refresh, password hashing.
- RBAC skeleton: permission list in `shared/`, `authenticate`/`authorize`/`scopeToStore`
  middleware, seed super_admin, `GET /me`, `GET /me/navigation`.
- Admin shell (Vite+React): login, permission-driven sidebar/route guards from `/me/navigation`.
- Web shell (Next.js): landing + layout + health.
- CI: typecheck + lint + test on push.
- **Exit:** super_admin logs into admin; sidebar renders from permissions; both apps deploy.

## Phase 1 — Vendors & flexible catalog (the core bet)

- Stores: vendor signup, super_admin approve/reject, store profile.
- Categories + **attribute schema** management (super_admin): CRUD `attributeSchema`,
  `variantAxes`.
- Products: CRUD with **dynamic attribute validation** (validator built from category),
  **variants**, **modifier groups**. Media upload (S3/Cloudinary).
- Admin: category-schema editor, product editor that renders fields from the category schema,
  variant matrix builder, modifier-group builder — all scoped to the vendor's store.
- **Exit:** a vendor creates a pizza (with modifiers) and a rice product (500g/1000g variants);
  invalid attributes are rejected. Proves "dynamic + type-safe".

## Phase 2 — Storefront & cart

- Public catalog API: list/search/filter by category + filterable attributes; product detail
  with variants + modifiers.
- Web (Next.js): home, category pages (SSR/ISR for SEO), product page with variant + modifier
  selection and live price, multi-vendor cart.
- Cart API: server-computed prices, multi-store cart.
- **Exit:** customer browses, picks a variant + modifiers, sees correct price, fills a cart
  spanning two vendors.

## Phase 3 — Checkout & payments (happy path)

- Order + sub-order creation (split by store), server-side repricing, address/contact.
- `PaymentProvider` adapter + Stripe Connect (test mode): create intent, hosted payment,
  **webhook** → mark paid → **ledger** entries (idempotent).
- Vendor connected-account onboarding.
- Admin/vendor: order + sub-order views, status timeline.
- **Exit:** end-to-end paid order across two vendors; ledger balances correct; no double-post
  on webhook retry.

## Phase 4 — Fulfillment & notifications

- Sub-order lifecycle (accept → prepare → ship/deliver or integration purchase), per-vendor.
- `EmailProvider` adapter + transactional emails (order confirm, vendor new-order, status,
  password reset, vendor invite) via BullMQ.
- Reviews (post-delivery), rating aggregates.
- **Exit:** vendor progresses an order; customer gets emails; can leave a review.

## Phase 5 — Finance: commission engine, wallet & payouts

- Commission engine (platform default / category / store override, tiered), snapshotted.
- Wallet balances derived from ledger; vendor wallet + statement UI.
- Payout job (batch transfers), `payouts` records, payout emails.
- Refunds/cancellations: ledger reversal + commission claw-back.
- Reconciliation job + finance dashboard for super_admin/finance admin.
- **Exit:** vendor sees accurate balance, receives a payout; a refund reverses ledger correctly.

## Phase 6 — Permissions polish & third-party integrations

- super_admin UI: create/edit roles, toggle permissions per role/user, per-user overrides.
- Vendor staff invites with granular permissions.
- `IntegrationProvider` adapter + first integration (BookMyShow-style): catalog sync job,
  external purchase at checkout, `externalRef` on sub-order.
- Promotions/coupons/banners (funded-by attribution in ledger).
- Analytics dashboards (sales, commission, top vendors/products).
- **Exit:** super_admin builds a custom role that changes another user's sidebar live; an
  external vendor's catalog appears and can be "purchased".

## Phase 7 — Hardening & launch

- Tests to target coverage (unit services, integration API, e2e critical paths).
- Security pass (rate limiting, input limits, authz tests, secrets, webhook sig, dependency
  audit), load test hot paths, search engine migration if needed, observability + alerting,
  runbooks, backups, deploy pipelines.
- **Exit:** production-ready.

## Master checklist (update as you go)

```
[ ] P0 Foundations        [ ] P4 Fulfillment & notifications
[ ] P1 Vendors & catalog  [ ] P5 Finance: commission/wallet/payouts
[ ] P2 Storefront & cart  [ ] P6 Permissions & integrations
[ ] P3 Checkout & payments[ ] P7 Hardening & launch
```

## Feature track — AI Customer Support (parallel to P4+)

RAG support chatbot + admin assist across app/web/dashboard. Full design: `docs/10-SUPPORT-AI.md`.
Best started once orders exist (P3), since the bot's value is order-aware answers.

```
[x] S1 Backend spine        [ ] S4 Admin inbox        [ ] S7 Prod RAG + harden
[x] S2a Tool-call + guards  [ ] S5 Auto opt-in
[x] S2b Product RAG+search  [x] S6a Flutter app chat
[x] S3 Escalation (basic)   [ ] S6b Web chat widget

S2b: product create/update/delete → embedding sync (rag.service), search_products bot tool,
category search in /search/suggest, backfill:embeddings script. App: order picker + product/
category search + tap-to-redirect (deep-link) in the support chat.
```
