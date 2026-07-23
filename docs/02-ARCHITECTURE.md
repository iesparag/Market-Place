# 02 — Architecture

> How the pieces fit and how they stay type-safe together. Links: [overview](01-OVERVIEW.md) · [conventions](07-CONVENTIONS.md).

## High-level picture

```
                       ┌─────────────────────────┐
                       │      shared/ (types)     │  ← Zod schemas + inferred TS types,
                       │  imported by all three   │    enums, permission keys, API envelope
                       └────────────┬────────────┘
                                    │  (import, never redefine)
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐        ┌─────────▼─────────┐        ┌────────▼─────────┐
│ adminDashboard │        │   customerfacing   │        │     backend      │
│ Angular (SPA)  │ HTTPS  │ Angular + SSR/SEO  │ HTTPS  │ Express + Mongo  │
│ (app-like)     ├───────►│                    ├───────►│  (the only brain)│
└────────────────┘  REST  └────────────────────┘  REST  └───┬─────┬─────┬──┘
                                                            │     │     │
                                              ┌─────────────┘     │     └──────────────┐
                                        ┌─────▼─────┐      ┌───────▼──────┐      ┌───────▼───────┐
                                        │  MongoDB  │      │ Redis+BullMQ │      │ Providers via │
                                        │           │      │ (jobs/queue) │      │  adapters:    │
                                        └───────────┘      └──────────────┘      │ Payment/Email/│
                                                                                 │ Integration   │
                                                                                 └───────────────┘
```

Both frontends talk **only** to the backend over REST. The backend is the single source of
business logic and the only thing that touches the DB, the queue, and external providers.

## Why a monorepo

The hard requirement "dynamic but type-safe, and don't repeat yourself" is solved at the
code level by a **monorepo with a shared package**. One repo, workspaces:

```
marketplace/               (pnpm workspace root)
├── package.json           (workspaces: backend, adminDashboard, customerfacing, shared)
├── pnpm-workspace.yaml
├── shared/                @app/shared  — the contract layer
├── backend/               @app/backend
├── adminDashboard/        @app/admin
└── customerfacing/        @app/web
```

- Recommended tooling: **pnpm workspaces** (+ optionally **Turborepo** for task caching).
- The three apps depend on `@app/shared`. They **import** types; they never copy them.
- Change a schema once in `shared/` → TypeScript breaks every place that's now wrong.
  That is the safety net.

> Note: the user asked for 3 folders (backend, adminDashboard, customerfacing). `shared/` is
> a small 4th supporting package — it is not an app, it's the glue that makes type safety
> real. Keep it tiny and dependency-free.

## The `shared/` package (contract layer)

Everything that both a frontend and the backend must agree on lives here, defined **once**:

```
shared/src/
├── schemas/          Zod schemas (product, order, user, category, payment, ...)
├── types/            TS types inferred from the Zod schemas (z.infer)
├── enums/            OrderStatus, Role, VendorType, Currency, ...
├── permissions.ts    the canonical permission key list (see 04-RBAC.md)
├── api/              request/response DTOs + the ApiResponse<T> envelope
└── index.ts          barrel export
```

Pattern — **define with Zod, derive the type**:

```ts
// shared/src/schemas/product.ts
import { z } from "zod";
export const VariantSchema = z.object({
  sku: z.string(),
  optionValues: z.record(z.string()),          // { size: "M", color: "Red" }
  price: z.number().int().nonnegative(),         // minor units (paise)
  currency: z.string().length(3),
  stock: z.number().int().nonnegative(),
});
export const ProductSchema = z.object({ /* ... */ });
export type Product = z.infer<typeof ProductSchema>;   // one source of truth
```

Backend validates with `ProductSchema.parse(req.body)`. Frontend forms validate with the
same schema. Both share the `Product` type. **No drift possible.**

## Backend architecture

Layered, business logic only in services. Full conventions in [07-CONVENTIONS.md](07-CONVENTIONS.md).

