/// App-wide config — same backend as customer_app, different app.
/// Dev: use your machine's LAN IP (not localhost — that's the phone, not your PC).
class Config {
  static const String apiBaseUrl = 'http://localhost:4000/api/v1';
  static const String socketUrl = 'http://localhost:4000';

  // Deployed backend (uncomment when pointing at production):
  // static const String apiBaseUrl = 'https://market-place-production-991b.up.railway.app/api/v1';
  // static const String socketUrl = 'https://market-place-production-991b.up.railway.app';

  /// How often to push a GPS fix to the backend while online and on an active delivery.
  static const Duration locationPingInterval = Duration(seconds: 12);

  /// How often to poll for incoming auto-assignment offers while online.
  static const Duration offerPollInterval = Duration(seconds: 5);
}
