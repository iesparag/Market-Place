import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api/api_client.dart';
import '../core/auth/token_store.dart';
import '../models/product.dart';
import '../models/address.dart';
import '../models/order.dart';
import 'catalog_repository.dart';
import 'checkout_repository.dart';

// ── core ──────────────────────────────────────────────────────────────────
final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.read(tokenStoreProvider)));
final catalogRepoProvider = Provider<CatalogRepository>((ref) => CatalogRepository(ref.read(apiClientProvider)));
final checkoutRepoProvider = Provider<CheckoutRepository>((ref) => CheckoutRepository(ref.read(apiClientProvider)));

// ── authenticated data ─────────────────────────────────────────────────────
final addressesProvider = FutureProvider.autoDispose<List<Address>>((ref) => ref.read(checkoutRepoProvider).addresses());
final myOrdersProvider = FutureProvider.autoDispose<List<OrderModel>>((ref) => ref.read(checkoutRepoProvider).myOrders());

/// App launch config (version gate + ad content). Public — no auth.
final appConfigProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final data = await ref.read(apiClientProvider).get('/app/config');
  return (data as Map).cast<String, dynamic>();
});

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
