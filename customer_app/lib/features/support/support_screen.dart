import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../core/auth/auth_controller.dart';
import '../../data/providers.dart';
import '../../models/order.dart';
import '../../models/support.dart';
import '../../models/suggestion.dart';
import 'support_controller.dart';

/// Predefined quick-help prompts (the "predrine options"). "Other" = just type.
const _quickIntents = <String>[
  "Where's my order?",
  'Return or refund',
  'Cancel my order',
  'Payment issue',
  'Damaged / wrong item',
];

class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});
  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  // Selected context the customer attaches to their query.
  OrderModel? _order;
  SuggestProduct? _product;

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

  void _send([String? preset]) {
    final text = (preset ?? _input.text).trim();
    if (text.isEmpty) return;
    if (preset == null) _input.clear();
    ref
        .read(supportControllerProvider.notifier)
        .send(text, orderId: _order?.id, productTitle: _product?.title);
  }

  Future<void> _pickOrder() async {
    final picked = await showModalBottomSheet<OrderModel>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => const _OrderPickerSheet(),
    );
    if (picked != null) setState(() => _order = picked.id.isEmpty ? null : picked);
  }

  Future<void> _pickProduct() async {
    final res = await showModalBottomSheet<Object>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => const _ProductSearchSheet(),
    );
    if (!mounted) return;
    if (res is SuggestProduct) {
      setState(() => _product = res); // attach product as context
    } else if (res is SuggestCategory) {
      context.push('/department/${res.slug}'); // category search → redirect to that screen
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider);
    if (user == null) return _signInPrompt(context);

    final state = ref.watch(supportControllerProvider);
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
              if (i == state.messages.length) return _typing(context);
              return _bubble(context, state.messages[i]);
            },
          ),
        ),
        if (state.error != null && state.threadId != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Text(state.error!, style: const TextStyle(color: BrandColors.danger, fontSize: 12.5)),
          ),
        _assistBar(context, state),
        _composer(context, state),
      ],
    );
  }

  // ── attach-context + quick prompts ──────────────────────────────────────────
  Widget _assistBar(BuildContext context, SupportState state) {
    final hasContext = _order != null || _product != null;
    return Container(
      color: BrandColors.surface,
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasContext)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
              child: Wrap(spacing: 8, runSpacing: 4, children: [
                if (_order != null)
                  _contextChip(context, Icons.receipt_long_rounded, 'Order ${_order!.number}',
                      onRemove: () => setState(() => _order = null), onView: () => context.push('/orders')),
                if (_product != null)
                  _contextChip(context, Icons.inventory_2_outlined, _product!.title,
                      onRemove: () => setState(() => _product = null),
                      onView: () => context.push('/p/${_product!.slug}')),
              ]),
            ),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                _actionChip(context, Icons.receipt_long_rounded, _order == null ? 'Select order' : 'Change order', _pickOrder),
                _actionChip(context, Icons.search_rounded, 'Find product', _pickProduct),
                const SizedBox(width: 4),
                for (final q in _quickIntents) _intentChip(context, q),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionChip(BuildContext c, IconData icon, String label, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ActionChip(
          avatar: Icon(icon, size: 17, color: c.brand.primaryDark),
          label: Text(label),
          labelStyle: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: c.brand.primaryDark),
          backgroundColor: c.brand.soft,
          side: BorderSide.none,
          onPressed: onTap,
        ),
      );

  Widget _intentChip(BuildContext c, String text) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ActionChip(
          label: Text(text),
          labelStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: BrandColors.ink),
          backgroundColor: BrandColors.surface,
          shape: const StadiumBorder(side: BorderSide(color: BrandColors.border)),
          onPressed: () => _send(text),
        ),
      );

  Widget _contextChip(BuildContext c, IconData icon, String label,
          {required VoidCallback onRemove, VoidCallback? onView}) =>
      InputChip(
        avatar: Icon(icon, size: 16, color: c.brand.primaryDark),
        label: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 180),
          child: Text(label, overflow: TextOverflow.ellipsis),
        ),
        labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c.brand.primaryDark),
        backgroundColor: c.brand.soft,
        side: BorderSide.none,
        onPressed: onView, // tap → open that screen (redirect)
        onDeleted: onRemove,
        deleteIcon: const Icon(Icons.close_rounded, size: 15),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        visualDensity: VisualDensity.compact,
      );

  // ── message bubbles ─────────────────────────────────────────────────────────
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
            Text(m.text, style: TextStyle(color: me ? Colors.white : BrandColors.ink, fontSize: 14.5, height: 1.35)),
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
                hintText: 'Or type your own message…',
                filled: true,
                fillColor: context.brand.canvas,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: canSend ? () => _send() : null,
            child: Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(color: canSend ? context.brand.primary : BrandColors.border, shape: BoxShape.circle),
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

