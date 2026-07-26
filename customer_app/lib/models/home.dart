import 'product.dart';
import 'store.dart';

class PromoBanner {
  final String title;
  final String subtitle;
  final String? ctaText;
  final String? link;
  final String? bg;
  final String? image;
  PromoBanner({required this.title, required this.subtitle, this.ctaText, this.link, this.bg, this.image});
  factory PromoBanner.fromJson(Map<String, dynamic> j) => PromoBanner(
        title: j['title']?.toString() ?? '',
        subtitle: j['subtitle']?.toString() ?? '',
        ctaText: j['ctaText']?.toString(),
        link: j['link']?.toString(),
        bg: j['bg']?.toString(),
        image: j['image']?.toString(),
      );
}

/// Admin-composed landing section: heading + list of products OR vendors.
class HomeSection {
  final String id;
  final String title;
  final String subtitle;
  final String type; // 'products' | 'vendors'
  final String? sort;
  final String? category;
  final List<Product> products;
  final List<Vendor> vendors;

  HomeSection({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.type,
    this.sort,
    this.category,
    required this.products,
    required this.vendors,
  });

  factory HomeSection.fromJson(Map<String, dynamic> j) {
    final type = j['type']?.toString() ?? 'products';
    final items = (j['items'] as List?) ?? [];
    return HomeSection(
      id: (j['_id'] ?? j['title'] ?? '').toString(),
      title: j['title']?.toString() ?? '',
      subtitle: j['subtitle']?.toString() ?? '',
      type: type,
      sort: j['sort']?.toString(),
      category: j['category']?.toString(),
      products: type == 'products' ? items.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList() : [],
      vendors: type == 'vendors' ? items.map((e) => Vendor.fromJson(e as Map<String, dynamic>)).toList() : [],
    );
  }
}
