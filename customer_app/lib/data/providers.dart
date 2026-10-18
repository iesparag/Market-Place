import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api/api_client.dart';
import '../core/auth/auth_controller.dart';
import '../core/auth/token_store.dart';
import '../core/location/device_location_service.dart';
import '../core/socket/app_socket_service.dart';
import '../core/theme/theme_mode_controller.dart';
import '../features/favourites/store_favourite_controller.dart';
import '../models/product.dart';
import '../models/store.dart';
import '../models/address.dart';
import '../models/order.dart';
import '../models/festival.dart';
import '../models/app_notification.dart';
import 'catalog_repository.dart';
import 'checkout_repository.dart';
import 'geocode_repository.dart';
import 'places_repository.dart';
import 'routing_repository.dart';
import 'payment_repository.dart';
import 'notifications_repository.dart';

// ── core ──────────────────────────────────────────────────────────────────
/// Loaded in main() and injected via ProviderScope override — lets us read the
/// cached theme synchronously at first frame (so the splash is already themed).
final sharedPrefsProvider = Provider<SharedPreferences>((ref) =>
    throw UnimplementedError('override sharedPrefsProvider in main()'));

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());
final themeModeProvider = StateNotifierProvider<ThemeModeController, ThemeMode>(
    (ref) => ThemeModeController(ref.read(sharedPrefsProvider)));
final deviceLocationServiceProvider =
    Provider<DeviceLocationService>((ref) => DeviceLocationService());

/// Resolved once per app session (autoDispose so permission changes are picked up on
/// next screen visit, not cached forever). Null means "no GPS" — every watcher below
/// treats that as "fall back to the saved/default address," never as an error.
final deviceLocationProvider =
    FutureProvider.autoDispose<({double lat, double lng})?>(
  (ref) => ref.read(deviceLocationServiceProvider).current(),
);
final apiClientProvider =
    Provider<ApiClient>((ref) => ApiClient(ref.read(tokenStoreProvider)));
final catalogRepoProvider = Provider<CatalogRepository>(
    (ref) => CatalogRepository(ref.read(apiClientProvider)));
final checkoutRepoProvider = Provider<CheckoutRepository>(
    (ref) => CheckoutRepository(ref.read(apiClientProvider)));
final paymentRepoProvider = Provider<PaymentRepository>(
    (ref) => PaymentRepository(ref.read(apiClientProvider)));
final geocodeRepoProvider = Provider<GeocodeRepository>(
    (ref) => GeocodeRepository(ref.read(apiClientProvider)));
final placesRepoProvider = Provider<PlacesRepository>(
    (ref) => PlacesRepository(ref.read(apiClientProvider)));
final routingRepoProvider = Provider<RoutingRepository>(
    (ref) => RoutingRepository(ref.read(apiClientProvider)));
final notificationsRepoProvider = Provider<NotificationsRepository>(
    (ref) => NotificationsRepository(ref.read(apiClientProvider)));

/// One instance for the app's lifetime — connects on login/restore, disconnects on
/// logout (see AuthController). Live push for the bell icon; REST is the fallback.
final appSocketProvider = Provider<AppSocketService>(
    (ref) => AppSocketService(ref.read(tokenStoreProvider)));

/// Which payment methods to offer (admin-configurable, so read it fresh).
final paymentConfigProvider = FutureProvider<PaymentConfig>(
    (ref) => ref.read(paymentRepoProvider).config());

/// Tax + delivery rules, so checkout shows the SAME total the server will charge.
final pricingSettingsProvider = FutureProvider<PricingSettings>((ref) async {
  final data = await ref.read(apiClientProvider).get('/settings');
  return PricingSettings.fromJson((data as Map).cast<String, dynamic>());
});

// ── authenticated data ─────────────────────────────────────────────────────
final addressesProvider = FutureProvider.autoDispose<List<Address>>(
    (ref) => ref.read(checkoutRepoProvider).addresses());

/// Explicitly selected shipping address ID (shared across Cart and Checkout).
/// Null means use the user's default saved address.
final activeAddressIdProvider = StateProvider<String?>((ref) => null);

