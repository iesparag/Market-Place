import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/alert/alert_service.dart';
import '../core/api/api_client.dart';
import '../core/auth/token_store.dart';
import '../core/location/location_service.dart';
import '../core/socket/rider_socket_service.dart';
import '../models/task.dart';
import 'riders_repository.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.read(tokenStoreProvider)));
final ridersRepoProvider = Provider<RidersRepository>((ref) => RidersRepository(ref.read(apiClientProvider)));

/// One instance for the app's lifetime — connects on login, disconnects on logout
/// (see AuthController). Live push for offers/assignments; polling below is the
/// fallback for a connection that drops.
final riderSocketProvider = Provider<RiderSocketService>((ref) => RiderSocketService(ref.read(tokenStoreProvider)));

/// One instance for the app's lifetime so its internal Timer survives screen rebuilds.
/// Prefers riderSocketProvider for each GPS push, falls back to HTTP when the socket's down.
final locationServiceProvider = Provider<LocationService>((ref) => LocationService(ref.read(ridersRepoProvider), ref.read(riderSocketProvider)));

/// One instance for the app's lifetime — a loud, spoken job-offer/assignment alert.
final alertServiceProvider = Provider<AlertService>((ref) => AlertService());

final offersProvider = FutureProvider.autoDispose<List<TaskModel>>((ref) => ref.read(ridersRepoProvider).myOffers());

final myTasksProvider = FutureProvider.autoDispose<List<TaskModel>>((ref) => ref.read(ridersRepoProvider).myTasks());
