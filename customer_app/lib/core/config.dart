import 'package:package_info_plus/package_info_plus.dart';

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

  /// The running build's version, read from the APK itself — never a constant.
  /// A hand-maintained copy here silently drifts from pubspec `version:` and pins
  /// every new build to the old number, which traps the app on the force-update
  /// screen forever. Null until [loadAppVersion] has run.
  static String? _appVersion;
  static String? get appVersion => _appVersion;

  /// Reads the installed versionName. On failure it stays null and the caller
  /// skips the version gate — never trap a user behind an unanswerable check.
  static Future<String?> loadAppVersion() async {
    if (_appVersion != null) return _appVersion;
    try {
      _appVersion = (await PackageInfo.fromPlatform()).version;
    } catch (_) {/* leave null */}
    return _appVersion;
  }
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
