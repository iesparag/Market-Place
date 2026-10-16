import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/providers.dart';
import '../push/push_service.dart';

class AuthUser {
  final String id;
  final String name;
  final String email;
  final String role;
  final bool whatsappOptIn;
  AuthUser({required this.id, required this.name, required this.email, required this.role, this.whatsappOptIn = false});
  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: (j['id'] ?? j['_id'] ?? '').toString(),
        name: j['name']?.toString() ?? '',
        email: j['email']?.toString() ?? '',
        role: j['role']?.toString() ?? 'customer',
        whatsappOptIn: j['whatsappOptIn'] == true,
      );
  AuthUser copyWith({bool? whatsappOptIn}) => AuthUser(
        id: id, name: name, email: email, role: role,
        whatsappOptIn: whatsappOptIn ?? this.whatsappOptIn,
      );
}

/// Holds the signed-in user. Restores the session on launch (if a token exists).
class AuthController extends StateNotifier<AuthUser?> {
  final Ref ref;
  bool ready = false;
  AuthController(this.ref) : super(null) {
    _restore();
  }

  Future<void> _restore() async {
    // Lives for the app's whole lifetime regardless of login state — a token can
    // rotate (reinstall, app restore) before the user has even signed back in.
    fcmTokenRefreshStream()?.listen((token) {
      if (isLoggedIn) ref.read(notificationsRepoProvider).registerDevice(token).catchError((_) {});
    });

    final store = ref.read(tokenStoreProvider);
    if (await store.hasSession) {
      try {
        final me = await ref.read(apiClientProvider).get('/me') as Map<String, dynamic>;
        state = AuthUser.fromJson(me);
        await ref.read(appSocketProvider).connect();
        await _registerPush();
      } catch (_) {
        await store.clear();
      }
    }
    ready = true;
  }

  /// Best-effort — a device/build without Firebase configured (no google-services.json
  /// yet) simply gets no FCM token, and this silently no-ops. In-app bell + socket keep
  /// working either way.
  Future<void> _registerPush() async {
    final token = await currentFcmToken();
    if (token == null) return;
    try {
      await ref.read(notificationsRepoProvider).registerDevice(token);
    } catch (_) {/* best-effort */}
  }

  Future<void> login(String email, String password) async {
    final d = await ref.read(apiClientProvider).post('/auth/login', body: {'email': email, 'password': password}) as Map<String, dynamic>;
    await ref.read(tokenStoreProvider).save(d['token'] as String, d['refreshToken'] as String);
    state = AuthUser.fromJson(d['user'] as Map<String, dynamic>);
    await ref.read(appSocketProvider).connect();
    await _registerPush();
  }

  Future<void> register(String name, String email, String password, {String? phone}) async {
    final d = await ref.read(apiClientProvider).post('/auth/register', body: {
      'name': name,
      'email': email,
      'password': password,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
    }) as Map<String, dynamic>;
    await ref.read(tokenStoreProvider).save(d['token'] as String, d['refreshToken'] as String);
    state = AuthUser.fromJson(d['user'] as Map<String, dynamic>);
    await ref.read(appSocketProvider).connect();
    await _registerPush();
  }

  Future<void> registerVendor({
    required String name,
    required String email,
    required String password,
    String? phone,
    required String storeName,
    String? vendorType,
    String? gstin,
    String? pan,
    String? city,
  }) async {
    final d = await ref.read(apiClientProvider).post('/auth/register-vendor', body: {
      'name': name, 'email': email, 'password': password,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
      'storeName': storeName,
      if (vendorType != null) 'vendorType': vendorType,
      if (gstin != null && gstin.isNotEmpty) 'gstin': gstin,
      if (pan != null && pan.isNotEmpty) 'pan': pan,
      if (city != null && city.isNotEmpty) 'address': {'city': city},
    }) as Map<String, dynamic>;
    await ref.read(tokenStoreProvider).save(d['token'] as String, d['refreshToken'] as String);
    state = AuthUser.fromJson(d['user'] as Map<String, dynamic>);
    await ref.read(appSocketProvider).connect();
    await _registerPush();
  }

  /// Step 1 of a password reset: emails a 6-digit code (valid 15 minutes).
  /// The API always reports success so it never reveals whether the email exists.
  Future<void> forgotPassword(String email) async {
    await ref.read(apiClientProvider).post('/auth/forgot-password', body: {'email': email});
  }

  /// Step 2: the code is verified and the password replaced in one call — a code
  /// that is wrong, used or older than 15 minutes throws.
  Future<void> resetPassword(String email, String code, String newPassword) async {
    await ref.read(apiClientProvider).post('/auth/reset-password', body: {
      'email': email,
      'code': code,
      'newPassword': newPassword,
    });
  }

  /// WhatsApp marketing messages (cart reminders etc.) are opt-in only — see
  /// User.whatsappOptIn on the backend. Optimistic update, reverted on failure.
  Future<void> setWhatsappOptIn(bool value) async {
    final prev = state;
    if (prev == null) return;
    state = prev.copyWith(whatsappOptIn: value);
    try {
      await ref.read(apiClientProvider).patch('/me', body: {'whatsappOptIn': value});
    } catch (_) {
      state = prev;
      rethrow;
    }
  }

  Future<void> logout() async {
    ref.read(appSocketProvider).disconnect();
    await ref.read(tokenStoreProvider).clear();
    state = null;
  }

  bool get isLoggedIn => state != null;
}

final authProvider = StateNotifierProvider<AuthController, AuthUser?>((ref) => AuthController(ref));
