import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/providers.dart';

class AuthUser {
  final String id;
  final String name;
  final String email;
  final String role;
  AuthUser({required this.id, required this.name, required this.email, required this.role});
  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: (j['id'] ?? j['_id'] ?? '').toString(),
        name: j['name']?.toString() ?? '',
        email: j['email']?.toString() ?? '',
        role: j['role']?.toString() ?? 'customer',
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
    final store = ref.read(tokenStoreProvider);
    if (await store.hasSession) {
      try {
        final me = await ref.read(apiClientProvider).get('/me') as Map<String, dynamic>;
        state = AuthUser.fromJson(me);
      } catch (_) {
        await store.clear();
      }
    }
    ready = true;
  }

  Future<void> login(String email, String password) async {
    final d = await ref.read(apiClientProvider).post('/auth/login', body: {'email': email, 'password': password}) as Map<String, dynamic>;
    await ref.read(tokenStoreProvider).save(d['token'] as String, d['refreshToken'] as String);
    state = AuthUser.fromJson(d['user'] as Map<String, dynamic>);
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

  Future<void> logout() async {
    await ref.read(tokenStoreProvider).clear();
    state = null;
  }

  bool get isLoggedIn => state != null;
}

final authProvider = StateNotifierProvider<AuthController, AuthUser?>((ref) => AuthController(ref));
