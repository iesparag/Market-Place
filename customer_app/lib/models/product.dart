int _int(dynamic v) => v is num ? v.toInt() : 0;
double _dbl(dynamic v) => v is num ? v.toDouble() : 0;

class Variant {
  final String sku;
  final Map<String, String> optionValues;
  final int price; // paise
  final int stock;
  Variant({required this.sku, required this.optionValues, required this.price, required this.stock});

  factory Variant.fromJson(Map<String, dynamic> j) => Variant(
        sku: j['sku']?.toString() ?? '',
        optionValues: (j['optionValues'] as Map?)?.map((k, v) => MapEntry(k.toString(), v.toString())) ?? {},
        price: _int(j['price']),
        stock: _int(j['stock']),
      );
}

class ProductStore {
  final String name;
  final String slug;
  ProductStore({required this.name, required this.slug});
  factory ProductStore.fromJson(Map<String, dynamic> j) =>
      ProductStore(name: j['name']?.toString() ?? '', slug: j['slug']?.toString() ?? '');
}

class AttributeDef {
  final String key;
  final String label;
  final String type;
  AttributeDef({required this.key, required this.label, required this.type});
  factory AttributeDef.fromJson(Map<String, dynamic> j) => AttributeDef(
        key: j['key']?.toString() ?? '',
        label: j['label']?.toString() ?? '',
        type: j['type']?.toString() ?? 'string',
      );
}

class Product {
  final String id;
  final String? code;
  final String title;
  final String slug;
  final String description;
  final String? brand;
  final List<String> images;
  final String? foodType;
  final Map<String, dynamic> attributes;
  final List<Variant> variants;
  final double ratingAvg;
  final int ratingCount;
  final int minPrice; // paise
  final String storeId;
  final ProductStore? store;
  final String? categoryName;
  final List<AttributeDef> attributeDefs;
  final List<Product> related;

  Product({
    required this.id,
    this.code,
    required this.title,
    required this.slug,
    required this.description,
    this.brand,
    required this.images,
    this.foodType,
    required this.attributes,
    required this.variants,
    required this.ratingAvg,
    required this.ratingCount,
    required this.minPrice,
    required this.storeId,
    this.store,
    this.categoryName,
    required this.attributeDefs,
    required this.related,
  });

  String? get firstImage => images.isNotEmpty ? images.first : null;

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: (j['_id'] ?? j['id']).toString(),
        code: j['code']?.toString(),
        title: j['title']?.toString() ?? '',
        slug: j['slug']?.toString() ?? '',
        description: j['description']?.toString() ?? '',
        brand: j['brand']?.toString(),
        images: (j['images'] as List?)?.map((e) => e.toString()).toList() ?? [],
        foodType: j['foodType']?.toString(),
        attributes: (j['attributes'] as Map?)?.cast<String, dynamic>() ?? {},
        variants: (j['variants'] as List?)?.map((e) => Variant.fromJson(e as Map<String, dynamic>)).toList() ?? [],
        ratingAvg: _dbl(j['ratingAvg']),
        ratingCount: _int(j['ratingCount']),
        minPrice: _int(j['minPrice']),
        storeId: (j['storeId'] ?? '').toString(),
        store: j['store'] is Map ? ProductStore.fromJson(j['store'] as Map<String, dynamic>) : null,
        categoryName: j['categoryName']?.toString(),
        attributeDefs: (j['attributeDefs'] as List?)?.map((e) => AttributeDef.fromJson(e as Map<String, dynamic>)).toList() ?? [],
        related: (j['related'] as List?)?.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList() ?? [],
      );
}
