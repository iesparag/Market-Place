# 07 — Conventions

> The rules that keep three apps consistent. Skim once; follow always. Links: [architecture](02-ARCHITECTURE.md).

## Language & types

- **TypeScript strict** everywhere (`strict: true`, `noUncheckedIndexedAccess: true`).
- Types come from **`shared/`** (Zod → `z.infer`). Never redefine a shared type in an app.
- No `any`. Use `unknown` + a Zod parse at boundaries.

## Backend layering (hard boundary)

```
route      — declares path + middleware chain, no logic
controller — parse req → call ONE service method → shape response. No business logic, no DB.
service    — all business logic + orchestration. The only place with rules.
model      — Mongoose schema + data access. Dumb. No business rules.
```
Cross-cutting concerns (auth, validation, scoping, errors) are **middleware**. External systems
are **provider adapters** in `lib/providers/`.

## API conventions

- REST, versioned: `/api/v1/...`. Plural nouns (`/products`, `/sub-orders`).
- **Every response uses one envelope** (defined in `shared/api`):
  ```ts
  type ApiResponse<T> =
    | { ok: true;  data: T;  meta?: { page, limit, total } }
    | { ok: false; error: { code: string; message: string; details?: unknown } };
  ```
- HTTP status is honest (200/201/400/401/403/404/409/422/500). Business errors carry a stable
  `error.code` (e.g. `PRODUCT_ATTR_INVALID`, `INSUFFICIENT_STOCK`, `PERMISSION_DENIED`).
- **Validate every input** with `validate(zodSchema)` middleware before the controller.
- Pagination: `?page=&limit=` (cap limit), sort/filter as explicit query params.
- List endpoints for scoped resources always filter by `req.storeId` (see [04-RBAC.md](04-RBAC.md)).

## Errors

- Throw typed `AppError(code, httpStatus, message, details?)` in services.
- One error-handling middleware converts it to the envelope + logs with request id. Never leak
  stack traces or internal messages to clients.
- Zod parse failures → `422 VALIDATION_ERROR` with field details.

## Money & dates

- Money = **integer minor units** (paise) + currency code. Never floats, never `Number` math
  on rupees. All arithmetic in a `money` helper.
- Dates = UTC ISO strings over the wire; store as `Date`. Convert relative → absolute always.

## Naming

- Files: `feature.role.ts` (`products.service.ts`, `products.controller.ts`). Folders =
  feature/domain (feature-first, not layer-first).
- Vars/functions `camelCase`; types/classes `PascalCase`; constants `UPPER_SNAKE`;
  Mongo collections plural lowercase; permission keys `resource:action`.
- Zod schemas `XxxSchema`; inferred types `Xxx`.

## Security defaults

- Helmet, CORS allow-list, rate limiting (auth + write routes), body size limits.
- Secrets only via env (Zod-validated at boot). Nothing secret in the repo.
- Passwords argon2/bcrypt. JWT access short-lived + rotating refresh (httpOnly cookie).
- Authorize on the server for **every** protected action; UI hiding is UX only.
- Verify webhook signatures; use provider hosted fields for cards (never touch PAN).
- Audit sensitive actions (`auditLog`, see [04-RBAC.md](04-RBAC.md)).

## Testing

- **Vitest/Jest** unit tests for services (the logic). **Supertest** integration tests for API
  (auth + authz + validation + happy/edge). Playwright e2e for critical flows (checkout).
- Every bug fix adds a regression test. Money and idempotency paths get explicit tests
  (including duplicate-webhook replay).
- Test data via factories; isolated test DB (mongodb-memory-server or a disposable container).

## Git & workflow

- Trunk-based with short-lived branches: `feat/…`, `fix/…`, `chore/…`.
- **Conventional Commits** (`feat:`, `fix:`, `refactor:`…). Small, focused PRs.
- CI must pass: typecheck + lint + test. No direct pushes to main.
- Update the relevant `docs/*` in the same PR as the feature (Rule 8).

## Frontend conventions (both apps — Angular)

- Both frontends are **Angular + TypeScript**, standalone components, one shared style.
- Domain/server/global state via **NgRx** (Store/Effects/Entity); component **`signals`** for
  local UI state. Feature state is **lazy-loaded per feature** (`provideState`/`provideEffects`
  in the feature's routes). Components inject a **facade**, never `Store` directly.
- All side effects (HTTP, navigation, socket joins) live in **Effects**; reducers stay pure.
  HTTP goes through a typed **API service**; forms via **Reactive Forms** with `shared/` **Zod**
  schemas wrapped as validators. No duplicated validation logic.
- A typed **API service** returns `ApiResponse<T>`; an **HTTP interceptor** unwraps the envelope
  + attaches the auth token in one place.
- **Realtime**: one `SocketService` (typed via `shared/events`) dispatches NgRx actions on
  inbound events; realtime flows through the same store pipeline. Browser-only on SSR.
- Permission checks in UI use permission strings from `shared/`, via a `*hasPermission`
  structural directive and route guards (`can("payout:release")`).
- Components small and typed; no business logic in components — call the facade/services.
  `OnPush` change detection everywhere.

## Environment & config

- One `env.ts` per app that parses `process.env` with Zod and exports a typed `config`.
  App refuses to boot on invalid/missing config.
- `.env.example` committed; real `.env` git-ignored.

## Definition of Done (per feature)

1. Contract in `shared/` (schema + type). 2. Backend: model + service + controller + route +
tests, authz + scoping applied. 3. Frontend wired with typed client + permission guard.
4. Docs updated. 5. CI green.
