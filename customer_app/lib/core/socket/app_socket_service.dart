import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../auth/token_store.dart';
import '../config.dart';

/// App-lifetime connection (not per-screen) — a signed-in customer needs to hear
/// about a new bell notification (order placed/status/payment/delivery, promo
/// broadcasts) regardless of which screen they're on. Connects on login/session
/// restore, disconnects on logout. Event name mirrors
/// `backend/src/shared/events/index.ts`'s SOCKET_EVENTS.NOTIFICATION_NEW
/// ('notification:new') — no generated client contract to import here, so kept in
/// sync by hand. The server auto-joins every authenticated socket to its own
/// `user:{id}` room, so no explicit join call is needed here.
class AppSocketService {
  final TokenStore tokens;
  AppSocketService(this.tokens);

  io.Socket? _socket;
  final _notificationController = StreamController<Map<String, dynamic>>.broadcast();

  /// `{id, title, body, at}`
  Stream<Map<String, dynamic>> get notifications => _notificationController.stream;

  Future<void> connect() async {
    if (_socket != null) return;
    final token = await tokens.access();
    if (token == null) return;

    _socket = io.io(
      Config.socketUrl,
      io.OptionBuilder().setTransports(['websocket']).setAuth({'token': token}).build(),
    );
    _socket!.on('notification:new', (data) {
      if (data is Map) _notificationController.add(data.cast<String, dynamic>());
    });
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
