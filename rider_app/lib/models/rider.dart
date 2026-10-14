class RiderModel {
  final String id;
  final String name;
  final String phone;
  final String? vehicleType;
  /// offline | available | busy
  final String status;
  final double rating;
  final int activeTaskCount;
  final int totalDeliveries;

  RiderModel({
    required this.id,
    required this.name,
    required this.phone,
    this.vehicleType,
    required this.status,
    this.rating = 5,
    this.activeTaskCount = 0,
    this.totalDeliveries = 0,
  });

  factory RiderModel.fromJson(Map<String, dynamic> j) => RiderModel(
        id: (j['id'] ?? j['_id'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        phone: (j['phone'] ?? '').toString(),
        vehicleType: j['vehicleType']?.toString(),
        status: (j['status'] ?? 'offline').toString(),
        rating: (j['rating'] as num?)?.toDouble() ?? 5,
        activeTaskCount: (j['activeTaskCount'] as num?)?.toInt() ?? 0,
        totalDeliveries: (j['totalDeliveries'] as num?)?.toInt() ?? 0,
      );
}
