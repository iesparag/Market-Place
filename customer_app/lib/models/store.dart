int _int(dynamic v) => v is num ? v.toInt() : 0;
double _dbl(dynamic v) => v is num ? v.toDouble() : 0;

class Vendor {
  final String id;
  final String name;
  final String slug;
  final String? description;
  final String vendorType;
  final String? logo;
  final double ratingAvg;
  final int ratingCount;
  final int productCount;

  Vendor({
    required this.id,
    required this.name,
    required this.slug,
    this.description,
    required this.vendorType,
    this.logo,
    required this.ratingAvg,
    required this.ratingCount,
    required this.productCount,
  });

  factory Vendor.fromJson(Map<String, dynamic> j) => Vendor(
        id: (j['_id'] ?? j['id']).toString(),
        name: j['name']?.toString() ?? '',
        slug: j['slug']?.toString() ?? '',
        description: j['description']?.toString(),
        vendorType: j['vendorType']?.toString() ?? 'generic',
        logo: j['logo']?.toString(),
        ratingAvg: _dbl(j['ratingAvg']),
        ratingCount: _int(j['ratingCount']),
        productCount: _int(j['productCount']),
      );
}

/// Full storefront profile (GET /catalog/stores/:slug → { store, products, categoryTree }).
class StoreProfile {
  final String id;
  final String name;
  final String slug;
  final String? description;
  final String? logo;
  final List<String> coverImages;
  final String? vendorType;
  final String? contactEmail;
  final String? contactPhone;
  final Map<String, dynamic>? address;
  final double ratingAvg;
  final int ratingCount;

  StoreProfile({
    required this.id,
    required this.name,
    required this.slug,
    this.description,
    this.logo,
    required this.coverImages,
    this.vendorType,
    this.contactEmail,
    this.contactPhone,
    this.address,
    required this.ratingAvg,
    required this.ratingCount,
  });

  factory StoreProfile.fromJson(Map<String, dynamic> j) => StoreProfile(
        id: (j['_id'] ?? j['id']).toString(),
        name: j['name']?.toString() ?? '',
        slug: j['slug']?.toString() ?? '',
        description: j['description']?.toString(),
        logo: j['logo']?.toString(),
        coverImages: (j['coverImages'] as List?)?.map((e) => e.toString()).toList() ?? [],
        vendorType: j['vendorType']?.toString(),
        contactEmail: j['contactEmail']?.toString(),
        contactPhone: j['contactPhone']?.toString(),
        address: (j['address'] as Map?)?.cast<String, dynamic>(),
        ratingAvg: _dbl(j['ratingAvg']),
        ratingCount: _int(j['ratingCount']),
      );
}
