int _int(dynamic v) => v is num ? v.toInt() : 0;
double _dbl(dynamic v) => v is num ? v.toDouble() : 0;

class Vendor {
  final String id;
  final String name;
  final String slug;
  final String? description;
  final String vendorType;
  final String? logo;
  final String? deliveryTime;
  final double ratingAvg;
  final int ratingCount;
  final int productCount;
  final double? distanceMeters;
  final bool isOpenNow;
  final bool isLocal;
  final bool isNowEligible;
  final String? deliveryType;
  final String? estimatedDelivery;
  final double? lat;
  final double? lng;
  final String? city;
  final String? pincode;

  Vendor({
    required this.id,
    required this.name,
    required this.slug,
    this.description,
    required this.vendorType,
    this.logo,
    this.deliveryTime,
    required this.ratingAvg,
    required this.ratingCount,
    required this.productCount,
    this.distanceMeters,
    this.isOpenNow = true,
    this.isLocal = false,
    this.isNowEligible = false,
    this.deliveryType,
    this.estimatedDelivery,
    this.lat,
    this.lng,
    this.city,
    this.pincode,
  });

  factory Vendor.fromJson(Map<String, dynamic> j) {
    final addr = j['address'] is Map ? (j['address'] as Map) : null;
    final loc = j['location'];
    final coords = loc is Map ? loc['coordinates'] : null;
    final parsedLat = coords is List && coords.length == 2
        ? _dbl(coords[1])
        : (j['lat'] != null
            ? _dbl(j['lat'])
            : (addr != null && addr['lat'] != null ? _dbl(addr['lat']) : null));
    final parsedLng = coords is List && coords.length == 2
        ? _dbl(coords[0])
        : (j['lng'] != null
            ? _dbl(j['lng'])
            : (addr != null && addr['lng'] != null ? _dbl(addr['lng']) : null));

    final parsedCity = j['city']?.toString() ?? addr?['city']?.toString();
    final parsedPincode = j['pincode']?.toString() ??
        addr?['pincode']?.toString() ??
        addr?['postalCode']?.toString();

    return Vendor(
      id: (j['_id'] ?? j['id']).toString(),
      name: j['name']?.toString() ?? '',
      slug: j['slug']?.toString() ?? '',
      description: j['description']?.toString(),
      vendorType: j['vendorType']?.toString() ?? 'generic',
      logo: j['logo']?.toString(),
      deliveryTime: j['deliveryTime']?.toString(),
      ratingAvg: _dbl(j['ratingAvg']),
      ratingCount: _int(j['ratingCount']),
      productCount: _int(j['productCount']),
      distanceMeters: (j['distanceMeters'] as num?)?.toDouble(),
      isOpenNow: j['isOpenNow'] != false,
      isLocal: j['isLocal'] == true,
      isNowEligible: j['isNowEligible'] == true,
      deliveryType: j['deliveryType']?.toString(),
      estimatedDelivery: j['estimatedDelivery']?.toString(),
      lat: parsedLat,
      lng: parsedLng,
      city: parsedCity,
      pincode: parsedPincode,
    );
  }
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
  final bool isOpenNow;

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
    this.isOpenNow = true,
  });

  factory StoreProfile.fromJson(Map<String, dynamic> j) => StoreProfile(
        id: (j['_id'] ?? j['id']).toString(),
        name: j['name']?.toString() ?? '',
        slug: j['slug']?.toString() ?? '',
        description: j['description']?.toString(),
        logo: j['logo']?.toString(),
        coverImages:
            (j['coverImages'] as List?)?.map((e) => e.toString()).toList() ??
                [],
        vendorType: j['vendorType']?.toString(),
        contactEmail: j['contactEmail']?.toString(),
        isOpenNow: j['isOpenNow'] != false,
        contactPhone: j['contactPhone']?.toString(),
        address: (j['address'] as Map?)?.cast<String, dynamic>(),
        ratingAvg: _dbl(j['ratingAvg']),
        ratingCount: _int(j['ratingCount']),
      );
}
