import '../core/api/api_client.dart';
import '../core/config.dart';
import '../models/product.dart';
import '../models/store.dart';
import '../models/category.dart';
import '../models/home.dart';
import '../models/suggestion.dart';

class StorePageData {
  final StoreProfile profile;
  final List<Product> products;
  final List<CatNode> categoryTree;
  StorePageData(this.profile, this.products, this.categoryTree);
}

/// All public storefront reads. Maps 1:1 to the backend `/catalog`, `/search`, `/banners`.
class CatalogRepository {
  final ApiClient api;
  CatalogRepository(this.api);

  Future<List<HomeSection>> home({double? lat, double? lng}) async {
    final query =
        (lat != null && lng != null) ? {'lat': lat, 'lng': lng} : null;
    final data = await api.get('/catalog/home', query: query) as List;
    return data
        .map((e) => HomeSection.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<PromoBanner>> banners() async {
    final data = await api.get('/banners') as List;
    return data
        .map((e) => PromoBanner.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<CatNode>> categoryTree() async {
    final data = await api.get('/catalog/category-tree') as List;
    return data
        .map((e) => CatNode.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<CategoryLite>> categories() async {
    final data = await api.get('/catalog/categories') as List;
    return data
        .map((e) => CategoryLite.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Product>> products({
    String? q,
    String? category,
    String? sort,
    int? priceMin,
    int? priceMax,
    int? ratingMin,
    bool veg = false,
    int page = 1,
    int limit = Config.pageSize,
    List<String>? ids,
  }) async {
    final query = <String, dynamic>{'page': page, 'limit': limit};
    if (q != null && q.isNotEmpty) query['q'] = q;
    if (category != null && category.isNotEmpty) query['category'] = category;
    if (sort != null) query['sort'] = sort;
    if (priceMin != null) query['priceMin'] = priceMin;
    if (priceMax != null) query['priceMax'] = priceMax;
    if (ratingMin != null && ratingMin > 0) query['ratingMin'] = ratingMin;
    if (veg) query['veg'] = 'true';
    if (ids != null && ids.isNotEmpty) query['products'] = ids.join(',');
    final data = await api.get('/catalog/products', query: query) as List;
    return data
        .map((e) => Product.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Product> product(String slug) async {
    final data =
        await api.get('/catalog/products/$slug') as Map<String, dynamic>;
    return Product.fromJson(data);
  }

  /// "Frequently bought together" — co-purchase history from past orders (falls back
  /// to same-category products when a listing has too few orders to learn from).
  Future<List<Product>> frequentlyBoughtTogether(String productId) async {
    final data = await api.get('/catalog/products/$productId/related') as List;
    return data.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Resolves an order item's productId → its current slug + live price — used by the
  /// order-detail screen to let a past order's item link through to that product's
  /// current page (and to know whether the price has moved since). Throws (404, via
  /// ApiException) if the product's since been deactivated/removed — the caller shows
  /// "no longer available" rather than treating that as an unexpected error.
  Future<({String slug, int currentPrice})> productSlugById(
      String productId) async {
    final data = await api.get('/catalog/products/by-id/$productId')
        as Map<String, dynamic>;
    return (
      slug: data['slug'].toString(),
      currentPrice: (data['currentPrice'] as num?)?.toInt() ?? 0
    );
  }

  Future<StorePageData> store(String slug) async {
    final data = await api.get('/catalog/stores/$slug') as Map<String, dynamic>;
    return StorePageData(
      StoreProfile.fromJson(data['store'] as Map<String, dynamic>),
      (data['products'] as List?)
              ?.map((e) => Product.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      (data['categoryTree'] as List?)
              ?.map((e) => CatNode.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  Future<List<Vendor>> stores({double? lat, double? lng}) async {
    final query =
        (lat != null && lng != null) ? {'lat': lat, 'lng': lng} : null;
    final data = await api.get('/catalog/stores', query: query) as List;
    return data.map((e) => Vendor.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// "Now" tab — vendors open right now within instant-delivery range
  /// (env.NOW_RADIUS_KM on the backend, tighter than the general serviceable radius).
  /// No location → empty list, there's no meaningful "Now" without one.
  Future<List<Vendor>> nowStores({double? lat, double? lng}) async {
    if (lat == null || lng == null) return [];
    final data = await api
        .get('/catalog/stores/now', query: {'lat': lat, 'lng': lng}) as List;
    return data.map((e) => Vendor.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Suggestion> suggest(String q) async {
    final data = await api.get('/search/suggest', query: {'q': q})
        as Map<String, dynamic>;
    return Suggestion.fromJson(data);
  }
}