```
backend/src/
├── config/            env (validated with Zod), db, redis, logger
├── middleware/        auth, authorize(permission), scopeToStore, error handler, validate(schema)
├── modules/           one folder per domain (feature-first)
│   ├── auth/          auth.routes.ts  auth.controller.ts  auth.service.ts
│   ├── users/
│   ├── stores/        (vendors)
│   ├── categories/    (attribute schema management)
│   ├── products/      (the flexible model — see 03)
│   ├── cart/
│   ├── orders/        (orders + sub-orders)
│   ├── payments/      (provider adapter, webhooks, ledger, payouts)
│   ├── reviews/
│   ├── integrations/  (third-party adapters, e.g. bookmyshow)
│   └── notifications/ (email/SMS via provider adapter)
├── models/            Mongoose schemas (dumb; validation is Zod at the edge)
├── jobs/              BullMQ workers (payouts, emails, webhook processing, catalog sync)
├── lib/               providers/ (payment, email, integration adapters), ledger, money
└── app.ts / server.ts
```

Request lifecycle: `route → validate(zodSchema) → authenticate → authorize(permission) →
scopeToStore → controller → service → model`. Controllers are thin; they call one service
method and shape the response envelope.

## Provider adapters (swap without rewrites)

Anything external hides behind an interface in `lib/providers/`, so we can swap vendors:

```ts
interface PaymentProvider {
  createConnectedAccount(store): Promise<ConnectedAccount>;
  createPaymentIntent(order): Promise<PaymentIntent>;
  capture(intentId): Promise<void>;
  refund(chargeId, amount): Promise<Refund>;
  payout(store, amount): Promise<Payout>;
  verifyWebhook(raw, sig): WebhookEvent;
}
interface EmailProvider  { send(msg: EmailMessage): Promise<void>; }
interface IntegrationProvider {           // e.g. BookMyShow
  syncCatalog(store): Promise<Product[]>;
  purchase(order): Promise<ExternalBookingRef>;
}
```

Reference implementations: **Stripe Connect** (payment), **Resend / SES** (email). Swappable
to Razorpay Route, Selcom, Nodemailer, etc. See [05-PAYMENTS.md](05-PAYMENTS.md).

## Async work (queue)

Never do slow/unreliable work inside an HTTP request. Push a job to **BullMQ (Redis)**:

- payment webhook processing (idempotent), payout batches, transactional emails,
  third-party catalog sync, search re-indexing, image processing.

## Frontends (summary — detail in their PLANs)

Both apps are **Angular + TypeScript** (standalone components, one framework/skillset). They
import the same `@app/shared` Zod schemas/types; only the framework idioms differ from a React
stack (RxJS/HttpClient instead of TanStack Query, Reactive Forms instead of RHF).

- **adminDashboard** — Angular SPA, Angular Router with `CanMatch`/`CanActivate` guards,
  Reactive Forms (Zod from `shared/` wrapped as validators), HttpClient + RxJS for server state
  (optionally a query lib / signals), a component library (Angular Material or PrimeNG).
  Routing + sidebar are **driven by permissions** returned from the backend.
- **customerfacing** — Angular + **Angular SSR (`@angular/ssr`)** with hydration and
  prerendering (SSG) for SEO on catalog/product pages; `TransferState` to avoid double-fetch;
  cart state client-side; checkout hits the backend. SSR tradeoff vs Next.js noted in its PLAN.

## Environments & infra (target)

- Local: `docker-compose` (mongo, redis, mailhog). Each app runs with its own dev server.
- Config via env, **validated with Zod at boot** — the app refuses to start on bad config.
- CI: typecheck + lint + test on every push. Deploy backend as a container; admin as static
  (Angular SPA build); storefront on a Node host (Angular SSR) behind a CDN cache.
- Observability: structured logs (Pino), request IDs, error tracking (Sentry).
