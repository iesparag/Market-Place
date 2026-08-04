import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../data/providers.dart';
import '../../models/support.dart';

/// Drives the support chat: loads config + thread, sends messages, tracks escalation.
/// All the guardrails live server-side — this just talks to `/support/*`.
class SupportController extends StateNotifier<SupportState> {
  final ApiClient _api;
  SupportController(this._api) : super(const SupportState()) {
    _init();
  }

  Future<void> _init() async {
    try {
      // 1) public config — greeting + whether the bot / app channel is on.
      final cfg = (await _api.get('/support/config/public') as Map).cast<String, dynamic>();
      final channels = (cfg['channels'] as Map?)?.cast<String, dynamic>() ?? const {};
      final botEnabled = cfg['botEnabled'] != false;
      final channelOn = channels['app'] != false;
      final greeting = (cfg['greeting'] ?? '').toString();

      if (!channelOn) {
        state = state.copyWith(loading: false, botEnabled: botEnabled, channelOn: false, greeting: greeting);
        return;
      }

      // 2) open (or reuse) my thread — returns the transcript so far.
      final thread = (await _api.post('/support/threads', body: {'channel': 'app'}) as Map).cast<String, dynamic>();
      state = state.copyWith(
        loading: false,
        botEnabled: botEnabled,
        channelOn: true,
        greeting: greeting,
        threadId: thread['_id']?.toString(),
        messages: _parseMessages(thread['messages']),
        escalated: thread['status'] == 'pending_admin',
      );
    } on ApiException catch (e) {
      state = state.copyWith(loading: false, error: e.message);
    } catch (_) {
      state = state.copyWith(loading: false, error: 'Could not start support chat.');
    }
  }

  Future<void> send(String text, {String? orderId, String? productTitle}) async {
    final body = text.trim();
    final id = state.threadId;
    if (body.isEmpty || id == null || state.sending) return;

    // Optimistic: show the customer's message immediately, then the reply.
    state = state.copyWith(
      sending: true,
      error: null,
      messages: [...state.messages, SupportMessage(role: 'customer', text: body, at: DateTime.now())],
    );

    final context = <String, dynamic>{
      if (orderId != null && orderId.isNotEmpty) 'orderId': orderId,
      if (productTitle != null && productTitle.isNotEmpty) 'productTitle': productTitle,
    };

    try {
      final res = (await _api.post('/support/threads/$id/message',
              body: {'text': body, if (context.isNotEmpty) 'context': context}) as Map)
          .cast<String, dynamic>();
      final thread = (res['thread'] as Map?)?.cast<String, dynamic>();
      state = state.copyWith(
        sending: false,
        // Rebuild from the authoritative server transcript (dedupes the optimistic bubble).
        messages: thread != null ? _parseMessages(thread['messages']) : state.messages,
        escalated: res['escalated'] == true || state.escalated,
      );
    } on ApiException catch (e) {
      // Roll back the optimistic bubble; surface a friendly error.
      state = state.copyWith(
        sending: false,
        messages: state.messages.take(state.messages.length - 1).toList(),
        error: e.status == 429 ? 'You’re sending messages too fast — give it a moment.' : e.message,
      );
    } catch (_) {
      state = state.copyWith(
        sending: false,
        messages: state.messages.take(state.messages.length - 1).toList(),
        error: 'Message failed to send. Please try again.',
      );
    }
  }

  void retry() {
    state = const SupportState();
    _init();
  }

  List<SupportMessage> _parseMessages(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((m) => SupportMessage.fromJson(m.cast<String, dynamic>()))
        .toList();
  }
}

final supportControllerProvider =
    StateNotifierProvider.autoDispose<SupportController, SupportState>(
  (ref) => SupportController(ref.read(apiClientProvider)),
);
