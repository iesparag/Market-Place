# 08 — Project Structure (scalable) ★

> The scalable folder layout for the whole platform + the cross-cutting **sockets** and
> **NgRx** architecture that both frontends share. Per-app detail is in each app's
> `STRUCTURE.md`. Links: [architecture](02-ARCHITECTURE.md) · [conventions](07-CONVENTIONS.md).
>
> Detailed trees: [backend](../backend/STRUCTURE.md) · [admin](../adminDashboard/STRUCTURE.md) · [storefront](../customerfacing/STRUCTURE.md).

## Guiding principles (why it scales)

1. **Feature-first, not layer-first.** Group by domain (`products/`, `orders/`), not by type
   (`controllers/`, `services/`). A feature is self-contained → easy to find, move, delete, own.
2. **Everything has a home.** Every e-commerce concern below has a dedicated module/feature so
   nothing gets dumped into a `misc/`. Add a new concern = add a folder, not edit ten files.
3. **Contracts in `shared/`.** Types, Zod schemas, permission keys, **and socket event
   contracts** live once in `shared/` and are imported everywhere. Type-safe HTTP *and* sockets.
4. **Boundaries via adapters.** Anything external (payment, email, sms, storage, push,
   third-party) sits behind an interface in `providers/`. Swap without touching features.
5. **Consistent module anatomy.** Every backend module and every frontend feature follows the
   **same internal shape** (below), so any dev can navigate any module blindly.

## Monorepo root

```
marketplace/
├── package.json              # workspaces + root scripts (turbo/pnpm)
├── pnpm-workspace.yaml
├── turbo.json                # task pipeline + caching (optional)
├── tsconfig.base.json        # shared TS config, path aliases (@app/shared)
├── .eslintrc.cjs  .prettierrc  .editorconfig  .gitignore
├── docker-compose.yml        # mongo, redis, mailhog, (meilisearch), (minio)
├── .github/workflows/        # CI: typecheck, lint, test, build
├── .env.example
├── shared/                   # @app/shared — contracts (see below)
├── backend/                  # @app/backend — API + realtime + jobs  → STRUCTURE.md
├── adminDashboard/           # @app/admin  — Angular SPA + NgRx       → STRUCTURE.md
└── customerfacing/           # @app/web    — Angular SSR + NgRx       → STRUCTURE.md
```

## `shared/` — the contract layer (imported by all three)

```
shared/src/
├── schemas/            # Zod schemas per domain (product, order, cart, user, payment, ...)
├── types/              # z.infer types + request/response DTOs
├── enums/              # OrderStatus, Role, VendorType, Currency, PaymentStatus, ...
├── permissions.ts      # canonical resource:action list + PERMISSION_META (nav)  → 04-RBAC
├── api/                # ApiResponse<T> envelope, pagination, ERROR_CODES
├── events/             # ★ socket event names + payload Zod schemas (type-safe realtime)
├── constants/          # limits, defaults, regex
└── index.ts            # barrel
```

`events/` makes sockets type-safe: one place defines every event name and its payload, so the
server emit and the client listener share a compile-checked contract. Example:

```ts
// shared/src/events/index.ts
export const SOCKET_EVENTS = {
  ORDER_STATUS_UPDATED: "order:status_updated",
  SUBORDER_NEW: "suborder:new",              // vendor gets a new order
  DELIVERY_LOCATION: "delivery:location",     // live rider location
  INVENTORY_CHANGED: "inventory:changed",
  NOTIFICATION_NEW: "notification:new",
  CHAT_MESSAGE: "chat:message",
  PRESENCE: "presence:update",
} as const;

export const OrderStatusUpdatedSchema = z.object({
  orderId: z.string(), subOrderId: z.string().optional(), status: OrderStatusEnum, at: z.string(),
});
export type OrderStatusUpdated = z.infer<typeof OrderStatusUpdatedSchema>;
```

## Realtime / sockets architecture (end to end)

**Transport:** Socket.IO. **Scale:** `@socket.io/redis-adapter` so events fan out across
multiple backend instances. **Auth:** JWT verified in the socket handshake middleware.

### Backend (see `backend/src/realtime/` in [backend/STRUCTURE.md](../backend/STRUCTURE.md))
- On connect: verify token → join **rooms**: `user:{userId}`, `store:{storeId}` (vendors),
  and dynamically `order:{orderId}` when viewing an order.
- Domain services **never touch `io` directly** — they call typed **emitters**
  (`emitToUser`, `emitToStore`, `emitToOrder`) that validate payloads against `shared/events`.
- Emit points: order/sub-order status changes, new order to vendor, live delivery location,
  inventory/stock changes, new in-app notification, support chat, presence.
