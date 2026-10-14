import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/providers.dart';
import '../../models/rider.dart';
import '../push/push_service.dart';

/// Holds the signed-in rider. Restores the session on launch (if a token exists).
class AuthController extends StateNotifier<RiderModel?> {
  final Ref ref;
  bool ready = false;
  AuthController(this.ref) : super(null) {
    ref.read(apiClientProvider).onUnauthorized = () => state = null;
    _restore();
  }

  Future<void> _restore() async {
    // Lives for the app's whole lifetime regardless of login state — a token can
    // rotate (reinstall, app restore) before the rider has even signed back in.
    fcmTokenRefreshStream()?.listen((token) {
      if (isLoggedIn) ref.read(ridersRepoProvider).registerDevice(token).catchError((_) {});
    });

    final store = ref.read(tokenStoreProvider);
    if (await store.hasSession) {
      try {
        state = await ref.read(ridersRepoProvider).me();
        await ref.read(riderSocketProvider).connect();
        await ref.read(alertServiceProvider).requestPermission();
        await _registerPush();
      } catch (_) {
        await store.clear();
      }
    }
    ready = true;
  }

  /// Best-effort — a device/build without Firebase configured (no google-services.json
  /// yet) simply gets no FCM token, and this silently no-ops. The loud spoken alert +
  /// socket keep working either way.
  Future<void> _registerPush() async {
    final token = await currentFcmToken();
    if (token == null) return;
    try {
      await ref.read(ridersRepoProvider).registerDevice(token);
    } catch (_) {/* best-effort */}
  }

  /// Pushes a freshly-fetched rider back into state — used after an action (like
  /// setStatus) that changes the rider server-side but doesn't go through login/logout.
  void setRider(RiderModel rider) => state = rider;

  Future<void> login(String phone, String password) async {
    final result = await ref.read(ridersRepoProvider).login(phone, password);
    await ref.read(tokenStoreProvider).save(result.token);
    state = result.rider;
    await ref.read(riderSocketProvider).connect();
    await ref.read(alertServiceProvider).requestPermission();
    await _registerPush();
  }

  Future<void> logout() async {
    if (state != null) {
      // Best-effort — go offline so no new task gets offered to a session that just ended.
      try {
        await ref.read(ridersRepoProvider).setStatus('offline');
      } catch (_) {/* ignore — logging out either way */}
    }
    ref.read(riderSocketProvider).disconnect();
    await ref.read(tokenStoreProvider).clear();
    state = null;
  }

  bool get isLoggedIn => state != null;
}

final authProvider = StateNotifierProvider<AuthController, RiderModel?>((ref) => AuthController(ref));
