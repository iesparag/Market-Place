# Backend — Build Plan

> Node + Express + MongoDB + TypeScript. The only brain; both frontends talk only to it.
> **Read these shared specs, don't duplicate them here:**
> [architecture](../docs/02-ARCHITECTURE.md) · [data model](../docs/03-DATA-MODEL.md) ·
> [rbac](../docs/04-RBAC.md) · [payments](../docs/05-PAYMENTS.md) · [conventions](../docs/07-CONVENTIONS.md).

## Stack

Express · Mongoose · **Zod** (validation, from `shared/`) · JWT (access+refresh) · BullMQ +
Redis (jobs) · Pino (logs) · Helmet/CORS/rate-limit · Vitest + Supertest · Docker.

## Folder layout

See the tree in [02-ARCHITECTURE.md](../docs/02-ARCHITECTURE.md#backend-architecture). Feature-first
`modules/<domain>/<domain>.{routes,controller,service}.ts`; `models/`, `middleware/`, `jobs/`,
`lib/providers/`, `lib/ledger`, `lib/money`, `config/`.

## Cross-cutting middleware (build in Phase 0)

- `authenticate` — verify JWT → `req.user`.
- `authorize(permission)` — effective-permission check (super_admin wildcard passes).
- `scopeToStore` — force `req.storeId` for store-scoped users; never trust body storeId.
- `validate(schema)` — Zod parse of `body`/`query`/`params` from `shared/` schemas.
- `errorHandler` — `AppError` → `ApiResponse` envelope + logging.
- All detailed in [04-RBAC.md](../docs/04-RBAC.md) and [07-CONVENTIONS.md](../docs/07-CONVENTIONS.md).

## Module checklist (build order follows the [roadmap](../docs/06-ROADMAP.md))

| Module | Key endpoints | Notes |
|--------|---------------|-------|
| `auth` | register, login, refresh, logout, forgot/reset | JWT, rotating refresh cookie |
| `users` | me, navigation, CRUD, invite | `GET /me`, `GET /me/navigation` (dynamic sidebar) |
| `roles` | CRUD, assign, toggle permission | super_admin; overrides per user |
| `stores` | signup, approve/reject, profile, list | approval flow → connected account |
| `categories` | CRUD + `attributeSchema` + `variantAxes` | drives dynamic product validation |
| `products` | CRUD, variants, modifiers, media | **dynamic attribute validation** (validator from category) |
| `catalog` (public) | list/search/filter, detail | no auth; only `active/public` |
| `cart` | add/update/remove, get | server-computed prices, multi-store |
| `orders` | create (checkout), get, list | splits into sub-orders, snapshots commission |
| `subOrders` | vendor lifecycle updates | store-scoped |
| `payments` | create-intent, **webhook**, refund, connected-account | idempotent; ledger writes |
| `payouts` | list, release, statement | batch job + records |
| `ledger` (internal) | — | double-entry, source of truth |
| `reviews` | create, list, moderate | post-delivery |
| `integrations` | manage, sync | `IntegrationProvider` adapters |
| `notifications` | (internal) | queued email via `EmailProvider` |

## The two things to get exactly right

1. **Dynamic + type-safe products** — build the `attributeValidator(category.attributeSchema)`
   helper and call it in `products.service.create/update`. Static shape from `shared/`
   `ProductSchema`; dynamic attribute values validated against the category. Full spec +
   code sketch in [03-DATA-MODEL.md](../docs/03-DATA-MODEL.md#type-safety-over-a-schemaless-db).
2. **Idempotent money** — `paymentEvents.eventId` unique index; `ledgerEntries.idempotencyKey`
   unique; webhook processing on the queue; outbound idempotency keys. Spec in
   [05-PAYMENTS.md](../docs/05-PAYMENTS.md#idempotency-the-duka-lesson--enforce-hard).

## Jobs (BullMQ)

`process-webhook`, `send-email`, `run-payouts`, `sync-catalog`, `reindex-search`,
`reconcile-ledger`. Workers are idempotent and retried with backoff.

## Config (Zod-validated at boot)

`PORT, MONGO_URI, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, PAYMENT_PROVIDER + keys,
EMAIL_PROVIDER + keys, STORAGE_* , WEB_ORIGIN, ADMIN_ORIGIN`. App refuses to start if invalid.

## Phase 0 done-when

Express boots, connects Mongo/Redis, `/health` green, auth works, `GET /me/navigation`
returns a permission-filtered menu, super_admin seeded, error envelope + logging in place,
docker-compose up works, CI green.
