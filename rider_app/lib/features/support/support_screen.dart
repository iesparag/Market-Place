import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/theme.dart';
import 'support_controller.dart';

const _categories = <(String, String)>[
  ('payout_issue', 'Payout / earnings'),
  ('delivery_issue', 'Delivery / task'),
  ('app_issue', 'App problem'),
  ('account', 'Account'),
  ('other', 'Other'),
];

/// Rider's help chat — structurally the same as customer_app's SupportScreen, but
/// every message goes straight to a human (no bot tools; riders don't have "orders"
/// to self-serve on). Reached from Home's app-bar help icon (not a bottom tab — a
/// rarely-used escape hatch, not a destination you flip back to).
class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});
  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  final _scroll = ScrollController();
  final _text = TextEditingController();
  String? _category;

  void _send(String text) {
    ref.read(riderSupportControllerProvider.notifier).send(text, category: _category);
    _text.clear();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(riderSupportControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Help & support')),
      body: state.loading
          ? const Center(child: CircularProgressIndicator())
          : state.threadId == null && state.error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(state.error!, textAlign: TextAlign.center, style: const TextStyle(color: RiderColors.danger)),
                  ),
                )
              : Column(
                  children: [
                    if (state.escalated)
                      Container(
                        width: double.infinity,
                        color: RiderColors.primary.withValues(alpha: 0.08),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        child: const Text('🤝 Passed to our support team — they will reply here shortly.',
                            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: RiderColors.primaryDark)),
                      ),
                    Expanded(
                      child: ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
                        itemCount: state.messages.length,
                        itemBuilder: (context, i) => _bubble(state.messages[i]),
                      ),
                    ),
                    if (state.error != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                        child: Text(state.error!, style: const TextStyle(color: RiderColors.danger, fontSize: 12.5)),
                      ),
                    SizedBox(
                      height: 40,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        children: [
                          for (final c in _categories) _categoryChip(c.$1, c.$2),
                        ],
                      ),
                    ),
                    const SizedBox(height: 6),
                    SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                        child: Row(children: [
                          Expanded(
                            child: TextField(
                              controller: _text,
                              decoration: const InputDecoration(hintText: 'Describe the issue…'),
                              onSubmitted: _send,
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton.filled(
                            onPressed: state.sending ? null : () => _send(_text.text),
                            icon: state.sending
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.send_rounded),
                          ),
                        ]),
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _categoryChip(String value, String label) {
    final selected = _category == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
        selected: selected,
        selectedColor: RiderColors.primary.withValues(alpha: 0.15),
        onSelected: (_) => setState(() => _category = selected ? null : value),
      ),
    );
  }

  Widget _bubble(SupportMessage m) {
    if (m.isSystem) {
      return Center(
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(color: RiderColors.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14)),
          child: Text(m.text, textAlign: TextAlign.center, style: const TextStyle(color: RiderColors.primaryDark, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      );
    }
    final me = m.isMe;
    return Align(
      alignment: me ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: me ? RiderColors.primary : RiderColors.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(me ? 16 : 4),
            bottomRight: Radius.circular(me ? 4 : 16),
          ),
          border: me ? null : Border.all(color: RiderColors.border),
        ),
        child: Text(m.text, style: TextStyle(color: me ? Colors.white : Colors.black87, fontSize: 14.5, height: 1.35)),
      ),
    );
  }
}
