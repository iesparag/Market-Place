# Customer Storefront — Scalable Folder Structure (Angular SSR + NgRx)

> Full tree for the Angular storefront with SSR. Read with: [structure master](../docs/08-STRUCTURE.md)
> (NgRx + socket + SSR patterns) · [build plan](PLAN.md) · [data model](../docs/03-DATA-MODEL.md).

## Full tree

```
customerfacing/
├── src/
│   ├── main.ts                      # browser bootstrap
│   ├── main.server.ts               # server bootstrap
│   ├── server.ts                    # express engine for Angular SSR (@angular/ssr)
│   ├── index.html   styles/   environments/
│   │
│   ├── app/
│   │   ├── app.component.ts
│   │   ├── app.config.ts            # provideRouter(withComponentInputBinding), provideStore,
│   │   │                            #   provideEffects, provideClientHydration, provideHttpClient
│   │   ├── app.config.server.ts     # server-only providers
│   │   ├── app.routes.ts            # routes + RenderMode per route (Server/Prerender/Client)
│   │   │
│   │   ├── core/
│   │   │   ├── services/            # api.service, socket.service (BROWSER-ONLY, isPlatformBrowser),
│   │   │   │                        #   cart.service, auth.service, seo.service (Title/Meta+JSON-LD),
│   │   │   │                        #   storage (SSR-safe), transfer-state helpers
│   │   │   ├── interceptors/        # auth, envelope, error, (server base-url)
│   │   │   └── guards/              # auth.guard (account pages)
│   │   │
│   │   ├── layout/                  # header (search + cart-drawer), footer, mega-menu
│   │   │
│   │   ├── store/                   # ROOT store
│   │   │   ├── index.ts             # meta-reducers (hydration: persist cart; logout-reset)
│   │   │   ├── cart/                # multi-vendor cart (persisted, grouped by store)
│   │   │   ├── auth/                # customer session
│   │   │   ├── catalog/             # filters, facets, recently-viewed
│   │   │   └── ui/                  # toasts, drawers, loading
│   │   │
│   │   ├── shared/                  # ui/, pipes/ (money,date), directives/, validators/ (zod bridge)
│   │   │
│   │   └── features/                # ★ lazy feature folders (same anatomy as admin)
│   │       ├── home/                # SSG/prerender; homepage blocks from CMS
│   │       ├── catalog/             # category + search pages (SSR/CDN); filters from attributes
│   │       ├── product/             # detail: variant selector + modifier selector + live price
│   │       ├── cart/                # cart page/drawer (client)
│   │       ├── checkout/            # address → payment (hosted fields) → review (client)
│   │       ├── account/             # login, profile, addresses (client, guarded)
│   │       ├── orders/              # order history + live tracking (socket)
│   │       ├── wishlist/            # favorites
│   │       ├── reviews/             # write/read reviews
│   │       └── support/            # help, chat (socket)
│   │
├── angular.json  tsconfig*.json  package.json
```

## Anatomy of one feature (`features/product/`)

```
features/product/
├── product.routes.ts         # RenderMode.Prerender (+ getPrerenderParams) or Server; provideState/Effects
├── pages/                    # product-detail.page.ts (uses TransferState to reuse SSR fetch)
├── components/               # variant-selector, modifier-selector, price-box (computed signal),
│                             #   gallery, add-to-cart, spec-table (attributes), reviews-list
├── services/
│   └── product.api.ts
├── store/                    # 6-file NgRx unit (product-by-slug, related, reviews)
└── models/
```

## SSR + NgRx + sockets — the connections that matter

- **Render mode per route** in `*.routes.ts`: `Prerender` (home, product, category), `Server`
  (dynamic search) behind CDN, `Client` (cart, checkout, account). See [PLAN.md](PLAN.md).
- **No double fetch**: server fetch stores data in **`TransferState`**; the browser reads it on
  hydration instead of re-calling the API. Wrap this in `core/services`.
- **NgRx runs on server + client**; hydration meta-reducer restores the persisted **cart** on
  the browser so a guest cart survives reloads (persist client-side only, SSR-safe storage).
- **Sockets are browser-only**: `socket.service` guards with `isPlatformBrowser`, connects in
  `afterNextRender`. Used on **order tracking** (live status + rider location) and **support
  chat**; inbound events dispatch NgRx actions like every other update.
- **SEO** lives in `core/services/seo.service` (per-route Title/Meta/OG + JSON-LD
  `Product`/`Offer`) + `NgOptimizedImage` + sitemap. See [PLAN.md](PLAN.md#seo--perf).
- **Live price** is a `computed()` signal in the price-box component
  (`variant.price + Σ modifier deltas`); server re-checks at cart + checkout.
