int _int(dynamic v) => v is num ? v.toInt() : 0;

class SuggestProduct {
  final String id;
  final String title;
  final String slug;
  final String? code;
  final String? image;
  final int minPrice;
  final String? storeName;
  SuggestProduct({required this.id, required this.title, required this.slug, this.code, this.image, required this.minPrice, this.storeName});
  factory SuggestProduct.fromJson(Map<String, dynamic> j) => SuggestProduct(
        id: (j['_id'] ?? '').toString(),
        title: j['title']?.toString() ?? '',
        slug: j['slug']?.toString() ?? '',
        code: j['code']?.toString(),
        image: j['image']?.toString(),
        minPrice: _int(j['minPrice']),
        storeName: j['storeName']?.toString(),
      );
}

class SuggestStore {
  final String id;
  final String name;
  final String slug;
  final String? logo;
  SuggestStore({required this.id, required this.name, required this.slug, this.logo});
  factory SuggestStore.fromJson(Map<String, dynamic> j) => SuggestStore(
        id: (j['_id'] ?? '').toString(),
        name: j['name']?.toString() ?? '',
        slug: j['slug']?.toString() ?? '',
        logo: j['logo']?.toString(),
      );
}

class SuggestCategory {
  final String id;
  final String name;
  final String slug;
  SuggestCategory({required this.id, required this.name, required this.slug});
  factory SuggestCategory.fromJson(Map<String, dynamic> j) => SuggestCategory(
        id: (j['_id'] ?? '').toString(),
        name: j['name']?.toString() ?? '',
        slug: j['slug']?.toString() ?? '',
      );
}

class Suggestion {
  final List<SuggestProduct> products;
  final List<SuggestStore> stores;
  final List<SuggestCategory> categories;
  Suggestion({required this.products, required this.stores, this.categories = const []});
  factory Suggestion.fromJson(Map<String, dynamic> j) => Suggestion(
        products: (j['products'] as List?)?.map((e) => SuggestProduct.fromJson(e as Map<String, dynamic>)).toList() ?? [],
        stores: (j['stores'] as List?)?.map((e) => SuggestStore.fromJson(e as Map<String, dynamic>)).toList() ?? [],
        categories: (j['categories'] as List?)?.map((e) => SuggestCategory.fromJson(e as Map<String, dynamic>)).toList() ?? [],
      );
  bool get isEmpty => products.isEmpty && stores.isEmpty && categories.isEmpty;
}
