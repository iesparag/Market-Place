/// An admin-configured festival greeting (Diwali, Holi, Eid, …) — live right now if
/// today falls within its date window. Backed by `GET /festivals/active`, which
/// already resolves overlapping festivals by priority, so the client only ever
/// has one (or none) to show.
class FestivalModel {
  final String id;
  final String name;
  final String greetingTitle;
  final String greetingMessage;
  final String lottieUrl;
  final String? bannerImageUrl;
  final String? themeColor;

  FestivalModel({
    required this.id,
    required this.name,
    required this.greetingTitle,
    required this.greetingMessage,
    required this.lottieUrl,
    this.bannerImageUrl,
    this.themeColor,
  });

  factory FestivalModel.fromJson(Map<String, dynamic> j) => FestivalModel(
        id: (j['_id'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        greetingTitle: (j['greetingTitle'] ?? '').toString(),
        greetingMessage: (j['greetingMessage'] ?? '').toString(),
        lottieUrl: (j['lottieUrl'] ?? '').toString(),
        bannerImageUrl: j['bannerImageUrl']?.toString(),
        themeColor: j['themeColor']?.toString(),
      );
}
