import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api/api_client.dart';
import '../core/auth/auth_controller.dart';
import '../core/auth/token_store.dart';
import '../core/location/device_location_service.dart';
import '../core/socket/app_socket_service.dart';
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
final sharedPrefsProvider = Provider<SharedPreferences>(
    (ref) => throw UnimplementedError('override sharedPrefsProvider in main()'));

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());
final deviceLocationServiceProvider = Provider<DeviceLocationService>((ref) => DeviceLocationService());

/// Resolved once per app session (autoDispose so permission changes are picked up on
/// next screen visit, not cached forever). Null means "no GPS" — every watcher below
/// treats that as "fall back to the saved/default address," never as an error.
final deviceLocationProvider = FutureProvider.autoDispose<({double lat, double lng})?>(
  (ref) => ref.read(deviceLocationServiceProvider).current(),
);
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.read(tokenStoreProvider)));
final catalogRepoProvider = Provider<CatalogRepository>((ref) => CatalogRepository(ref.read(apiClientProvider)));
final checkoutRepoProvider = Provider<CheckoutRepository>((ref) => CheckoutRepository(ref.read(apiClientProvider)));
final paymentRepoProvider = Provider<PaymentRepository>((ref) => PaymentRepository(ref.read(apiClientProvider)));
final geocodeRepoProvider = Provider<GeocodeRepository>((ref) => GeocodeRepository(ref.read(apiClientProvider)));
final placesRepoProvider = Provider<PlacesRepository>((ref) => PlacesRepository(ref.read(apiClientProvider)));
final routingRepoProvider = Provider<RoutingRepository>((ref) => RoutingRepository(ref.read(apiClientProvider)));
final notificationsRepoProvider = Provider<NotificationsRepository>((ref) => NotificationsRepository(ref.read(apiClientProvider)));

/// One instance for the app's lifetime — connects on login/restore, disconnects on
/// logout (see AuthController). Live push for the bell icon; REST is the fallback.
final appSocketProvider = Provider<AppSocketService>((ref) => AppSocketService(ref.read(tokenStoreProvider)));


/// Which payment methods to offer (admin-configurable, so read it fresh).
final paymentConfigProvider = FutureProvider<PaymentConfig>((ref) => ref.read(paymentRepoProvider).config());

/// Tax + delivery rules, so checkout shows the SAME total the server will charge.
final pricingSettingsProvider = FutureProvider<PricingSettings>((ref) async {
  final data = await ref.read(apiClientProvider).get('/settings');
  return PricingSettings.fromJson((data as Map).cast<String, dynamic>());
});

// ── authenticated data ─────────────────────────────────────────────────────
final addressesProvider = FutureProvider.autoDispose<List<Address>>((ref) => ref.read(checkoutRepoProvider).addresses());
final myOrdersProvider = FutureProvider.autoDispose<List<OrderModel>>((ref) => ref.read(checkoutRepoProvider).myOrders());
final orderProvider = FutureProvider.autoDispose.family<OrderModel, String>((ref, id) => ref.read(checkoutRepoProvider).order(id));

/// App launch config (version gate + ad content). Public — no auth.
final appConfigProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final data = await ref.read(apiClientProvider).get('/app/config');
  return (data as Map).cast<String, dynamic>();
});

/// The one festival live right now (or null) — admin-configured, public, no auth.
final festivalProvider = FutureProvider.autoDispose<FestivalModel?>((ref) async {
  final data = await ref.read(apiClientProvider).get('/festivals/active');
  return data == null ? null : FestivalModel.fromJson((data as Map).cast<String, dynamic>());
});

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>(
    (ref) => ref.read(notificationsRepoProvider).list());
final unreadCountProvider = FutureProvider.autoDispose<int>(
    (ref) => ref.read(notificationsRepoProvider).unreadCount());

// ── data (auto-fetch) ─────────────────────────────────────────────────────
/// Waits on device location (resolves fast — null on no-permission/timeout, never
/// hangs the home feed) so "Shops near you" is geo-filtered with a real ETA from the
/// very first load, not just on a later refresh.
final homeSectionsProvider = FutureProvider.autoDispose((ref) async {
  final loc = await ref.watch(deviceLocationProvider.future);
  return ref.read(catalogRepoProvider).home(lat: loc?.lat, lng: loc?.lng);
});
final bannersProvider = FutureProvider.autoDispose((ref) => ref.read(catalogRepoProvider).banners());
final categoryTreeProvider = FutureProvider((ref) => ref.read(catalogRepoProvider).categoryTree());
final categoriesProvider = FutureProvider((ref) => ref.read(catalogRepoProvider).categories());
final vendorsProvider = FutureProvider.autoDispose((ref) async {
  final loc = await ref.watch(deviceLocationProvider.future);
  return ref.read(catalogRepoProvider).stores(lat: loc?.lat, lng: loc?.lng);
});

/// Live "Deliver to: <area>" label for the home screen's location bar — reverse-geocoded
/// from device GPS via the existing FREE `/geocode/reverse` (Nominatim), deliberately not
/// Google Places: this fires on every app open and has no billing reason to use Places.
final liveLocationLabelProvider = FutureProvider.autoDispose<String?>((ref) async {
  final loc = await ref.watch(deviceLocationProvider.future);
  if (loc == null) return null;
  final hit = await ref.read(geocodeRepoProvider).reverse(loc.lat, loc.lng);
  if (hit == null) return null;
  return hit.city.isNotEmpty ? '${hit.line1.isNotEmpty ? '${hit.line1}, ' : ''}${hit.city}' : hit.label;
});

final productProvider =
    FutureProvider.autoDispose.family<Product, String>((ref, slug) => ref.read(catalogRepoProvider).product(slug));
final storeProvider =
    FutureProvider.autoDispose.family<StorePageData, String>((ref, slug) => ref.read(catalogRepoProvider).store(slug));

/// "Order again" home-screen row — distinct products from this customer's past paid
/// orders, most-recent first, resolved against live product data server-side.
final recentProductsProvider = FutureProvider.autoDispose<List<Product>>((ref) async {
  final user = ref.watch(authProvider);
  if (user == null) return [];
  final data = await ref.read(apiClientProvider).get('/orders/recent-products') as List;
  return data.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
});

/// Full store data for favourited stores (ids come from favouriteStoresProvider in
/// features/favourites/store_favourite_controller.dart) — same two-provider split as
/// the product wishlist (ids-set controller + a full-data FutureProvider).
final favouriteStoreVendorsProvider = FutureProvider.autoDispose<List<Vendor>>((ref) async {
  final user = ref.watch(authProvider);
  if (user == null) return [];
  final data = await ref.read(apiClientProvider).get('/favourite-stores') as List;
  return data.map((e) => Vendor.fromJson(e as Map<String, dynamic>)).toList();
});
