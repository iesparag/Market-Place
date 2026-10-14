import 'dart:async';
import 'package:geolocator/geolocator.dart';
import '../../data/riders_repository.dart';
import '../config.dart';

/// Pushes a GPS fix to the backend on a fixed interval while the rider is online.
/// Interval-based (not distance-filtered) on purpose: a stationary rider waiting at a
/// pickup should still refresh their `at` timestamp, or the customer's tracking map
/// looks stale even though nothing is actually wrong.
class LocationService {
  final RidersRepository repo;
  LocationService(this.repo);

  Timer? _timer;

  bool get isRunning => _timer != null;

  Future<bool> _ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    return permission == LocationPermission.always || permission == LocationPermission.whileInUse;
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
        await repo.updateLocation(pos.latitude, pos.longitude);
      } catch (_) {/* one missed ping is fine — the next timer tick retries */}
    }

    await ping();
    _timer = Timer.periodic(Config.locationPingInterval, (_) => ping());
    return true;
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }
}
