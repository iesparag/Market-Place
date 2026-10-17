import 'package:latlong2/latlong.dart' as ll;
import '../core/api/api_client.dart';

/// Road-following route from the backend's /routing (self-hosted OSRM, Redis-cached
/// server-side — see backend/src/modules/routing). Null means no route is available
/// (OSRM not configured, or the request failed) — callers should fall back to just
/// showing the rider's marker without a polyline, never block on this.
class RoutingRepository {
  final ApiClient api;
  RoutingRepository(this.api);

  Future<List<ll.LatLng>?> route(
      {required ll.LatLng from, required ll.LatLng to}) async {
    final data = await api.get('/routing', query: {
      'fromLat': from.latitude,
      'fromLng': from.longitude,
      'toLat': to.latitude,
      'toLng': to.longitude,
    });
    if (data == null) return null;
    final coords = (data as Map)['coordinates'] as List?;
    if (coords == null || coords.isEmpty) return null;
    // Backend returns [lng, lat] pairs (GeoJSON order) — flip to flutter_map's LatLng(lat, lng).
    return coords
        .whereType<List>()
        .map((c) =>
            ll.LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
        .toList();
  }
}
