# Marketplace — Customer App (Flutter)

Multi-vendor customer app (BB/Blinkit-style). Consumes the **same backend API** as the web
customer site (`docs/09-FLUTTER-APP.md`). **Phase 1**: browse (home / catalog / product /
store / search), auth, and a local cart.

## First-time setup

This repo ships only `lib/` + `pubspec.yaml`. Generate the native platform folders once:

```bash
cd customer_app
flutter create --platforms=android,ios .   # adds android/ ios/ (skips existing lib & pubspec)
flutter pub get
flutter run                                  # on a device/emulator
```

> `flutter create` is non-destructive — it will NOT overwrite the existing `lib/` or `pubspec.yaml`.

## Configure the backend

`lib/core/config.dart` already points at the deployed Railway API. For **local dev**, use your
machine's **LAN IP** (not `localhost` — that's the phone itself):

```dart
static const apiBaseUrl = 'http://192.168.1.5:4000/api/v1';
static const socketUrl  = 'http://192.168.1.5:4000';
```

## What's implemented (Phase 1)

| Area | Status |
|---|---|
| Theme (brand colors matching web) | ✅ |
| Auth (JWT access+refresh, secure storage, 401 auto-refresh) | ✅ |
| Home (banners, departments, **admin landing sections**, featured stores) | ✅ |
| Categories drill-down | ✅ |
| Catalog (infinite scroll, filters, sort) | ✅ |
| Product detail (gallery, variants, veg mark, specs, code, related) | ✅ |
| Store page (cover, logo, about, catalog) | ✅ |
| Search typeahead (products + stores → redirect) | ✅ |
| Local cart (add / qty / persist) | ✅ |
| Login / register | ✅ |

## Next phases

- **Phase 2** — Cart → address picker (map) → checkout → place order (`POST /orders`) + orders list.
- **Phase 3** — Live order status (Socket.IO), **FCM push** (backend already ready), wishlist, reviews/Q&A.
- **Phase 4** — Payments (Razorpay/Stripe SDK), polish, offline cart.

## Structure

```
lib/
  core/      config, theme, api (dio+auth), auth, format
  models/    product, store, category, home, suggestion
  data/      catalog_repository, providers (Riverpod)
  features/  home, categories, catalog, product, store, search, cart, account, auth, shell
  shared/    widgets (product_card, veg_mark, shimmer, section_header)
```
