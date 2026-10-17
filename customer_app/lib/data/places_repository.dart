import '../core/api/api_client.dart';
import '../models/geo_suggestion.dart';
import '../models/place_prediction.dart';

/// Google Places Autocomplete + Place Details, proxied through the backend's `/places`
/// (Redis-cached, cost-optimized there — see backend/src/modules/places). Two calls,
/// not one: autocomplete() is cheap and fires per keystroke; details() is billed per
/// pick and must be called exactly once per chosen address, reusing the same
/// [sessionToken] across both — that's what unlocks Google's cheaper per-session pricing.
class PlacesRepository {
  final ApiClient api;
  PlacesRepository(this.api);

  Future<List<PlacePrediction>> autocomplete(
      String input, String sessionToken) async {
    if (input.trim().length < 3) return [];
    final data = await api.get('/places/autocomplete',
        query: {'input': input, 'sessiontoken': sessionToken}) as List;
    return data
        .map(
            (e) => PlacePrediction.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<GeoSuggestion?> details(String placeId, String sessionToken) async {
    final data = await api.get('/places/details',
        query: {'place_id': placeId, 'sessiontoken': sessionToken});
    if (data == null) return null;
    final j = (data as Map).cast<String, dynamic>();
    return GeoSuggestion.fromJson(j);
  }
}
