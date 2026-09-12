import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the JWT access + refresh tokens securely (Keychain / Keystore).
class TokenStore {
  static const _access = 'access_token';
  static const _refresh = 'refresh_token';
  final _storage = const FlutterSecureStorage();

  /// Reads never throw. On Android, an app reinstall can leave the encrypted token file
  /// restored (via Auto Backup) while the Keystore key that encrypted it is gone —
  /// reading it then throws a decrypt error. Since every API call goes through this via
  /// the auth interceptor, an uncaught throw here breaks *all* networking, surfacing as a
  /// generic "Network error" everywhere. Treat it as "not logged in" instead: drop the
  /// unreadable entry and let the normal login flow recover.
  Future<String?> _readSafe(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (err, st) {
      debugPrint('TokenStore: unreadable "$key", clearing it — $err\n$st');
      try {
        await _storage.delete(key: key);
      } catch (_) {/* best-effort */}
      return null;
    }
  }

  Future<String?> access() => _readSafe(_access);
  Future<String?> refresh() => _readSafe(_refresh);

  Future<void> save(String access, String refresh) async {
    await _storage.write(key: _access, value: access);
    await _storage.write(key: _refresh, value: refresh);
  }

  Future<void> clear() async {
    await _storage.delete(key: _access);
    await _storage.delete(key: _refresh);
  }

  Future<bool> get hasSession async => (await access()) != null;
}