- Cross-instance + jobs emit via the Redis adapter (a BullMQ worker can emit too).

### Rooms & who-gets-what

| Room | Joined by | Receives |
|------|-----------|----------|
| `user:{id}` | that user | their notifications, their order updates, chat |
| `store:{id}` | vendor owner + staff | new sub-orders, payout events, low-stock alerts |
| `order:{id}` | the customer + the vendor(s) on it | status timeline, delivery location |
| `admin` | super_admin/ops | platform-wide alerts (fraud, failed payouts) |

### Frontend (both Angular apps)
- A **`SocketService`** (core) connects with the auth token, auto-reconnects, and on each
  inbound event **dispatches an NgRx action** (socket → store → UI updates reactively).
- Outbound actions call `SocketService` methods (e.g. join an order room on a tracking page).
- **SSR note (storefront):** sockets run **browser-only** — guard with `isPlatformBrowser`,
  connect in `afterNextRender`/`ngOnInit`, never during server render.

```ts
// frontend core/services/socket.service.ts (pattern)
this.socket.on(SOCKET_EVENTS.ORDER_STATUS_UPDATED, (p: OrderStatusUpdated) =>
  this.store.dispatch(OrderActions.statusPushed({ update: p })));
```

## NgRx architecture (both Angular apps)

**Decision:** **NgRx Store + Effects + Entity** for domain/server/global state (auth, cart,
catalog, orders, entities). **Component `signals`** for local UI state. Optional
`@ngrx/component-store` / SignalStore for feature-local state that doesn't belong in the global
store. This is decision D9 in [01-OVERVIEW.md](01-OVERVIEW.md).

### Store layers
- **Root store** (`app/store/`): `auth`, `ui` (loading/toasts/theme), `permissions`, plus
  `@ngrx/router-store`. Registered with `provideStore` + `provideEffects` in `app.config.ts`.
- **Feature store** (per lazy feature, `features/<x>/store/`): registered with
  `provideState` + `provideEffects` in that feature's routes — **lazy-loaded state**, so the
  store grows only as features load. This is the key scalability lever.

### Every feature store has the same files
```
features/<feature>/store/
├── <feature>.state.ts       # State interface + initialState (uses @ngrx/entity adapter for lists)
├── <feature>.actions.ts     # load/loadSuccess/loadFailure, CRUD, socketPushed, ...
├── <feature>.reducer.ts     # createReducer(on(...))
├── <feature>.effects.ts     # API calls (via feature .api.ts) + navigation + toasts
├── <feature>.selectors.ts   # createFeatureSelector + memoized selectors
└── <feature>.facade.ts      # thin API the components use (dispatch + select) — components never touch store directly
```
- **`@ngrx/entity`** for all collections (products, orders, customers…) → normalized, O(1) updates.
- **Facade pattern**: components inject the facade, not `Store` — keeps components dumb + testable.
- **Effects** own all side effects (HTTP, navigation, socket joins). Reducers stay pure.
- **Meta-reducers**: `hydration` (persist auth/cart to storage) and `logout-reset` (clear state).
- **Socket → Store**: inbound socket events are dispatched as actions and handled in reducers,
  so realtime updates flow through the same predictable pipeline as everything else.

## Consistent module/feature anatomy (memorize once)

- **Backend module** (`backend/src/modules/<x>/`): `<x>.routes.ts`, `<x>.controller.ts`,
  `<x>.service.ts`, `<x>.repository.ts`, `<x>.model.ts`, `<x>.validation.ts` (Zod from shared),
  `<x>.events.ts` (socket emits), `<x>.types.ts`, `__tests__/`.
- **Frontend feature** (`app/features/<x>/`): `<x>.routes.ts`, `pages/`, `components/`,
  `services/<x>.api.ts`, `store/` (the 6 files above), `models/`.

Same shape everywhere → zero-friction navigation as the codebase grows.

## The full e-commerce surface (every concern has a module/feature)

Catalog · Categories & attribute-schemas · Products (variants/modifiers) · Inventory/stock ·
Media/uploads · Search & filters · Cart · Wishlist · Checkout · Orders & sub-orders · Payments ·
Wallet · Ledger · Payouts · Commissions · Coupons/promotions · Shipping/delivery/tracking ·
Fulfillment · Returns/refunds (RMA) · Tax · Reviews & ratings · Notifications (email/SMS/push/
in-app) · Support/tickets/chat · CMS/banners · Analytics/reporting · Roles & permissions ·
Vendors/stores & staff · Customers · Settings · Audit log · Integrations · Webhooks · Realtime.

Each maps to a backend module + (where user-facing) a frontend feature — see the per-app trees.