/// Resolves the currently active Address object for delivery calculation across Cart & Checkout.
final activeDeliveryAddressProvider = Provider.autoDispose<Address?>((ref) {
  final addresses = ref.watch(addressesProvider).valueOrNull ?? const [];
  if (addresses.isEmpty) return null;
  final explicitId = ref.watch(activeAddressIdProvider);
  if (explicitId != null) {
    final match = addresses.where((a) => a.id == explicitId).firstOrNull;
    if (match != null) return match;
  }
  return addresses.where((a) => a.isDefault).firstOrNull ?? addresses.first;
});

final myOrdersProvider = FutureProvider.autoDispose<List<OrderModel>>(
    (ref) => ref.read(checkoutRepoProvider).myOrders());
final orderProvider = FutureProvider.autoDispose.family<OrderModel, String>(
    (ref, id) => ref.read(checkoutRepoProvider).order(id));

/// App launch config (version gate + ad content). Public — no auth.
final appConfigProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final data = await ref.read(apiClientProvider).get('/app/config');
  return (data as Map).cast<String, dynamic>();
});

/// The one festival live right now (or null) — admin-configured, public, no auth.
final festivalProvider =
    FutureProvider.autoDispose<FestivalModel?>((ref) async {
  final data = await ref.read(apiClientProvider).get('/festivals/active');
  return data == null
      ? null
      : FestivalModel.fromJson((data as Map).cast<String, dynamic>());
});

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>(
    (ref) => ref.read(notificationsRepoProvider).list());
final unreadCountProvider = FutureProvider.autoDispose<int>(
    (ref) => ref.read(notificationsRepoProvider).unreadCount());

/// The location that actually drives "near me" everywhere in the app (home feed,
/// nearby vendors, the Now tab) — a signed-in customer's default saved address when
/// they have one, falling back to live GPS otherwise. This is the explicit fix for "I'm
/// at address A right now but want to shop for delivery to address B": picking B as the
/// default (addresses_screen.dart) re-centers every nearby search on B, not on wherever
/// the phone's GPS happens to be. Depends on addressesProvider (not a one-off read), so
/// changing the default live-updates every watcher below without an app restart.
final effectiveLocationProvider =
    FutureProvider.autoDispose<({double lat, double lng})?>((ref) async {
  final user = ref.watch(authProvider);
  if (user != null) {
    final addresses = await ref.watch(addressesProvider.future);
    for (final a in addresses) {
      if (a.isDefault && a.lat != null && a.lng != null)
        return (lat: a.lat!, lng: a.lng!);
    }
  }
  return ref.watch(deviceLocationProvider.future);
});

// ── data (auto-fetch) ─────────────────────────────────────────────────────
/// Waits on the effective location (resolves fast — null on no-permission/timeout/no
/// default address, never hangs the home feed) so "Shops near you" is geo-filtered with
/// a real ETA from the very first load, not just on a later refresh.
final homeSectionsProvider = FutureProvider.autoDispose((ref) async {
  final loc = await ref.watch(effectiveLocationProvider.future);
  return ref.read(catalogRepoProvider).home(lat: loc?.lat, lng: loc?.lng);
});
final bannersProvider = FutureProvider.autoDispose(
    (ref) => ref.read(catalogRepoProvider).banners());
final categoryTreeProvider =
    FutureProvider((ref) => ref.read(catalogRepoProvider).categoryTree());
final vendorsProvider = FutureProvider.autoDispose((ref) async {
  final loc = await ref.watch(effectiveLocationProvider.future);
  return ref.read(catalogRepoProvider).stores(lat: loc?.lat, lng: loc?.lng);
});

/// Whether the bottom-nav "Now" tab should even appear — only for a customer whose
/// area actually has vendors (reuses the same nearby-vendors fetch as the home feed,
/// no extra request). Defaults to hidden while loading/unknown rather than flashing the
/// tab on then pulling it away: a city with zero vendors should never see "Now" at all.
final nowTabVisibleProvider = Provider.autoDispose<bool>((ref) {
  return ref
      .watch(vendorsProvider)
      .maybeWhen(data: (list) => list.isNotEmpty, orElse: () => false);
});

