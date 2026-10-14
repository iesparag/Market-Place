import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api/api_client.dart';
import '../core/auth/token_store.dart';
import '../core/socket/app_socket_service.dart';
import '../models/product.dart';
import '../models/address.dart';
import '../models/order.dart';
import '../models/festival.dart';
import '../models/app_notification.dart';
import 'catalog_repository.dart';
import 'checkout_repository.dart';
import 'geocode_repository.dart';
import 'payment_repository.dart';
import 'notifications_repository.dart';

// ── core ──────────────────────────────────────────────────────────────────
/// Loaded in main() and injected via ProviderScope override — lets us read the
/// cached theme synchronously at first frame (so the splash is already themed).
final sharedPrefsProvider = Provider<SharedPreferences>(
    (ref) => throw UnimplementedError('override sharedPrefsProvider in main()'));

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.read(tokenStoreProvider)));
final catalogRepoProvider = Provider<CatalogRepository>((ref) => CatalogRepository(ref.read(apiClientProvider)));
final checkoutRepoProvider = Provider<CheckoutRepository>((ref) => CheckoutRepository(ref.read(apiClientProvider)));
final paymentRepoProvider = Provider<PaymentRepository>((ref) => PaymentRepository(ref.read(apiClientProvider)));
final geocodeRepoProvider = Provider<GeocodeRepository>((ref) => GeocodeRepository(ref.read(apiClientProvider)));
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
final homeSectionsProvider = FutureProvider.autoDispose((ref) => ref.read(catalogRepoProvider).home());
final bannersProvider = FutureProvider.autoDispose((ref) => ref.read(catalogRepoProvider).banners());
final categoryTreeProvider = FutureProvider((ref) => ref.read(catalogRepoProvider).categoryTree());
final categoriesProvider = FutureProvider((ref) => ref.read(catalogRepoProvider).categories());
final vendorsProvider = FutureProvider.autoDispose((ref) => ref.read(catalogRepoProvider).stores());

final productProvider =
    FutureProvider.autoDispose.family<Product, String>((ref, slug) => ref.read(catalogRepoProvider).product(slug));
final storeProvider =
    FutureProvider.autoDispose.family<StorePageData, String>((ref, slug) => ref.read(catalogRepoProvider).store(slug));
