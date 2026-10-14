import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../auth/token_store.dart';
import '../config.dart';

/// Live updates for exactly one order's room (`order:{id}` server-side) — status
/// changes and, once a rider is out for delivery, their GPS pings. One instance per
/// order-detail screen visit; connects on [join], tears down on [dispose].
///
/// Event names mirror `backend/src/shared/events/index.ts`'s SOCKET_EVENTS —
/// 'order:status_updated' and 'delivery:location' — there's no generated client
/// contract to import from here, so these are kept in sync by hand.
class OrderSocketService {
  final TokenStore tokens;
  OrderSocketService(this.tokens);

  io.Socket? _socket;
  String? _orderId;

  final _statusController = StreamController<Map<String, dynamic>>.broadcast();
  final _locationController = StreamController<Map<String, dynamic>>.broadcast();

  /// Emits whenever this order's status (or one of its delivery tasks') changes.
  Stream<Map<String, dynamic>> get statusUpdates => _statusController.stream;

  /// Emits `{lat, lng, at}` while a rider is actively delivering this order.
  Stream<Map<String, dynamic>> get locationUpdates => _locationController.stream;

  Future<void> join(String orderId) async {
    _orderId = orderId;
    final token = await tokens.access();
    if (token == null) return; // not signed in — no live updates, REST still works

    if (_socket == null) {
      _socket = io.io(
        Config.socketUrl,
        io.OptionBuilder()
            .setTransports(['websocket'])
            .setAuth({'token': token})
            .disableAutoConnect()
            .build(),
      );
      _socket!.onConnect((_) {
        if (_orderId != null) _socket!.emit('order:join', _orderId);
      });
      _socket!.on('order:status_updated', (data) {
        if (data is Map) _statusController.add(data.cast<String, dynamic>());
      });
      _socket!.on('delivery:location', (data) {
        if (data is Map) _locationController.add(data.cast<String, dynamic>());
      });
      _socket!.connect();
    } else if (_socket!.connected) {
      _socket!.emit('order:join', orderId);
    }
  }

  void dispose() {
    if (_orderId != null) _socket?.emit('order:leave', _orderId);
    _socket?.dispose();
    _socket = null;
    _statusController.close();
    _locationController.close();
  }
}
