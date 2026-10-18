import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../data/providers.dart';

class SupportMessage {
  final String role; // customer | bot | agent | system
  final String text;
  SupportMessage({required this.role, required this.text});
  factory SupportMessage.fromJson(Map<String, dynamic> j) =>
      SupportMessage(role: (j['role'] ?? '').toString(), text: (j['text'] ?? '').toString());
  bool get isMe => role == 'customer';
  bool get isSystem => role == 'system';
}

class RiderSupportState {
  final bool loading;
  final String? threadId;
  final List<SupportMessage> messages;
  final bool escalated;
  final bool sending;
  final String? error;
  const RiderSupportState({
    this.loading = true,
    this.threadId,
    this.messages = const [],
    this.escalated = false,
    this.sending = false,
    this.error,
  });
  RiderSupportState copyWith({
    bool? loading,
    String? threadId,
    List<SupportMessage>? messages,
    bool? escalated,
    bool? sending,
    String? error,
  }) =>
      RiderSupportState(
        loading: loading ?? this.loading,
        threadId: threadId ?? this.threadId,
        messages: messages ?? this.messages,
        escalated: escalated ?? this.escalated,
        sending: sending ?? this.sending,
        error: error,
      );
}

/// Drives the rider's help chat — same shape as customer_app's SupportController, but
/// talks to /rider-support (no bot/self-service tools: every message goes to a human).
class RiderSupportController extends StateNotifier<RiderSupportState> {
  final ApiClient _api;
  RiderSupportController(this._api) : super(const RiderSupportState()) {
    _init();
  }

  Future<void> _init() async {
    try {
      final thread = (await _api.post('/rider-support/threads') as Map).cast<String, dynamic>();
      state = state.copyWith(
        loading: false,
        threadId: thread['_id']?.toString(),
        messages: _parse(thread['messages']),
        escalated: thread['status'] == 'pending_admin',
      );
    } on ApiException catch (e) {
      state = state.copyWith(loading: false, error: e.message);
    } catch (_) {
      state = state.copyWith(loading: false, error: 'Could not start support chat.');
    }
  }

  Future<void> send(String text, {String? category}) async {
    final body = text.trim();
    final id = state.threadId;
    if (body.isEmpty || id == null || state.sending) return;
    state = state.copyWith(
      sending: true,
      error: null,
      messages: [...state.messages, SupportMessage(role: 'customer', text: body)],
    );
    try {
      final res = (await _api.post('/rider-support/threads/$id/message', body: {
        'text': body,
        if (category != null) 'category': category,
      }) as Map)
          .cast<String, dynamic>();
      final thread = (res['thread'] as Map?)?.cast<String, dynamic>();
      state = state.copyWith(
        sending: false,
        messages: thread != null ? _parse(thread['messages']) : state.messages,
        escalated: res['escalated'] == true || state.escalated,
      );
    } on ApiException catch (e) {
      state = state.copyWith(
        sending: false,
        messages: state.messages.take(state.messages.length - 1).toList(),
        error: e.status == 429 ? "You're sending messages too fast — give it a moment." : e.message,
      );
    } catch (_) {
      state = state.copyWith(
        sending: false,
        messages: state.messages.take(state.messages.length - 1).toList(),
        error: 'Message failed to send. Please try again.',
      );
    }
  }

  List<SupportMessage> _parse(dynamic raw) {
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((m) => SupportMessage.fromJson(m.cast<String, dynamic>())).toList();
  }
}

final riderSupportControllerProvider =
    StateNotifierProvider.autoDispose<RiderSupportController, RiderSupportState>(
  (ref) => RiderSupportController(ref.read(apiClientProvider)),
);
