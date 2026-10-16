class Address {
  final String id;
  final String label;
  final String? recipientName;
  final String line1;
  final String? line2;
  final String? landmark;
  final String city;
  final String? state;
  final String? pincode;
  final String? phone;
  final bool isDefault;
  final double? lat;
  final double? lng;

  Address({
    required this.id,
    required this.label,
    this.recipientName,
    required this.line1,
    this.line2,
    this.landmark,
    required this.city,
    this.state,
    this.pincode,
    this.phone,
    required this.isDefault,
    this.lat,
    this.lng,
  });

  factory Address.fromJson(Map<String, dynamic> j) => Address(
        id: (j['_id'] ?? '').toString(),
        label: j['label']?.toString() ?? 'Home',
        recipientName: j['recipientName']?.toString(),
        line1: j['line1']?.toString() ?? '',
        line2: j['line2']?.toString(),
        landmark: j['landmark']?.toString(),
        city: j['city']?.toString() ?? '',
        state: j['state']?.toString(),
        pincode: j['pincode']?.toString(),
        phone: j['phone']?.toString(),
        isDefault: j['isDefault'] == true,
        lat: (j['lat'] as num?)?.toDouble(),
        lng: (j['lng'] as num?)?.toDouble(),
      );

  String get oneLine => [
        if (line2 != null && line2!.isNotEmpty) line2,
        line1,
        if (landmark != null && landmark!.isNotEmpty) 'near $landmark',
        city,
        if (pincode != null && pincode!.isNotEmpty) pincode,
      ].join(', ');
}
