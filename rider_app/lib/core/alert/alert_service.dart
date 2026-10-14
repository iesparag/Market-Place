import 'package:flutter_tts/flutter_tts.dart';
import 'package:permission_handler/permission_handler.dart';

/// A loud, spoken alert for job offers/assignments — a toast or a quiet system beep
/// is easy to miss for a rider who's riding and not looking at the screen. Speech at
/// max volume is louder and more identifiable than a generic tone, and it needs no
/// bundled sound asset. One instance for the app's lifetime (see providers.dart).
class AlertService {
  final FlutterTts _tts = FlutterTts();
  bool _ready = false;

  Future<void> _ensureReady() async {
    if (_ready) return;
    // Max volume regardless of the device's current media/ringer volume — the whole
    // point is to be heard over traffic/riding noise.
    await _tts.setVolume(1.0);
    await _tts.setSpeechRate(0.5);
    await _tts.setPitch(1.0);
    _ready = true;
  }

  /// Call once on app start/login — Android 13+ requires explicit runtime permission
  /// before any notification-adjacent alert; harmless no-op on platforms that don't need it.
  Future<void> requestPermission() async {
    try {
      await Permission.notification.request();
    } catch (_) {/* best-effort — speech alerts still work without it */}
  }

  Future<void> speak(String text) async {
    await _ensureReady();
    try {
      await _tts.speak(text);
    } catch (_) {/* a missed alert shouldn't crash the app */}
  }

  void dispose() {
    _tts.stop();
  }
}
