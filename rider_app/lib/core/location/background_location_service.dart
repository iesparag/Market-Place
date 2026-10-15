import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:geolocator/geolocator.dart';
import '../auth/token_store.dart';
import '../config.dart';

/// Keeps pushing GPS fixes to the backend while the rider app is backgrounded or the
/// screen is off — a plain `Timer` (see LocationService) stops the moment the app loses
/// foreground focus, which isn't "production grade" for a delivery app where the rider's
/// phone is in their pocket, not pinned on screen, for most of a delivery.
///
/// Runs in its OWN isolate (flutter_background_service's model on Android: a genuine
/// background isolate; a long-lived Dart context on iOS) — it cannot see the main
/// isolate's Riverpod `ref`/providers, so it talks to secure storage and the network
/// directly rather than reusing ApiClient/TokenStore wiring from the main isolate.
class BackgroundLocationService {
  static final _service = FlutterBackgroundService();
  static bool _configured = false;

  static Future<void> _ensureConfigured() async {
    if (_configured) return;
    _configured = true;
    await _service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: _onStart,
        isForegroundMode: true,
        autoStart: false,
        notificationChannelId: 'rider_location_tracking',
        initialNotificationTitle: 'Marketplace Rider',
        initialNotificationContent: 'Sharing your location while you\'re online',
        foregroundServiceNotificationId: 9001,
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: _onStart,
        onBackground: _onIosBackground,
      ),
    );
  }

  static Future<void> start() async {
    await _ensureConfigured();
    if (!await _service.isRunning()) _service.startService();
  }

  static Future<void> stop() async {
    if (await _service.isRunning()) _service.invoke('stop');
  }
}

/// Runs in the background isolate — must stay a top-level/static function per the
/// plugin's contract (it's looked up by reference across the isolate boundary).
@pragma('vm:entry-point')
void _onStart(ServiceInstance service) {
  final tokenStore = TokenStore();
  final dio = Dio(BaseOptions(baseUrl: Config.apiBaseUrl, connectTimeout: const Duration(seconds: 8)));
  Timer? timer;

  service.on('stop').listen((_) {
    timer?.cancel();
    service.stopSelf();
  });

  Future<void> ping() async {
    try {
      final token = await tokenStore.access();
      if (token == null) return; // signed out mid-shift — nothing to push
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      await dio.post(
        '/riders/me/location',
        data: {'lat': pos.latitude, 'lng': pos.longitude},
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
    } catch (_) {
      // One missed background ping is fine — the next timer tick retries, and the
      // foreground LocationService resumes the moment the app is reopened.
    }
  }

  ping();
  timer = Timer.periodic(Config.locationPingInterval, (_) => ping());
}

@pragma('vm:entry-point')
bool _onIosBackground(ServiceInstance service) {
  _onStart(service);
  return true;
}
