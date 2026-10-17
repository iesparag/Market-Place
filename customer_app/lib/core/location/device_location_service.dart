import 'package:geolocator/geolocator.dart';

/// Resolves the device's current GPS position, used to drive "Shops near you" and the
/// live location bar. Deliberately NEVER throws — any failure (location services off,
/// permission denied, timeout) resolves null, so every caller just treats null as
/// "no GPS available, fall back to the saved/default address."
class DeviceLocationService {
  Future<({double lat, double lng})?> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy
              .medium, // city-level is enough for serviceability; don't demand "precise"
          timeLimit: Duration(seconds: 8),
        ),
      );
      return (lat: pos.latitude, lng: pos.longitude);
    } catch (_) {
      return null;
    }
  }
}
