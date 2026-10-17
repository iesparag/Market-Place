import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const themeModePrefKey = 'theme_mode_pref'; // 'system' | 'light' | 'dark'

ThemeMode _parse(String? s) => switch (s) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
String _serialize(ThemeMode m) => switch (m) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
    };

/// The customer's light/dark/system choice. Defaults to `system` (follows the device
/// setting) until the customer picks something explicit in Account → Appearance.
///
/// Persisted twice, deliberately:
///  - SharedPreferences: instant on next cold start (no network round-trip before the
///    very first frame paints in the right mode — avoids a light-mode flash).
///  - The account (`User.themePreference`, synced on login / on change while signed
///    in): so the choice follows the customer across devices/reinstalls, not just this
///    one device's local storage — "always stays that way" per how this was asked for.
/// A logged-out guest still gets local-only persistence; it syncs up once they sign in.
class ThemeModeController extends StateNotifier<ThemeMode> {
  final SharedPreferences prefs;
  ThemeModeController(this.prefs)
      : super(_parse(prefs.getString(themeModePrefKey)));

  /// Called by AuthController right after `/me` resolves — the account's saved
  /// preference wins over whatever was cached locally (e.g. a fresh login on a new
  /// device should pick up the preference from the account, not this device's default).
  void syncFromAccount(String? serverPreference) {
    if (serverPreference == null) return;
    final mode = _parse(serverPreference);
    if (mode != state) {
      state = mode;
      prefs.setString(themeModePrefKey, _serialize(mode));
    }
  }

  /// User-initiated change (Account → Appearance). Updates local state + cache
  /// immediately; `onPersist` (passed by the caller, which has the authenticated
  /// ApiClient) pushes it to the account in the background — this controller itself
  /// has no API-client dependency, so it stays usable before login.
  Future<void> setMode(ThemeMode mode,
      {Future<void> Function(String)? onPersist}) async {
    state = mode;
    await prefs.setString(themeModePrefKey, _serialize(mode));
    if (onPersist != null) {
      try {
        await onPersist(_serialize(mode));
      } catch (_) {
        /* local choice still applies; next successful /me sync reconciles */
      }
    }
  }
}
