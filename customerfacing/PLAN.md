# Customer-Facing Website — Build Plan

> The storefront + checkout. **Angular + Angular SSR (`@angular/ssr`)** for SEO/SSR.
> Shared specs (don't duplicate): [data model](../docs/03-DATA-MODEL.md) ·
> [payments](../docs/05-PAYMENTS.md) · [conventions](../docs/07-CONVENTIONS.md).

## Why Angular + SSR (and the one tradeoff)

E-commerce lives or dies on SEO. Product/category pages must be **server-rendered /
prerendered** so Google indexes them and they load fast. We use **Angular SSR** (`@angular/ssr`,
built into modern Angular) with **hydration** and **prerendering (SSG)** — so the whole
platform stays on **one framework/skillset** (decision D8 in [01-OVERVIEW.md](../docs/01-OVERVIEW.md)).

**The honest tradeoff:** Angular SSR does not have Next.js-style built-in **ISR / on-demand
revalidation**. Our mitigation:
- **Prerender (SSG)** catalog/product pages at build; rebuild+redeploy on catalog changes, or
- **SSR behind a CDN cache** with a TTL + cache-purge on the product-update webhook.
Either gives fresh, indexable pages. Pick per scale; both documented so we don't re-decide.

## Stack

Angular + **`@angular/ssr`** + TS · Angular Router · **NgRx (Store/Effects/Entity)** for
cart/catalog/auth (persisted cart via hydration meta-reducer) + **signals** for live price/local
UI · **`TransferState`** (server fetch reused on client, no double-fetch) · **Socket.IO**
(browser-only, dispatches NgRx actions) · `NgOptimizedImage` for media · Angular Material /
PrimeNG or Tailwind · Zod schemas from `shared/`.
Full tree + SSR/NgRx/socket wiring: [STRUCTURE.md](STRUCTURE.md).

## Rendering strategy per page

| Page | Strategy | Why |
|------|----------|-----|
| Home / landing | Prerender (SSG) | fast, cacheable, rebuild on change |
| Category / search | SSR + CDN cache | SEO + fresh listings + filters |
| Product detail | Prerender (SSG) + cache-purge on update webhook | SEO; refresh when product changes |
| Cart / checkout / account | CSR (client-only route) | user-specific, no SEO needed |

## App structure

```
customerfacing/src/app/
├── core/            api service, cart store (signals + storage), auth, interceptors, seo service
├── layout/          header (search, cart), footer
├── pages/           routed pages (SSR/prerender configured per route)
│   ├── home/  category/  product/  search/
│   ├── cart/  checkout/  order/
│   └── account/ (login, orders, profile)
├── features/
│   ├── catalog/         product cards, filters from filterable attributes
│   ├── product/         variant selector, modifier selector, live price
│   ├── cart/            multi-vendor cart, per-store grouping
│   └── checkout/        address, payment (provider hosted fields), review
└── app.routes.ts    routes + render mode (server/prerender/client) per route
```

## The standout screen: product detail

Driven entirely by the product model in [03-DATA-MODEL.md](../docs/03-DATA-MODEL.md):

- **Variant selector** — render from `variants` / `variantAxes` (weight 500g/1000g, size×color).
  Selecting a variant sets base price + stock. Grocery, clothes, oil packs all use this.
- **Modifier selector** — render `modifierGroups` (single/multi, min/max, required); each option
  shows its `priceDelta`. Pizza extra cheese (+₹50) / double cheese (+₹90).
- **Live price** = a `computed()` signal: `variant.price + Σ selected modifier deltas`, updates
  as the user chooses. The server recomputes at add-to-cart and checkout — client price is display only.
- **Attributes** shown as a spec table; **filterable** attributes power category filters.

## Cart & checkout (multi-vendor)

- Cart (signal store, persisted) groups items **by store** (one cart, many vendors) — mirrors
  sub-orders.
- Checkout: collect address/contact → backend creates order + sub-orders + payment intent →
  render provider **hosted payment fields** (never touch card data) → confirm → webhook
  finalizes. Show per-vendor breakdown. See [05-PAYMENTS.md](../docs/05-PAYMENTS.md#order--money-lifecycle).
- Order tracking page reads sub-order status timelines.

## Customer auth

Separate from dashboard roles — customers register/login for orders, addresses, reviews. Same
backend `auth` module; role `customer`; no dashboard permissions.

## Build order (tracks the [roadmap](../docs/06-ROADMAP.md))

- **P0** Angular + SSR shell, layout, health, render-mode config.
- **P2** catalog (home/category/search SSR/prerender), **product detail** (variants + modifiers
  + live price), multi-vendor cart.
- **P3** checkout + payment (hosted fields), order confirmation/tracking.
- **P4** account (orders, tracking), reviews, transactional email touchpoints.
- **P6** promotions/coupons display, third-party (e.g. BookMyShow) product/booking surfaces.

## SEO & perf

`Title`/`Meta` services + Open Graph per route, JSON-LD `Product`/`Offer` structured data,
sitemap, `NgOptimizedImage`, hydration (no flicker), `TransferState` (no double-fetch), CDN
caching for SSR, Core Web Vitals budget.

## Conventions

Typed API service (interceptor unwraps envelope once), Zod from `shared/`, money/date via shared
pipes, no business logic in components. See
[07-CONVENTIONS.md](../docs/07-CONVENTIONS.md#frontend-conventions-both-apps--angular).
