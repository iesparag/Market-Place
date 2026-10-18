import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:flutter_ringtone_player/flutter_ringtone_player.dart';
import 'package:volume_controller/volume_controller.dart';
import 'package:permission_handler/permission_handler.dart';

/// Details of the currently ringing task assignment / offer alert.
class ActiveTaskAlert {
  final String taskId;
  final String orderNumber;
  final String kind; // 'offered' | 'assigned'
  final DateTime timestamp;

  ActiveTaskAlert({
    required this.taskId,
    required this.orderNumber,
    this.kind = 'assigned',
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();
}

/// App-lifetime alert manager:
/// 1. Plays a loud, piercing, continuous alarm ringtone on assignment/offer at full volume (STREAM_ALARM)
/// 2. Plays a short, distinct pop/chime tone when a task is removed/unassigned
/// 3. Supports custom bundled sound files (assets/sounds/) with automatic fallback to system alarm/notification
/// 4. Manages device volume override and continuous vibration
class AlertService extends ChangeNotifier {
  final FlutterTts _tts = FlutterTts();
  final FlutterRingtonePlayer _ringtonePlayer = FlutterRingtonePlayer();

  bool _ready = false;
  bool _isRinging = false;
  ActiveTaskAlert? _activeAlert;

  Timer? _autoStopTimer;
  Timer? _vibrationTimer;
  Timer? _speechLoopTimer;

  bool get isRinging => _isRinging;
  ActiveTaskAlert? get activeAlert => _activeAlert;

  Future<void> _ensureReady() async {
    if (_ready) return;
    try {
      await _tts.setVolume(1.0);
      await _tts.setSpeechRate(0.5);
      await _tts.setPitch(1.0);
      _ready = true;
    } catch (_) {}
  }

  /// Maximize device volume so the rider hears the alert even over traffic or while asleep.
  Future<void> _maximizeVolume() async {
    try {
      VolumeController.instance.showSystemUI = false;
      await VolumeController.instance.setVolume(1.0);
    } catch (_) {}
  }

  /// Request runtime notification permission (Android 13+).
  Future<void> requestPermission() async {
    try {
      await Permission.notification.request();
    } catch (_) {}
  }

  /// Play a loud, continuous assignment alarm at full volume.
  /// Bypasses silent/vibrate modes via Android's STREAM_ALARM.
  Future<void> playAssignmentAlert({
    required String taskId,
    required String orderNumber,
    String kind = 'assigned',
  }) async {
    // Cancel any previous alert cleanly before triggering
    stopAlert();

    _activeAlert = ActiveTaskAlert(taskId: taskId, orderNumber: orderNumber, kind: kind);
    _isRinging = true;
    notifyListeners();

    // Force volume to 100%
    await _maximizeVolume();

    // 1. Play loud looping sound:
    // First try bundled asset (assignment_loud.mp3), fallback to system Alarm
    try {
      await _ringtonePlayer.play(
        fromAsset: 'assets/sounds/assignment_loud.mp3',
        looping: true,
        volume: 1.0,
        asAlarm: true,
      );
    } catch (_) {
      try {
        await _ringtonePlayer.play(
          android: AndroidSounds.alarm,
          ios: IosSounds.alarm,
          looping: true,
          volume: 1.0,
          asAlarm: true,
        );
      } catch (_) {}
    }

    // 2. Repeating vibration pulses
    _vibrationTimer = Timer.periodic(const Duration(milliseconds: 1200), (_) {
      if (!_isRinging) return;
      try {
        HapticFeedback.heavyImpact();
      } catch (_) {}
    });

    // 3. Spoken voice announcement
    final text = kind == 'offered'
        ? 'New delivery offer available. Order number $orderNumber.'
        : 'New delivery task assigned! Order number $orderNumber. Please check your screen.';
    await speak(text);

    // Repeat voice alert every 10s if rider hasn't muted or opened it yet
    _speechLoopTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (!_isRinging) return;
      speak(text);
    });

    // 4. Auto-timeout safety after 35 seconds to avoid battery drain
    _autoStopTimer = Timer(const Duration(seconds: 35), () {
      stopAlert();
    });
  }

  /// Play a short, pleasant "pop" tone when a delivery task is removed, unassigned, or reassigned.
  Future<void> playRemovalAlert({
    required String orderNumber,
    String kind = 'unassigned',
  }) async {
    // 1. Silence any loud alarm that might have been ringing
    stopAlert();

    // 2. Play short pop tone:
    // First try bundled pop_removed.mp3, fallback to Android notification sound
    try {
      await _ringtonePlayer.play(
        fromAsset: 'assets/sounds/pop_removed.mp3',
        looping: false,
        volume: 0.9,
        asAlarm: false,
      );
    } catch (_) {
      try {
        await _ringtonePlayer.play(
          android: AndroidSounds.notification,
          ios: IosSounds.glass,
          looping: false,
          volume: 0.9,
          asAlarm: false,
        );
      } catch (_) {}
    }

    // 3. Gentle tactile feedback
    try {
      HapticFeedback.mediumImpact();
    } catch (_) {}

    // 4. Short voice confirmation
    final text = kind == 'reassigned'
        ? 'Delivery $orderNumber reassigned.'
        : 'Delivery $orderNumber removed from your queue.';
    await speak(text);
  }

  /// Stop all sounds, vibrations, and timers immediately.
  void stopAlert() {
    final wasRinging = _isRinging;
    _isRinging = false;
    _activeAlert = null;
    _autoStopTimer?.cancel();
    _autoStopTimer = null;
    _vibrationTimer?.cancel();
    _vibrationTimer = null;
    _speechLoopTimer?.cancel();
    _speechLoopTimer = null;

    try {
      _ringtonePlayer.stop();
    } catch (_) {}
    try {
      _tts.stop();
    } catch (_) {}

    if (wasRinging) {
      notifyListeners();
    }
  }

  Future<void> speak(String text) async {
    await _ensureReady();
    try {
      await _tts.speak(text);
    } catch (_) {}
  }

  @override
  void dispose() {
    stopAlert();
    super.dispose();
  }
}
