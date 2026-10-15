/// One Google Places Autocomplete prediction — deliberately has NO lat/lng. Resolving
/// coordinates costs a separate Place Details call, made only once the user picks one
/// of these (see PlacesRepository.details) — never for every prediction shown in the list.
class PlacePrediction {
  final String placeId;
  final String description;
  PlacePrediction({required this.placeId, required this.description});

  factory PlacePrediction.fromJson(Map<String, dynamic> j) => PlacePrediction(
        placeId: j['placeId']?.toString() ?? '',
        description: j['description']?.toString() ?? '',
      );
}
