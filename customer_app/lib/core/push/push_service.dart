import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// Must be a top-level function — FCM invokes this in a separate isolate for
/// messages that arrive while the app is backgrounded/terminated. The OS shows the
/// system notification itself for a `notification`-payload push; nothing to do here
/// (reserved for a future data-only silent push).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {}

/// Call once at app start, before runApp. Every step is best-effort and silently
/// no-ops if Firebase hasn't been set up on this build (no google-services.json —
/// see android/app/build.gradle.kts) so the rest of the app keeps working exactly as
/// it did before push existed.
Future<void> initPush() async {
  try {
    await Firebase.initializeApp();
  } catch (e) {
    if (kDebugMode)
      debugPrint('[push] Firebase not configured — push disabled ($e)');
    return;
  }
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  try {
    await FirebaseMessaging.instance
        .requestPermission(alert: true, badge: true, sound: true);
  } catch (_) {
    /* permission dialog dismissed or unsupported platform — push just won't arrive */
  }
}

/// The device's current FCM token, or null if Firebase isn't configured/ready yet.
/// Call after [initPush] and whenever the caller wants to (re-)register it with the
/// backend — e.g. after login, since `/notifications/register-device` requires auth.
Future<String?> currentFcmToken() async {
  try {
    return await FirebaseMessaging.instance.getToken();
  } catch (_) {
    return null;
  }
}

/// Fires whenever FCM rotates the token (reinstall, app restore, periodic refresh) —
/// re-register it so the backend never sends push to a stale token. Null if Firebase
/// isn't configured on this build.
Stream<String>? fcmTokenRefreshStream() {
  try {
    return FirebaseMessaging.instance.onTokenRefresh;
  } catch (_) {
    return null;
  }
}

/// Deep-links a tapped push notification via [onLink] — the backend's notify() (see
/// notifications.module.ts) attaches `data.link` to anything meant to jump somewhere
/// specific (e.g. the abandoned-cart reminder → '/cart'), but nothing ever read that
/// field: tapping any notification just opened the app at its normal start screen.
/// Covers both cases a tap can happen: app backgrounded (onMessageOpenedApp) and app
/// fully closed (getInitialMessage, checked once at startup). Call once, right after
/// [initPush].
void listenForNotificationTaps(void Function(String link) onLink) {
  try {
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      final link = (message.data['actionLink'] as String?) ??
          (message.data['link'] as String?);
      if (link != null && link.isNotEmpty) onLink(link);
    });
    FirebaseMessaging.instance.getInitialMessage().then((message) {
      final link = (message?.data['actionLink'] as String?) ??
          (message?.data['link'] as String?);
      if (link != null && link.isNotEmpty) onLink(link);
    });
  } catch (_) {
    /* Firebase not configured on this build — push just won't deep-link */
  }
}