/// "Now" tab — vendors open right now within instant-delivery range of the EFFECTIVE
/// location (default address if set, else GPS) — so switching your default address
/// switches which city/area "Now" searches too. No location → empty (the screen treats
/// that as "we need your location," not "nothing's open").
final nowStoresProvider = FutureProvider.autoDispose((ref) async {
  final loc = await ref.watch(effectiveLocationProvider.future);
  return ref.read(catalogRepoProvider).nowStores(lat: loc?.lat, lng: loc?.lng);
});

/// Live "Deliver to: <area>" label for the home screen's location bar — reverse-geocoded
/// from device GPS via the existing FREE `/geocode/reverse` (Nominatim), deliberately not
/// Google Places: this fires on every app open and has no billing reason to use Places.
final liveLocationLabelProvider =
    FutureProvider.autoDispose<String?>((ref) async {
  final loc = await ref.watch(deviceLocationProvider.future);
  if (loc == null) return null;
  final hit = await ref.read(geocodeRepoProvider).reverse(loc.lat, loc.lng);
  if (hit == null) return null;
  return hit.city.isNotEmpty
      ? '${hit.line1.isNotEmpty ? '${hit.line1}, ' : ''}${hit.city}'
      : hit.label;
});

final productProvider = FutureProvider.autoDispose.family<Product, String>(
    (ref, slug) => ref.read(catalogRepoProvider).product(slug));
final frequentlyBoughtTogetherProvider = FutureProvider.autoDispose
    .family<List<Product>, String>((ref, productId) =>
        ref.read(catalogRepoProvider).frequentlyBoughtTogether(productId));

/// Loyalty points balance — shown on the account screen and used to seed the
/// checkout redeem toggle.
final loyaltyBalanceProvider =
    FutureProvider.autoDispose<({int points, int valuePaise})>(
        (ref) => ref.read(checkoutRepoProvider).loyaltyBalance());

/// Referral code + invite stats for the "Invite a friend" screen.
final referralInfoProvider = FutureProvider.autoDispose<
    ({
      String code,
      int rewardPoints,
      int rewardValuePaise,
      int referredCount,
      int rewardedCount
    })>((ref) => ref.read(checkoutRepoProvider).referralInfo());
final storeProvider = FutureProvider.autoDispose.family<StorePageData, String>(
    (ref, slug) => ref.read(catalogRepoProvider).store(slug));

/// "Order again" home-screen row — distinct products from this customer's past paid
/// orders, most-recent first, resolved against live product data server-side.
final recentProductsProvider =
    FutureProvider.autoDispose<List<Product>>((ref) async {
  final user = ref.watch(authProvider);
  if (user == null) return [];
  final data =
      await ref.read(apiClientProvider).get('/orders/recent-products') as List;
  return data.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
});

/// "Recently viewed" home-screen row — products this customer opened but hasn't
/// necessarily bought, most-recently-viewed first. A view is recorded by
/// recordProductView() from the product screen; this just reads them back.
final recentlyViewedProvider =
    FutureProvider.autoDispose<List<Product>>((ref) async {
  final user = ref.watch(authProvider);
  if (user == null) return [];
  final data =
      await ref.read(apiClientProvider).get('/recently-viewed') as List;
  return data.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
});

/// Fire-and-forget: tell the backend this product was opened. Never throws —
/// a failed view-tracking call must not disrupt browsing.
void recordProductView(ApiClient api, String productId) {
  api.post('/recently-viewed', body: {'productId': productId}).catchError((_) {});
}

/// Full store data for favourited stores (ids come from favouriteStoresProvider in
/// features/favourites/store_favourite_controller.dart) — same two-provider split as
/// the product wishlist (ids-set controller + a full-data FutureProvider).
final favouriteStoreVendorsProvider =
    FutureProvider.autoDispose<List<Vendor>>((ref) async {
  final user = ref.watch(authProvider);
  // Re-run whenever the ids set changes (e.g. toggling a heart elsewhere) — without
  // this the bottom nav's IndexedStack keeps this provider alive indefinitely and a
  // newly favourited store never appears until the screen is torn down and rebuilt.
  ref.watch(favouriteStoresProvider);
  if (user == null) return [];
  final data =
      await ref.read(apiClientProvider).get('/favourite-stores') as List;
  return data.map((e) => Vendor.fromJson(e as Map<String, dynamic>)).toList();
});
