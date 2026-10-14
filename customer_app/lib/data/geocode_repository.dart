import '../core/api/api_client.dart';
import '../models/geo_suggestion.dart';

/// Free address search, proxied through the backend (`/geocode`), which in turn
/// calls OpenStreetMap/Nominatim and Redis-caches the result. Never call Nominatim
/// directly from the app — see GEOCODE_* in backend/src/config/env.ts for why.
class GeocodeRepository {
  final ApiClient api;
  GeocodeRepository(this.api);

  Future<List<GeoSuggestion>> search(String query) async {
    if (query.trim().length < 3) return [];
    final data = await api.get('/geocode/search', query: {'q': query}) as List;
    return data.map((e) => GeoSuggestion.fromJson((e as Map).cast<String, dynamic>())).toList();
  }

  Future<GeoSuggestion?> reverse(double lat, double lng) async {
    final data = await api.get('/geocode/reverse', query: {'lat': lat, 'lng': lng});
    if (data == null) return null;
    return GeoSuggestion.fromJson((data as Map).cast<String, dynamic>());
  }
}
