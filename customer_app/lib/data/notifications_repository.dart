import '../core/api/api_client.dart';
import '../models/app_notification.dart';

class NotificationsRepository {
  final ApiClient api;
  NotificationsRepository(this.api);

  Future<List<AppNotification>> list() async {
    final data = await api.get('/notifications') as List;
    return data
        .map(
            (e) => AppNotification.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<int> unreadCount() async {
    final data = await api.get('/notifications/unread-count') as Map;
    return (data['count'] as num?)?.toInt() ?? 0;
  }

  Future<void> markRead(String id) => api.post('/notifications/$id/read');

  Future<void> markAllRead() => api.post('/notifications/read-all');

  Future<void> registerDevice(String token, {String platform = 'android'}) =>
      api.post('/notifications/register-device',
          body: {'token': token, 'platform': platform});
}
