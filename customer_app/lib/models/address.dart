class Address {
  final String id;
  final String label;
  final String line1;
  final String city;
  final String? pincode;
  final String? phone;
  final bool isDefault;

  Address({
    required this.id,
    required this.label,
    required this.line1,
    required this.city,
    this.pincode,
    this.phone,
    required this.isDefault,
  });

  factory Address.fromJson(Map<String, dynamic> j) => Address(
        id: (j['_id'] ?? '').toString(),
        label: j['label']?.toString() ?? 'Home',
        line1: j['line1']?.toString() ?? '',
        city: j['city']?.toString() ?? '',
        pincode: j['pincode']?.toString(),
        phone: j['phone']?.toString(),
        isDefault: j['isDefault'] == true,
      );

  String get oneLine => [line1, city, if (pincode != null && pincode!.isNotEmpty) pincode].join(', ');
}
