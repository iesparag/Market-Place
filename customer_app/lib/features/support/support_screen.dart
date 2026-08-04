import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../core/auth/auth_controller.dart';
import '../../models/support.dart';
import 'support_controller.dart';

class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});
  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _jumpToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  void _send() {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    _input.clear();
    ref.read(supportControllerProvider.notifier).send(text);
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider);
    if (user == null) return _signInPrompt(context);

    final state = ref.watch(supportControllerProvider);
    // Auto-scroll whenever the transcript grows or a reply is in-flight.
    ref.listen(supportControllerProvider, (_, __) => _jumpToBottom());

    return Scaffold(
      backgroundColor: context.brand.canvas,
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: context.brand.soft,
            child: Icon(Icons.support_agent_rounded, size: 20, color: context.brand.primaryDark),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Help & Support', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              Text(state.escalated ? 'Connected to our team' : 'AI assistant · usually instant',
                  style: const TextStyle(fontSize: 11, color: BrandColors.textMuted, fontWeight: FontWeight.w500)),
            ],
          ),
        ]),
      ),
      body: _body(context, state),
    );
  }

  Widget _body(BuildContext context, SupportState state) {
    if (state.loading) return const Center(child: CircularProgressIndicator());
    if (!state.channelOn) {
      return _notice(Icons.chat_bubble_outline_rounded, 'Support chat is currently unavailable.\nPlease try again later.');
    }
    if (state.threadId == null && state.error != null) {
      return _notice(Icons.wifi_off_rounded, state.error!, onRetry: () => ref.read(supportControllerProvider.notifier).retry());
    }

    return Column(
      children: [
        if (state.escalated) _escalationBanner(context),
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
            itemCount: state.messages.length + (state.sending ? 1 : 0),
            itemBuilder: (context, i) {
              if (i == state.messages.length) return _typing(context); // sending placeholder
              return _bubble(context, state.messages[i]);
            },
          ),
        ),
        if (state.error != null && state.threadId != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Text(state.error!, style: const TextStyle(color: BrandColors.danger, fontSize: 12.5)),
          ),
        _composer(context, state),
      ],
    );
  }

  Widget _bubble(BuildContext context, SupportMessage m) {
    if (m.isSystem) {
      return Center(
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(color: context.brand.soft, borderRadius: BorderRadius.circular(14)),
          child: Text(m.text,
              textAlign: TextAlign.center,
              style: TextStyle(color: context.brand.primaryDark, fontSize: 12.5, fontWeight: FontWeight.w600)),
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
          color: me ? context.brand.primary : BrandColors.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(me ? 16 : 4),
            bottomRight: Radius.circular(me ? 4 : 16),
          ),
          border: me ? null : Border.all(color: BrandColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!me && m.senderLabel != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(m.senderLabel!,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: context.brand.primaryDark)),
              ),
            Text(m.text,
                style: TextStyle(color: me ? Colors.white : BrandColors.ink, fontSize: 14.5, height: 1.35)),
          ],
        ),
      ),
    );
  }

  Widget _typing(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 5),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: BrandColors.surface,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(16),
              topRight: Radius.circular(16),
              bottomRight: Radius.circular(16),
              bottomLeft: Radius.circular(4),
            ),
            border: Border.all(color: BrandColors.border),
          ),
          child: SizedBox(
            width: 34,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(
                3,
                (_) => const DecoratedBox(
                  decoration: BoxDecoration(color: BrandColors.textMuted, shape: BoxShape.circle),
                  child: SizedBox(width: 7, height: 7),
                ),
              ),
            ),
          ),
        ),
      );

  Widget _escalationBanner(BuildContext context) => Container(
        width: double.infinity,
        color: context.brand.soft,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(children: [
          Icon(Icons.verified_user_outlined, size: 18, color: context.brand.primaryDark),
          const SizedBox(width: 8),
          Expanded(
            child: Text('A support specialist has been notified and will reply right here.',
                style: TextStyle(fontSize: 12.5, color: context.brand.primaryDark, fontWeight: FontWeight.w600)),
          ),
        ]),
      );

  Widget _composer(BuildContext context, SupportState state) {
    final canSend = !state.sending && state.threadId != null;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        decoration: const BoxDecoration(
          color: BrandColors.surface,
          border: Border(top: BorderSide(color: BrandColors.border)),
        ),
        child: Row(children: [
          Expanded(
            child: TextField(
              controller: _input,
              enabled: canSend,
              minLines: 1,
              maxLines: 4,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(),
              decoration: InputDecoration(
                hintText: 'Ask about an order, return, delivery…',
                filled: true,
                fillColor: context.brand.canvas,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: canSend ? _send : null,
            child: Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: canSend ? context.brand.primary : BrandColors.border,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.arrow_upward_rounded, color: Colors.white),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _notice(IconData icon, String text, {VoidCallback? onRetry}) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 46, color: BrandColors.textMuted),
            const SizedBox(height: 14),
            Text(text, textAlign: TextAlign.center, style: const TextStyle(color: BrandColors.textMuted, fontSize: 14.5)),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ]),
        ),
      );

  Widget _signInPrompt(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Help & Support')),
        backgroundColor: context.brand.canvas,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.support_agent_rounded, size: 56, color: context.brand.primary),
              const SizedBox(height: 16),
              const Text('Sign in to chat with support',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              const Text('Our assistant can check your orders, track deliveries and help with returns.',
                  textAlign: TextAlign.center, style: TextStyle(color: BrandColors.textMuted)),
              const SizedBox(height: 20),
              ElevatedButton(onPressed: () => context.push('/login'), child: const Text('Sign in')),
            ]),
          ),
        ),
      );
}
