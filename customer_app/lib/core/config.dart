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
}