// ── Order picker (recent orders as selectable tiles) ──────────────────────────
class _OrderPickerSheet extends ConsumerWidget {
  const _OrderPickerSheet();

  String _money(int paise) => '₹${(paise / 100).toStringAsFixed(0)}';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(myOrdersProvider);
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      expand: false,
      builder: (context, controller) => Column(
        children: [
          const SizedBox(height: 10),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: BrandColors.border, borderRadius: BorderRadius.circular(2))),
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 14, 20, 6),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('Which order is this about?', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            ),
          ),
          Expanded(
            child: orders.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const Center(child: Text('Could not load your orders')),
              data: (list) {
                if (list.isEmpty) {
                  return const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('You have no orders yet.')));
                }
                return ListView.separated(
                  controller: controller,
                  itemCount: list.length + 1,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    if (i == 0) {
                      return ListTile(
                        leading: const Icon(Icons.chat_bubble_outline_rounded, color: BrandColors.textMuted),
                        title: const Text('General question (no specific order)'),
                        onTap: () => Navigator.pop(context, OrderModel(id: '', number: '', status: '', total: 0, itemCount: 0)),
                      );
                    }
                    final o = list[i - 1];
                    return ListTile(
                      leading: CircleAvatar(backgroundColor: context.brand.soft, child: Icon(Icons.receipt_long_rounded, color: context.brand.primaryDark, size: 20)),
                      title: Text('Order ${o.number}', style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('${o.status} · ${o.itemCount} item(s) · ${_money(o.total)}'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => Navigator.pop(context, o),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ── Product search (attach a product to the query) ────────────────────────────
class _ProductSearchSheet extends ConsumerStatefulWidget {
  const _ProductSearchSheet();
  @override
  ConsumerState<_ProductSearchSheet> createState() => _ProductSearchSheetState();
}

class _ProductSearchSheetState extends ConsumerState<_ProductSearchSheet> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  List<SuggestProduct> _results = [];
  List<SuggestCategory> _categories = [];
  bool _loading = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() {
        _results = [];
        _categories = [];
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      setState(() => _loading = true);
      try {
        final s = await ref.read(catalogRepoProvider).suggest(q.trim());
        if (mounted) {
          setState(() {
            _results = s.products;
            _categories = s.categories;
          });
        }
      } catch (_) {
        if (mounted) {
          setState(() {
            _results = [];
            _categories = [];
          });
        }
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    });
  }

  Widget _header(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Text(t,
            style: const TextStyle(
                fontSize: 12, fontWeight: FontWeight.w800, color: BrandColors.textMuted, letterSpacing: 0.4)),
      );

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.5,
        maxChildSize: 0.92,
        expand: false,
        builder: (context, controller) => Column(
          children: [
            const SizedBox(height: 10),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: BrandColors.border, borderRadius: BorderRadius.circular(2))),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              child: TextField(
                controller: _ctrl,
                autofocus: true,
                onChanged: _onChanged,
                decoration: InputDecoration(
                  hintText: 'Search a product…',
                  prefixIcon: const Icon(Icons.search_rounded),
                  filled: true,
                  fillColor: context.brand.canvas,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                ),
              ),
            ),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: (_results.isEmpty && _categories.isEmpty)
                  ? const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Type to search products & categories', style: TextStyle(color: BrandColors.textMuted))))
                  : ListView(
                      controller: controller,
                      children: [
                        if (_categories.isNotEmpty) _header('Categories'),
                        ..._categories.map((cat) => ListTile(
                              leading: Icon(Icons.category_outlined, color: context.brand.primaryDark),
                              title: Text(cat.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                              trailing: const Icon(Icons.north_east_rounded, size: 16),
                              // Category → redirect straight to that catalog screen.
                              onTap: () => Navigator.pop(context, cat),
                            )),
                        if (_results.isNotEmpty) _header('Products'),
                        ..._results.map((p) => ListTile(
                              leading: const Icon(Icons.inventory_2_outlined, color: BrandColors.textMuted),
                              title: Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: p.storeName != null ? Text(p.storeName!) : null,
                              // Product → attach as context to the support query.
                              onTap: () => Navigator.pop(context, p),
                            )),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
