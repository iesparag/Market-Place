/// One free-text address search result from the backend's `/geocode` proxy
/// (OpenStreetMap/Nominatim under the hood — see geocode_repository.dart).
class GeoSuggestion {
  final String label;
  final String line1;
  final String city;
  final String? state;
  final String? pincode;
  final double lat;
  final double lng;

  GeoSuggestion({
    required this.label,
    required this.line1,
    required this.city,
    this.state,
    this.pincode,
    required this.lat,
    required this.lng,
  });

  factory GeoSuggestion.fromJson(Map<String, dynamic> j) => GeoSuggestion(
        label: j['label']?.toString() ?? '',
        line1: j['line1']?.toString() ?? '',
        city: j['city']?.toString() ?? '',
        state: (j['state'] as String?)?.trim().isEmpty == true ? null : j['state']?.toString(),
        pincode: (j['pincode'] as String?)?.trim().isEmpty == true ? null : j['pincode']?.toString(),
        lat: (j['lat'] as num?)?.toDouble() ?? 0,
        lng: (j['lng'] as num?)?.toDouble() ?? 0,
      );
}
