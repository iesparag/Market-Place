# Backend — Scalable Folder Structure

> Full tree for the Node + Express + MongoDB + TypeScript API, realtime, and jobs.
> Read with: [structure master](../docs/08-STRUCTURE.md) · [build plan](PLAN.md) ·
> [architecture](../docs/02-ARCHITECTURE.md) · [conventions](../docs/07-CONVENTIONS.md).

## Full tree

```
backend/
├── src/
│   ├── main.ts                     # entrypoint: bootstrap() then listen
│   ├── app.ts                      # express app (middleware order, mount routes)
│   ├── server.ts                   # http server + attach socket.io
│   │
│   ├── config/
│   │   ├── env.ts                  # process.env parsed+validated with Zod (fails fast)
│   │   ├── db.ts                   # mongoose connection
│   │   ├── redis.ts                # ioredis client (cache + queues + socket adapter)
│   │   ├── logger.ts               # pino + request-id
│   │   ├── swagger.ts              # OpenAPI docs
│   │   └── constants.ts
│   │
│   ├── loaders/                    # bootstrap wiring, called in order
│   │   ├── index.ts                # bootstrap(): db → redis → routes → sockets → queues → jobs
│   │   ├── express.loader.ts
│   │   ├── mongoose.loader.ts
│   │   ├── socket.loader.ts
│   │   ├── queue.loader.ts
│   │   └── routes.loader.ts        # mounts every module router under /api/v1
│   │
│   ├── middleware/
│   │   ├── authenticate.ts         # verify JWT → req.user
│   │   ├── authorize.ts            # authorize(permission) — effective-permission check
│   │   ├── scopeToStore.ts         # force req.storeId for store-scoped users
│   │   ├── validate.ts             # validate(schema) — Zod on body/query/params
│   │   ├── error.ts                # AppError → ApiResponse envelope + log
│   │   ├── notFound.ts             ├── rateLimit.ts        ├── requestId.ts
│   │   └── upload.ts               # multer/stream to storage provider
│   │
│   ├── common/
│   │   ├── AppError.ts             # typed error (code, status, details)
│   │   ├── apiResponse.ts          # ok()/fail() envelope helpers
│   │   ├── asyncHandler.ts         # wrap async controllers
│   │   ├── pagination.ts           # parse+build page/limit/sort
│   │   ├── money.ts                # integer minor-units math (never floats)
│   │   ├── result.ts  utils.ts  types.ts
│   │
│   ├── modules/                    # ★ feature-first — anatomy per module in 08-STRUCTURE
│   │   ├── auth/                   # register, login, refresh, logout, OTP, password reset
│   │   ├── users/                  # profile, admin user mgmt, GET /me, GET /me/navigation
│   │   ├── addresses/              # customer + store addresses
│   │   ├── roles/                  # roles + permission bundles (super_admin)
│   │   ├── stores/                 # vendors: signup, approve/reject, profile, commission override
│   │   ├── staff/                  # vendor staff invites + scoped permissions
│   │   ├── customers/              # customer directory (admin view)
│   │   ├── categories/             # catalog tree + attributeSchema + variantAxes
│   │   ├── products/               # attributes(dynamic-validated) + variants + modifierGroups
│   │   ├── inventory/              # stock levels, reservations, low-stock alerts
│   │   ├── media/                  # uploads → storage provider, image variants
│   │   ├── search/                 # index + query (mongo now, meili/opensearch later)
│   │   ├── cart/                   # multi-vendor cart, server-computed prices
│   │   ├── wishlist/               # favorites
│   │   ├── checkout/               # quote → order+suborders creation, repricing
│   │   ├── orders/                 # order aggregate, status
│   │   ├── suborders/              # per-vendor fulfillment lifecycle
│   │   ├── payments/               # provider adapter, intents, webhooks (idempotent)
│   │   ├── wallet/                 # vendor balance (derived from ledger)
│   │   ├── ledger/                 # double-entry entries (internal)
│   │   ├── payouts/                # batch settlement + records
│   │   ├── commissions/            # commission rules engine (platform/category/store)
│   │   ├── coupons/                # promotions, discounts, campaigns
│   │   ├── shipping/               # zones, rates, delivery, live tracking
│   │   ├── fulfillment/            # pick/pack/ship or integration purchase
│   │   ├── returns/                # RMA, refunds, ledger reversal
│   │   ├── tax/                    # tax/GST computation + config
│   │   ├── reviews/                # ratings + moderation
│   │   ├── notifications/          # email/sms/push/in-app fan-out (queued)
│   │   ├── support/                # tickets + chat threads
│   │   ├── cms/                    # banners, pages, homepage blocks
│   │   ├── analytics/              # sales/commission/vendor reports
│   │   ├── settings/               # platform config (commission default, currency, flags)
│   │   ├── audit/                  # audit log (sensitive actions)
│   │   ├── integrations/           # third-party vendors (bookmyshow, feeds) + catalog sync
│   │   └── webhooks/               # inbound provider webhooks (payment, shipping) → queue
│   │
│   ├── realtime/                   # ★ Socket.IO layer (see 08-STRUCTURE sockets)
│   │   ├── index.ts                # io init + @socket.io/redis-adapter
│   │   ├── socket.auth.ts          # JWT handshake middleware
│   │   ├── rooms.ts                # room name builders: user:{}, store:{}, order:{}, admin
│   │   ├── emitters.ts             # typed emitToUser/Store/Order (validate vs shared/events)
│   │   ├── presence.ts             # online presence tracking (redis)
│   │   └── handlers/               # inbound socket handlers: orders, chat, tracking, presence
│   │
│   ├── jobs/                       # BullMQ (Redis)
│   │   ├── queues.ts               # queue definitions
│   │   ├── workers/                # process-webhook, send-notification, run-payouts,
│   │   │                           #   sync-catalog, reindex-search, reconcile-ledger, image-process
│   │   └── schedulers/             # repeatable/cron jobs (payout batch, reconcile, cleanup)
│   │
│   ├── providers/                  # external adapters (swap without touching modules)
│   │   ├── payment/                # PaymentProvider: stripe/ (ref), razorpay/, selcom/
│   │   ├── email/                  # EmailProvider: resend/, ses/, nodemailer/
│   │   ├── sms/                    ├── push/            ├── storage/  # s3/, cloudinary/
│   │   └── integration/            # IntegrationProvider: bookmyshow/, ...
│   │
│   ├── db/
│   │   ├── indexes.ts              # ensure indexes (incl. unique idempotency indexes)
│   │   ├── migrations/             └── seeds/           # super_admin, permissions, demo data
│   │
│   └── docs/openapi/               # generated API spec
│
├── tests/                          # integration (supertest) + e2e; unit tests live in module __tests__/
├── .env.example   Dockerfile   .dockerignore
├── package.json   tsconfig.json   vitest.config.ts   .eslintrc.cjs
```

