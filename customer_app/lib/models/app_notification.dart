/// A bell-drawer notification — order updates, payment events, promo broadcasts.
/// Backed by `GET /notifications` and pushed live over `notification:new`.
class AppNotification {
  final String id;
  final String type;
  final String title;
  final String body;
  final String? link;
  final bool read;
  final DateTime createdAt;

  AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.link,
    required this.read,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: (j['_id'] ?? j['id'] ?? '').toString(),
        type: (j['type'] ?? 'info').toString(),
        title: (j['title'] ?? '').toString(),
        body: (j['body'] ?? '').toString(),
        link: (j['link']?.toString().isEmpty ?? true) ? null : j['link'].toString(),
        read: j['read'] == true,
        createdAt: DateTime.tryParse(j['createdAt']?.toString() ?? '') ?? DateTime.now(),
      );
}
