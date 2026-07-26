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

  Future<List<HomeSection>> home() async {
    final data = await api.get('/catalog/home') as List;
    return data.map((e) => HomeSection.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Banner>> banners() async {
    final data = await api.get('/banners') as List;
    return data.map((e) => Banner.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<CatNode>> categoryTree() async {
    final data = await api.get('/catalog/category-tree') as List;
    return data.map((e) => CatNode.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<CategoryLite>> categories() async {
    final data = await api.get('/catalog/categories') as List;
    return data.map((e) => CategoryLite.fromJson(e as Map<String, dynamic>)).toList();
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
  }) async {
    final query = <String, dynamic>{'page': page, 'limit': limit};
    if (q != null && q.isNotEmpty) query['q'] = q;
    if (category != null && category.isNotEmpty) query['category'] = category;
    if (sort != null) query['sort'] = sort;
    if (priceMin != null) query['priceMin'] = priceMin;
    if (priceMax != null) query['priceMax'] = priceMax;
    if (ratingMin != null && ratingMin > 0) query['ratingMin'] = ratingMin;
    if (veg) query['veg'] = 'true';
    final data = await api.get('/catalog/products', query: query) as List;
    return data.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Product> product(String slug) async {
    final data = await api.get('/catalog/products/$slug') as Map<String, dynamic>;
    return Product.fromJson(data);
  }

  Future<StorePageData> store(String slug) async {
    final data = await api.get('/catalog/stores/$slug') as Map<String, dynamic>;
    return StorePageData(
      StoreProfile.fromJson(data['store'] as Map<String, dynamic>),
      (data['products'] as List?)?.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList() ?? [],
      (data['categoryTree'] as List?)?.map((e) => CatNode.fromJson(e as Map<String, dynamic>)).toList() ?? [],
    );
  }

  Future<List<Vendor>> stores() async {
    final data = await api.get('/catalog/stores') as List;
    return data.map((e) => Vendor.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Suggestion> suggest(String q) async {
    final data = await api.get('/search/suggest', query: {'q': q}) as Map<String, dynamic>;
    return Suggestion.fromJson(data);
  }
}
