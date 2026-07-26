import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the JWT access + refresh tokens securely (Keychain / Keystore).
class TokenStore {
  static const _access = 'access_token';
  static const _refresh = 'refresh_token';
  final _storage = const FlutterSecureStorage();

  Future<String?> access() => _storage.read(key: _access);
  Future<String?> refresh() => _storage.read(key: _refresh);

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
