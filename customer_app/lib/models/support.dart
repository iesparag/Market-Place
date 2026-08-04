// Support chat models — mirror the backend `support` module (docs/10-SUPPORT-AI.md).

class SupportMessage {
  final String role; // customer | bot | agent | system
  final String text;
  final DateTime? at;

  const SupportMessage({required this.role, required this.text, this.at});

  factory SupportMessage.fromJson(Map<String, dynamic> j) => SupportMessage(
        role: (j['role'] ?? 'system').toString(),
        text: (j['text'] ?? '').toString(),
        at: j['createdAt'] != null ? DateTime.tryParse(j['createdAt'].toString()) : null,
      );

  bool get isMe => role == 'customer';
  bool get isSystem => role == 'system';

  /// Who to label the bubble as (null = no label, e.g. the customer's own).
  String? get senderLabel {
    switch (role) {
      case 'bot':
        return 'Assistant';
      case 'agent':
        return 'Support agent';
      default:
        return null;
    }
  }
}

/// Immutable UI state for the support chat.
class SupportState {
  final bool loading; // first-load of thread + config
  final bool sending; // waiting on a bot/agent reply
  final bool botEnabled; // master switch from admin config
  final bool channelOn; // channels.app from admin config
  final String greeting;
  final String? threadId;
  final List<SupportMessage> messages;
  final bool escalated; // a human has been looped in
  final String? error;

  const SupportState({
    this.loading = true,
    this.sending = false,
    this.botEnabled = true,
    this.channelOn = true,
    this.greeting = '',
    this.threadId,
    this.messages = const [],
    this.escalated = false,
    this.error,
  });

  SupportState copyWith({
    bool? loading,
    bool? sending,
    bool? botEnabled,
    bool? channelOn,
    String? greeting,
    String? threadId,
    List<SupportMessage>? messages,
    bool? escalated,
    String? error,
  }) =>
      SupportState(
        loading: loading ?? this.loading,
        sending: sending ?? this.sending,
        botEnabled: botEnabled ?? this.botEnabled,
        channelOn: channelOn ?? this.channelOn,
        greeting: greeting ?? this.greeting,
        threadId: threadId ?? this.threadId,
        messages: messages ?? this.messages,
        escalated: escalated ?? this.escalated,
        error: error,
      );
}
