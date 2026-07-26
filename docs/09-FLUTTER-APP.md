# 09 — Flutter Customer App (BB / Blinkit–style)

> Native mobile customer app for the marketplace. It is **just another client** of the
> existing backend REST API — no backend rewrite. This doc is the build plan of record.

## Goal

A polished, multi-vendor customer app (Android + iOS) with **all the web storefront
functionality**, in a Blinkit / BigBasket / Myntra-style UI: bottom-nav, department grids,
fast search, cart, location-based delivery, live order tracking, push notifications.

## Why it just works (architecture)

The backend is a **stateless REST + Socket.IO API** already consumed by two Angular apps.
Flutter is a third client hitting the **same endpoints**. Key facts:

- **No CORS** on native apps — the browser-only restriction doesn't apply.
- **Auth is JWT** (access + refresh) — mobile stores tokens in secure storage, same refresh flow.
- **Realtime** = Socket.IO — Flutter has `socket_io_client`.
- **Push (FCM)** — backend `firebase-admin` + `POST /notifications/register-device` are **already built** for exactly this app.
- **Images** = Cloudinary URLs — load directly.
- **The one gap:** shared TypeScript types don't cross into Dart → we hand-write **Dart models** per API response (one-time, normal).

## Tech stack

| Concern | Choice | Web equivalent |
|---|---|---|
| Language / SDK | Dart + Flutter (stable) | — |
| State management | **Riverpod** | NgRx |
| HTTP | **dio** (interceptors for auth + refresh) | ApiService + interceptor |
| Routing | **go_router** (deep links, guards) | Angular Router |
| Secure token storage | `flutter_secure_storage` | localStorage |
| Realtime | `socket_io_client` | socket.io-client |
| Push | `firebase_messaging` + `firebase_core` | (backend FCM ready) |
| Local cart persistence | `hive` or `shared_preferences` | NgRx + localStorage meta-reducer |
| Maps / location | `google_maps_flutter` **or** `flutter_map` (OSM, free) | Leaflet + Nominatim |
| Images | `cached_network_image` | `<img>` |
| Payments (later) | Razorpay Flutter SDK / Stripe SDK | PaymentProvider adapter |

## Folder structure

```
customer_app/
├─ pubspec.yaml
└─ lib/
   ├─ main.dart
   ├─ app.dart                      # MaterialApp.router + theme
   ├─ router.dart                   # go_router routes + auth guard
   ├─ core/
   │  ├─ config.dart                # API_BASE_URL (Railway), socket URL
   │  ├─ api/
   │  │  ├─ dio_client.dart         # dio + auth + refresh interceptor
   │  │  └─ api_result.dart         # envelope unwrap { ok, data, error }
   │  ├─ auth/
   │  │  ├─ auth_repository.dart     # login/register/refresh/otp
   │  │  ├─ auth_controller.dart     # Riverpod StateNotifier
   │  │  └─ token_store.dart         # secure storage
   │  ├─ socket/socket_service.dart  # order status, notifications
   │  └─ theme/theme.dart            # brand colors, typography
   ├─ models/                        # Dart models (mirror API responses)
   │  ├─ product.dart  store.dart  category.dart  cart_line.dart
   │  ├─ order.dart    address.dart  home_section.dart  suggestion.dart
   ├─ features/
   │  ├─ home/          # departments, admin sections, banners, featured shops
   │  ├─ catalog/       # filters, infinite scroll, sort
   │  ├─ search/        # typeahead (/search/suggest) → product/store
   │  ├─ product/       # detail: variants, veg mark, specs, reviews, FAQ
   │  ├─ store/         # vendor storefront (cover, about, its catalog)
   │  ├─ cart/          # local cart, qty stepper, per-vendor grouping
   │  ├─ checkout/      # address picker + map, place order
   │  ├─ orders/        # list + live status (socket)
   │  ├─ account/       # profile, addresses, wishlist
   │  └─ notifications/ # bell list + FCM handling
   └─ shared/widgets/   # ProductCard, VegMark, PriceTag, Rating, etc.
```

## Screens (BB / Blinkit style)

