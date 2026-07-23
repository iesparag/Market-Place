# Admin Dashboard — Scalable Folder Structure (Angular + NgRx)

> Full tree for the Angular admin SPA. Read with: [structure master](../docs/08-STRUCTURE.md)
> (NgRx + socket patterns) · [build plan](PLAN.md) · [rbac](../docs/04-RBAC.md).

## Full tree

```
adminDashboard/
├── src/
│   ├── main.ts
│   ├── index.html
│   ├── styles/                      # global styles, theme tokens
│   ├── environments/                # environment.ts / .prod.ts (API + socket URLs)
│   │
│   ├── app/
│   │   ├── app.component.ts
│   │   ├── app.config.ts            # provideRouter, provideStore, provideEffects,
│   │   │                            #   provideHttpClient(withInterceptors), provideRouterStore
│   │   ├── app.routes.ts            # top-level lazy routes + canMatch permission guards
│   │   │
│   │   ├── core/                    # singletons, provided once
│   │   │   ├── guards/              # auth.guard, permission.guard, unsavedChanges.guard
│   │   │   ├── interceptors/        # auth (attach token), envelope (unwrap ApiResponse),
│   │   │   │                        #   error (toast + 401 refresh), loading
│   │   │   ├── services/            # api.service (typed HttpClient), socket.service (→ dispatch),
│   │   │   │                        #   auth.service, token.service, storage, notification, upload
│   │   │   └── models/              # cross-app models (re-export @app/shared types)
│   │   │
│   │   ├── layout/                  # shell.component (sidebar + topbar + <router-outlet>)
│   │   │   ├── sidebar/             # renders GET /me/navigation tree
│   │   │   ├── topbar/  breadcrumbs/  notifications-bell/ (socket-driven)
│   │   │
│   │   ├── store/                   # ROOT store (provideStore in app.config)
│   │   │   ├── index.ts             # rootReducers + meta-reducers (hydration, logout-reset)
│   │   │   ├── auth/                # state, actions, reducer, effects, selectors, facade
│   │   │   ├── permissions/         # effective permissions + nav tree
│   │   │   ├── ui/                  # loading, toasts, theme, modals
│   │   │   └── router/              # @ngrx/router-store bindings
│   │   │
│   │   ├── shared/                  # reusable, no business logic
│   │   │   ├── ui/                  # buttons, table, data-grid, modal, form-field, empty-state
│   │   │   ├── directives/         # *hasPermission, *hasRole, autofocus
│   │   │   ├── pipes/               # money, date, status-badge
│   │   │   ├── validators/         # zodValidator() bridge (shared Zod → Angular validator)
│   │   │   └── models/
│   │   │
│   │   └── features/                # ★ one lazy folder per domain (feature store loaded on demand)
│   │       ├── dashboard/           # KPIs, charts (scoped by permissions)
│   │       ├── stores/              # vendor approval + profiles
│   │       ├── staff/               # vendor staff invites + permissions
│   │       ├── categories/          # attribute-schema editor
│   │       ├── products/            # ← detailed anatomy below
│   │       ├── inventory/           # stock, low-stock (socket alerts)
│   │       ├── orders/              # orders + sub-orders, live status (socket)
│   │       ├── coupons/  reviews/  customers/
│   │       ├── payouts/  wallet/  commissions/       # finance
│   │       ├── returns/  support/   # tickets/chat (socket)
│   │       ├── roles/               # role/permission editor (super_admin)
│   │       ├── integrations/  cms/  analytics/  settings/  notifications/
│   │       └── ...
│   │
├── angular.json  tsconfig*.json  package.json  .eslintrc.json
```

## Anatomy of one feature (every `features/<x>/` looks like this)

```
features/products/
├── products.routes.ts        # provideState(productsFeature) + provideEffects(ProductsEffects)
│                             #   → NgRx state is LAZY-loaded with the feature (scalability lever)
├── pages/                    # routed containers: list, detail, create-edit
├── components/               # presentational: variant-matrix, modifier-builder,
│                             #   attribute-schema-form (renders fields from category schema)
├── services/
│   └── products.api.ts       # typed HttpClient calls (returns shared DTO types)
├── store/                    # ★ the 6-file NgRx unit (see 08-STRUCTURE)
│   ├── products.state.ts     #   @ngrx/entity adapter for the list
│   ├── products.actions.ts
│   ├── products.reducer.ts
│   ├── products.effects.ts   #   API + toasts + navigation + socket-join
│   ├── products.selectors.ts
│   └── products.facade.ts    #   components inject THIS, never Store directly
└── models/
```

## How the pieces connect

- **Login** → `auth.effects` calls api → stores user + `permissions` + nav tree in root store.
- **Sidebar** reads the nav tree from the `permissions` store slice (server-generated). Route
  access via `canMatch: [permissionGuard('order:read')]`; buttons via `*hasPermission`.
- **Server state** → components call a **facade** → facade dispatches → effects hit
  `*.api.ts` → reducer (via `@ngrx/entity`) updates → selectors feed the template.
- **Realtime** → `core/services/socket.service` listens (typed via `@app/shared/events`) and
  dispatches actions (e.g. `OrdersActions.statusPushed`, `InventoryActions.lowStock`) → the UI
  updates through the same NgRx pipeline. Notifications bell + live order board are socket-fed.
- **Forms** → Reactive Forms; validation reuses `shared/` Zod schemas via `zodValidator()`.
- **Local UI state** (open/closed, hovered) → component `signals`, not the store.
