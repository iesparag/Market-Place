import '../core/api/api_client.dart';
import '../models/rider.dart';
import '../models/task.dart';

class RidersRepository {
  final ApiClient api;
  RidersRepository(this.api);

  Future<({String token, RiderModel rider})> login(String phone, String password) async {
    final data = await api.post('/riders/auth/login', body: {'phone': phone, 'password': password}) as Map<String, dynamic>;
    return (token: data['token'].toString(), rider: RiderModel.fromJson((data['rider'] as Map).cast<String, dynamic>()));
  }

  Future<RiderModel> me() async {
    final data = await api.get('/riders/me') as Map<String, dynamic>;
    return RiderModel.fromJson(data);
  }

  Future<RiderModel> setStatus(String status) async {
    final data = await api.patch('/riders/me/status', body: {'status': status}) as Map<String, dynamic>;
    return RiderModel.fromJson(data);
  }

  Future<void> updateLocation(double lat, double lng) =>
      api.post('/riders/me/location', body: {'lat': lat, 'lng': lng});

  Future<List<TaskModel>> myTasks() async {
    final data = await api.get('/riders/me/tasks') as List;
    return data.map((e) => TaskModel.fromJson((e as Map).cast<String, dynamic>())).toList();
  }

  Future<List<TaskModel>> myOffers() async {
    final data = await api.get('/riders/me/offers') as List;
    return data.map((e) => TaskModel.fromJson((e as Map).cast<String, dynamic>())).toList();
  }

  Future<void> acceptOffer(String taskId) => api.post('/riders/me/offers/$taskId/accept');
  Future<void> declineOffer(String taskId) => api.post('/riders/me/offers/$taskId/decline');

  /// Riders may only ever move a task to shipped (picked up) or delivered — every other
  /// stage (accepted/preparing/ready) belongs to the vendor, enforced server-side too.
  Future<void> updateTaskStatus(String taskId, String status) =>
      api.patch('/riders/me/tasks/$taskId/status', body: {'status': status});
}
