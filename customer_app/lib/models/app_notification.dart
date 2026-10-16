class NotificationProduct {
  final String id;
  final String title;
  final String slug;
  final int price;
  final int? originalPrice;
  final String? image;

  NotificationProduct({
    required this.id,
    required this.title,
    required this.slug,
    required this.price,
    this.originalPrice,
    this.image,
  });

  factory NotificationProduct.fromJson(Map<String, dynamic> j) => NotificationProduct(
        id: (j['id'] ?? j['_id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        slug: (j['slug'] ?? '').toString(),
        price: (j['price'] as num?)?.toInt() ?? 0,
        originalPrice: (j['originalPrice'] as num?)?.toInt(),
        image: j['image']?.toString(),
      );
}

/// A bell-drawer notification — order updates, payment events, promo broadcasts.
/// Backed by `GET /notifications` and pushed live over `notification:new`.
class AppNotification {
  final String id;
  final String type;
  final String title;
  final String body;
  final String? link;
  final String? image;
  final String layout; // 'standard' | 'big_picture' | 'product_showcase' | 'store_spotlight'
  final List<NotificationProduct> products;
  final String? storeSlug;
  final String? storeName;
  final String? storeLogo;
  final String? couponCode;
  final bool read;
  final DateTime createdAt;

  AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.link,
    this.image,
    this.layout = 'standard',
    this.products = const [],
    this.storeSlug,
    this.storeName,
    this.storeLogo,
    this.couponCode,
    required this.read,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) {
    final rawProds = j['products'];
    final prods = rawProds is List
        ? rawProds.map((p) => NotificationProduct.fromJson(p as Map<String, dynamic>)).toList()
        : const <NotificationProduct>[];

    return AppNotification(
      id: (j['_id'] ?? j['id'] ?? '').toString(),
      type: (j['type'] ?? 'info').toString(),
      title: (j['title'] ?? '').toString(),
      body: (j['body'] ?? '').toString(),
      link: (j['link']?.toString().isEmpty ?? true) ? null : j['link'].toString(),
      image: (j['image']?.toString().isEmpty ?? true) ? null : j['image'].toString(),
      layout: j['layout']?.toString() ?? 'standard',
      products: prods,
      storeSlug: (j['storeSlug']?.toString().isEmpty ?? true) ? null : j['storeSlug'].toString(),
      storeName: (j['storeName']?.toString().isEmpty ?? true) ? null : j['storeName'].toString(),
      storeLogo: (j['storeLogo']?.toString().isEmpty ?? true) ? null : j['storeLogo'].toString(),
      couponCode: (j['couponCode']?.toString().isEmpty ?? true) ? null : j['couponCode'].toString(),
      read: j['read'] == true,
      createdAt: DateTime.tryParse(j['createdAt']?.toString() ?? '') ?? DateTime.now(),
    );
  }
}
