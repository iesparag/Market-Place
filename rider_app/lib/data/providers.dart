import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api/api_client.dart';
import '../core/auth/token_store.dart';
import '../core/location/location_service.dart';
import '../models/task.dart';
import 'riders_repository.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.read(tokenStoreProvider)));
final ridersRepoProvider = Provider<RidersRepository>((ref) => RidersRepository(ref.read(apiClientProvider)));

/// One instance for the app's lifetime so its internal Timer survives screen rebuilds.
final locationServiceProvider = Provider<LocationService>((ref) => LocationService(ref.read(ridersRepoProvider)));

/// Polled, not pushed — the rider app has no dedicated push/socket channel for offers
/// yet (see backend auto-assign.service.ts's comment on why). Short interval because
/// an offer window is typically ~45s and missing one means it cascades to someone else.
final offersProvider = FutureProvider.autoDispose<List<TaskModel>>((ref) => ref.read(ridersRepoProvider).myOffers());

final myTasksProvider = FutureProvider.autoDispose<List<TaskModel>>((ref) => ref.read(ridersRepoProvider).myTasks());
