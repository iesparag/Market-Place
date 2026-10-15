import 'dart:async';
import 'package:geolocator/geolocator.dart';
import '../../data/riders_repository.dart';
import '../socket/rider_socket_service.dart';
import 'background_location_service.dart';
import '../config.dart';

/// Pushes a GPS fix to the backend on a fixed interval while the rider is online.
/// Interval-based (not distance-filtered) on purpose: a stationary rider waiting at a
/// pickup should still refresh their `at` timestamp, or the customer's tracking map
/// looks stale even though nothing is actually wrong.
///
/// Prefers the socket (lower latency, no per-fix HTTP/auth overhead) and falls back to
/// the HTTP endpoint whenever the socket isn't currently connected (reconnecting after a
/// network blip, app just resumed, etc.) — same server-side effect either way, so this
/// fallback is purely a reliability measure, never a behavior difference.
class LocationService {
  final RidersRepository repo;
  final RiderSocketService socket;
  LocationService(this.repo, this.socket);

  Timer? _timer;

  bool get isRunning => _timer != null;

  Future<bool> _ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission != LocationPermission.whileInUse && permission != LocationPermission.always) return false;
    // iOS requires the two-step dance: whileInUse first, then a SEPARATE prompt to
    // upgrade to "Always" — without it, continued location access stops shortly after
    // the app is backgrounded regardless of the foreground-service-equivalent running.
    // Android ignores this (there's no such upgrade flow / the foreground service
    // pattern used here doesn't need it — see AndroidManifest.xml's comment).
    if (permission == LocationPermission.whileInUse) {
      permission = await Geolocator.requestPermission();
    }
    return true; // whileInUse alone still works on Android; iOS best-effort upgrades above
  }

  /// Returns false (and starts nothing) if location permission/service isn't available
  /// — the caller should surface that rather than silently going "online" with no GPS.
  Future<bool> start() async {
    if (_timer != null) return true;
    if (!await _ensurePermission()) return false;

    Future<void> ping() async {
      try {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
        );
        if (socket.isConnected) {
          socket.emitLocation(pos.latitude, pos.longitude);
        } else {
          await repo.updateLocation(pos.latitude, pos.longitude);
        }
      } catch (_) {/* one missed ping is fine — the next timer tick retries */}
    }

    await ping();
    _timer = Timer.periodic(Config.locationPingInterval, (_) => ping());
    // Also start the background-isolate service — this foreground Timer stops the
    // instant the app loses focus/is backgrounded, so it alone isn't "production grade"
    // for a rider whose phone sits in their pocket for most of a delivery. Running both
    // is deliberately simple over micro-optimized: a harmless occasional duplicate ping
    // beats any lifecycle-detection complexity to suppress one while the other covers it.
    unawaited(BackgroundLocationService.start());
    return true;
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    unawaited(BackgroundLocationService.stop());
  }
}
