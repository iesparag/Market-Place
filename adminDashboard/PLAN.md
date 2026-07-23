# Admin Dashboard — Build Plan

> **One** Angular app for super_admin, admin, and vendors. What you see is 100% driven by your
> permissions. **Angular + TypeScript** (standalone components).
> Shared specs (don't duplicate): [rbac](../docs/04-RBAC.md) · [data model](../docs/03-DATA-MODEL.md) ·
> [payments](../docs/05-PAYMENTS.md) · [conventions](../docs/07-CONVENTIONS.md).

## Why one app for three roles

The sidebar and routes are generated from the user's permissions (`GET /me/navigation` +
`GET /me`). A vendor logging in sees only their store's sections; a support admin sees only
Orders/Reviews; super_admin sees everything. **No separate builds per role** — the backend
decides, the UI reflects. See [04-RBAC.md](../docs/04-RBAC.md#dynamic-sidebar--navigation-server-generated).

## Stack

Angular (standalone components, latest) + TS · **Angular Router** with `CanMatch`/`CanActivate`
guards · **Reactive Forms** (reuse `shared/` Zod schemas wrapped as validators — no re-written
validation) · **NgRx (Store/Effects/Entity)** for domain state (lazy-loaded per feature,
facade pattern) + **signals** for local UI · **Socket.IO** via a `SocketService` that dispatches
NgRx actions · **Angular Material or PrimeNG** component library · **HTTP interceptors** (auth
token, `ApiResponse<T>` envelope unwrap, error → toast) · `OnPush` change detection.
Full tree + NgRx/socket wiring: [STRUCTURE.md](STRUCTURE.md).

## App structure

```
adminDashboard/src/app/
├── core/           guards (permission, auth), interceptors (auth, envelope, error),
│                   api service (typed, over HttpClient), auth store (user + permissions signal)
├── layout/         shell, sidebar built from GET /me/navigation, topbar
├── shared/         UI components, *hasPermission directive, money/date pipes
├── features/       one folder per domain (lazy-loaded routes), mirrors backend modules
│   ├── stores/         vendor approval, store profile
│   ├── categories/     attribute-schema editor (super_admin)
│   ├── products/       product editor: fields from category schema, variant matrix,
│   │                   modifier-group builder
│   ├── orders/         orders + sub-orders, status timeline
│   ├── payouts/        wallet, statements, release payouts (finance)
│   ├── roles/          role/permission editor, per-user overrides (super_admin)
│   ├── reviews/  integrations/  analytics/  settings/
└── app.routes.ts   top-level routes with guards + lazy loadChildren
```

## Permission-driven UI (the Angular pattern)

- On login, an **auth store** (signal-based service) loads `GET /me` (`permissions: string[]`)
  and `GET /me/navigation` (menu tree).
- **Sidebar** = render the returned tree. Nothing hard-coded.
- **Route guard** = `canMatch: [permissionGuard('product:read')]`; missing → 403 page. Guards
  read the auth store's permission signal.
- **Buttons/actions** = `*hasPermission="'payout:release'"` structural directive. Permission
  strings imported from `shared/`. (Remember: this is UX; the API still enforces — [conventions](../docs/07-CONVENTIONS.md).)

## The standout screen: dynamic product editor

Because products are category-driven ([03-DATA-MODEL.md](../docs/03-DATA-MODEL.md)):

1. Vendor picks a **category** → fetch its `attributeSchema` + `variantAxes`.
2. **Build a Reactive Form dynamically from the schema** — a generic component maps each
   `AttributeDef → FormControl` (string/number/enum/boolean/units, required, min/max). Validate
   with a Zod schema built from the same defs, wrapped as an Angular validator.
3. **Variant matrix builder** = a `FormArray` generated from `variantAxes` (size × color, or
   weight) → rows with price + stock + SKU. Grocery 500g/1000g and clothes S/M/L both use this.
4. **Modifier-group builder** = nested `FormArray` (food): groups (single/multi, min/max) with
   options + price deltas — pizza extra/double cheese.
5. Media upload. Save → backend re-validates against the category. One editor, every vendor type.

## Build order (tracks the [roadmap](../docs/06-ROADMAP.md))

- **P0** login, auth store, interceptors, permission-driven shell + sidebar + guards.
- **P1** categories (attribute-schema editor), stores/approval, **product editor** (the above).
- **P3–4** orders + sub-order management, status timeline, notifications view.
- **P5** wallet/payouts/statements, finance dashboard, refunds.
- **P6** roles & permission editor, per-user overrides, vendor-staff invites, integrations,
  analytics dashboards.

## Conventions

Typed API service (one interceptor unwraps the envelope); RxJS/signals for server state; forms
reuse `shared/` Zod schemas as validators; money/date via shared pipes; no business logic in
components — call services. See [07-CONVENTIONS.md](../docs/07-CONVENTIONS.md#frontend-conventions-both-apps--angular).
