import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../auth/token_store.dart';
import '../config.dart';

/// App-lifetime connection (not per-screen) — a rider needs to hear about a new offer
/// or an assignment/unassignment regardless of which screen they're on. Connects on
/// login/session-restore, disconnects on logout. Event name mirrors
/// `backend/src/shared/events/index.ts`'s SOCKET_EVENTS.DELIVERY_TASK_EVENT
/// ('delivery:task_event') — no generated client contract to import here, so kept in
/// sync by hand.
class RiderSocketService {
  final TokenStore tokens;
  RiderSocketService(this.tokens);

  io.Socket? _socket;
  final _taskEventController = StreamController<Map<String, dynamic>>.broadcast();

  /// `{taskId, orderNumber, kind: offered|assigned|unassigned|reassigned, riderName?, at}`
  Stream<Map<String, dynamic>> get taskEvents => _taskEventController.stream;

  Future<void> connect() async {
    if (_socket != null) return;
    final token = await tokens.access();
    if (token == null) return;

    _socket = io.io(
      Config.socketUrl,
      io.OptionBuilder().setTransports(['websocket']).setAuth({'token': token}).build(),
    );
    _socket!.on('delivery:task_event', (data) {
      if (data is Map) _taskEventController.add(data.cast<String, dynamic>());
    });
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