## Anatomy of one module (every `modules/<x>/` looks like this)

```
modules/products/
├── products.routes.ts        # paths + middleware chain (validate → authenticate → authorize → scopeToStore)
├── products.controller.ts    # thin: parse req → call service → ok(res, data)
├── products.service.ts       # ALL business logic (dynamic attribute validation lives here)
├── products.repository.ts    # mongoose queries only (always filters by storeId when scoped)
├── products.model.ts         # mongoose schema (dumb)
├── products.validation.ts    # Zod request schemas (imported from @app/shared where shared)
├── products.events.ts        # socket emits for this domain (INVENTORY_CHANGED, ...)
├── products.types.ts
└── __tests__/                # service unit + route integration (incl. authz + scoping)
```

## Middleware order (in `app.ts`)

`requestId → logger → helmet → cors → rateLimit → json/body limits → routes → notFound → error`.
Per-route: `validate(schema) → authenticate → authorize(perm) → scopeToStore → controller`.

## Where the "hard" things live

- **Dynamic + type-safe products** → `modules/products/products.service.ts` (validator built
  from `categories` attributeSchema). Spec: [03-DATA-MODEL.md](../docs/03-DATA-MODEL.md).
- **Idempotent money** → `modules/payments` + `modules/webhooks` + `db/indexes.ts` (unique
  `paymentEvents.eventId`, `ledgerEntries.idempotencyKey`). Spec: [05-PAYMENTS.md](../docs/05-PAYMENTS.md).
- **Realtime fan-out** → `realtime/emitters.ts` called from module `*.events.ts`; workers emit
  via the same Redis-adapter io. Spec: [08-STRUCTURE.md](../docs/08-STRUCTURE.md#realtime--sockets-architecture-end-to-end).
