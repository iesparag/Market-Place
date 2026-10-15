import 'category.dart';
import 'product.dart';
import 'store.dart';

class PromoBanner {
  final String title;
  final String subtitle;
  final String? ctaText;
  final String? link;
  final String? bg;
  final String? image;
  final String? imageUrl;
  PromoBanner({required this.title, required this.subtitle, this.ctaText, this.link, this.bg, this.image, this.imageUrl});
  factory PromoBanner.fromJson(Map<String, dynamic> j) => PromoBanner(
        title: j['title']?.toString() ?? '',
        subtitle: j['subtitle']?.toString() ?? '',
        ctaText: j['ctaText']?.toString(),
        link: j['link']?.toString(),
        bg: j['bg']?.toString(),
        image: j['image']?.toString(),
        imageUrl: j['imageUrl']?.toString(),
      );
}

class DealsTimer {
  final int hours;
  final int minutes;
  final int seconds;
  final int? endsAt;
  DealsTimer({required this.hours, required this.minutes, required this.seconds, this.endsAt});
  factory DealsTimer.fromJson(Map<String, dynamic> j) => DealsTimer(
        hours: (j['hours'] as num?)?.toInt() ?? 10,
        minutes: (j['minutes'] as num?)?.toInt() ?? 18,
        seconds: (j['seconds'] as num?)?.toInt() ?? 24,
        endsAt: (j['endsAt'] as num?)?.toInt(),
      );
}

/// Admin-composed landing section: heading + list of products, vendors, categories, or banners.
class HomeSection {
  final String id;
  final String title;
  final String subtitle;
  final String type; // 'banners' | 'categories' | 'products' | 'vendors'
  final String? source;
  final String? sort;
  final String? category;
  final DealsTimer? dealsTimer;
  final List<PromoBanner> banners;
  final List<CatNode> categories;
  final List<Product> products;
  final List<Vendor> vendors;

  HomeSection({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.type,
    this.source,
    this.sort,
    this.category,
    this.dealsTimer,
    required this.banners,
    required this.categories,
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
      source: j['source']?.toString(),
      sort: j['sort']?.toString(),
      category: j['category']?.toString(),
      dealsTimer: j['dealsTimer'] is Map ? DealsTimer.fromJson(j['dealsTimer'] as Map<String, dynamic>) : null,
      banners: type == 'banners' ? items.map((e) => PromoBanner.fromJson(e as Map<String, dynamic>)).toList() : [],
      categories: type == 'categories' ? items.map((e) => CatNode.fromJson(e as Map<String, dynamic>)).toList() : [],
      products: type == 'products' ? items.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList() : [],
      vendors: type == 'vendors' ? items.map((e) => Vendor.fromJson(e as Map<String, dynamic>)).toList() : [],
    );
  }
}