- **Bottom nav (4 tabs):** Home · Categories · Cart · Account
- **Home:** location/delivery bar on top → search bar → banners carousel → "Shop by department" grid → admin-composed sections (featured products / featured shops)
- **Categories:** department → sub → leaf drill-down (grid, big icons)
- **Catalog / listing:** filters sheet (category, price, rating, veg-only), sort, infinite scroll
- **Product detail:** image gallery, veg/non-veg mark, variant picker (size/color/weight), price, add-to-cart, specs, reviews, Q&A, product code
- **Store page:** cover carousel + logo + about + store-scoped catalog
- **Cart:** per-vendor grouping, qty steppers, coupon, subtotal → checkout
- **Checkout:** saved addresses + add new (map pin + search), place order
- **Orders:** list + detail with **live status** (socket) + re-order
- **Account:** profile, addresses, wishlist, orders, become-a-vendor link
- **Search:** full-screen typeahead → tap product/store → navigate

## API mapping (all existing endpoints)

| Screen / action | Method + endpoint |
|---|---|
| Login / register / refresh / OTP | `POST /auth/login` · `/register` · `/refresh` · `/send-otp` · `/verify-otp` |
| Forgot / reset password | `POST /auth/forgot-password` · `/reset-password` |
| Home banners | `GET /banners` |
| Home sections (CMS) | `GET /catalog/home` |
| Department tree | `GET /catalog/category-tree` |
| Catalog listing | `GET /catalog/products?q=&category=&sort=&priceMin=&priceMax=&ratingMin=&veg=&page=&limit=` |
| Product detail | `GET /catalog/products/:slug` |
| Store page | `GET /catalog/stores/:slug` · all stores `GET /catalog/stores` |
| **Search typeahead** | `GET /search/suggest?q=` |
| Cart | **client-side** (local, like web) until checkout |
| Place order | `POST /orders` · list `GET /orders` · detail `GET /orders/:id` |
| Addresses | `GET/POST/PATCH/DELETE /addresses` |
| Wishlist | `GET/POST/DELETE /wishlist` |
| Reviews / Q&A | `/reviews` · `/faq` |
| Coupons | `/coupons` (validate at checkout) |
| Profile | `GET /me` · `PATCH /me` |
| **Register device (push)** | `POST /notifications/register-device` |
| Notifications list | `GET /notifications` |

## Cross-cutting flows

**Auth + refresh (dio interceptor):**
1. Attach `Authorization: Bearer <access>` to every request.
2. On `401` → call `POST /auth/refresh` with the refresh token → retry the original request once.
3. Refresh fails → clear tokens → route to login. (Mirror of the Angular interceptor.)

**Realtime (socket):**
- Connect after login with the access token; auto-join user room server-side.
- Listen for `ORDER_STATUS_UPDATED` → update the order screen live; `NOTIFICATION_NEW` → bell + local toast.

**Push (FCM) — backend already ready:**
1. `firebase_messaging` gets the device token.
2. `POST /notifications/register-device { token }`.
3. Backend sends via `firebase-admin` on order events / admin broadcasts (already wired).
4. Handle foreground/background/terminated taps → deep-link into the app.

**Config:** `core/config.dart` → `apiBaseUrl = https://<railway>/api/v1`, `socketUrl = https://<railway>`. (Dev: point at localhost.)

## Backend changes needed

**Almost none.** Everything above already exists. Possible small additions later:
- A `POST /orders` payment-intent step when real payments go live (PaymentProvider).
- CORS is irrelevant for mobile, so no change.

## Build phases

| Phase | Deliverable |
|---|---|
| **1** | Project scaffold + theme + dio/auth/refresh + login + Home (banners, departments, sections) + Catalog + Product detail |
| **2** | Cart (local) + Address picker (map) + Checkout + Place order |
| **3** | Orders list + live status (socket) + Push (FCM register + handle) + Search typeahead + Wishlist |
| **4** | Polish: bottom-nav, Blinkit-style UI, skeletons, empty states, error handling, offline cart |

## Running (workflow)

Code is generated here; **build/run needs Flutter SDK on your machine**:
```bash
cd customer_app
flutter pub get
flutter run           # device/emulator
```
Point `core/config.dart` at the Railway API. For FCM: add `google-services.json` (Android) / `GoogleService-Info.plist` (iOS) from the same Firebase project as the backend.
