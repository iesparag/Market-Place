/// App-wide config. Point these at your backend.
/// Dev: use your machine's LAN IP (not localhost — that's the phone, not your PC).
class Config {
  // Deployed backend (Railway).
  static const String apiBaseUrl =
      'https://market-place-production-991b.up.railway.app/api/v1';
  static const String socketUrl =
      'https://market-place-production-991b.up.railway.app';

  // Local dev alternative (uncomment + set your LAN IP):
  // static const String apiBaseUrl = 'http://192.168.1.5:4000/api/v1';
  // static const String socketUrl = 'http://192.168.1.5:4000';

  static const int pageSize = 20;

  /// Keep in sync with pubspec `version:`. Compared against the backend's minVersion for force-update.
  static const String appVersion = '1.0.2';
}

/// true if [current] is older than [min] (simple semver compare).
bool isVersionBelow(String current, String min) {
  List<int> parse(String v) => v.split('.').map((p) => int.tryParse(p.split('+').first.trim()) ?? 0).toList();
  final a = parse(current), b = parse(min);
  for (var i = 0; i < 3; i++) {
    final x = i < a.length ? a[i] : 0;
    final y = i < b.length ? b[i] : 0;
    if (x != y) return x < y;
  }
  return false;
}
