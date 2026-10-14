import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the rider's access token. No refresh token — the backend doesn't issue
/// one for riders (see backend/src/modules/riders/riders.service.ts: `signRiderToken`
/// is the only token minted), so an expired session just signs the rider out and
/// they log back in with their phone + password.
class TokenStore {
  static const _key = 'rider_access_token';
  final _storage = const FlutterSecureStorage();

  /// Reads never throw — an unreadable entry (e.g. Keystore key lost after a restore)
  /// is treated as "not logged in" rather than crashing every API call.
  Future<String?> access() async {
    try {
      return await _storage.read(key: _key);
    } catch (err, st) {
      debugPrint('TokenStore: unreadable token, clearing it — $err\n$st');
      try {
        await _storage.delete(key: _key);
      } catch (_) {/* best-effort */}
      return null;
    }
  }

  Future<void> save(String token) => _storage.write(key: _key, value: token);
  Future<void> clear() => _storage.delete(key: _key);
  Future<bool> get hasSession async => (await access()) != null;
}
