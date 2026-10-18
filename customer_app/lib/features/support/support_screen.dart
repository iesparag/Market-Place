import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/theme.dart';
import '../../core/auth/auth_controller.dart';
import '../../data/providers.dart';
import '../../models/order.dart';
import '../../models/support.dart';
import '../../models/suggestion.dart';
import 'support_controller.dart';
import '../../shared/widgets/safe_pop_scope.dart';

/// Predefined quick-help prompts (the "predrine options"). "Other" = just type.
const _quickIntents = <String>[
  "Where's my order?",
  'Return or refund',
  'Cancel my order',
  'Payment issue',
  'Damaged / wrong item',
];

class _FaqItem {
  final String q;
  final String a;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _FaqItem({
    required this.q,
    required this.a,
    this.actionLabel,
    this.onAction,
  });
}

class SupportScreen extends ConsumerStatefulWidget {
  final String? initialIssue;
  final String? initialOrderId;
  const SupportScreen({super.key, this.initialIssue, this.initialOrderId});
  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen>
    with SingleTickerProviderStateMixin {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  late final TabController _tabController;

  // Selected context the customer attaches to their query.
  OrderModel? _order;
  SuggestProduct? _product;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    if (widget.initialIssue != null || widget.initialOrderId != null) {
      _tabController.index = 1;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        // Attach the order as context BEFORE sending, so the bot/agent sees it
        // (matches _helpWithRecentOrder's order-then-send sequencing below).
        if (widget.initialOrderId != null) {
          try {
            final order = await ref
                .read(apiClientProvider)
                .get('/orders/${widget.initialOrderId}');
            if (mounted) {
              setState(() => _order =
                  OrderModel.fromJson(order as Map<String, dynamic>));
            }
          } catch (_) {
            // Order fetch failed — still send the issue text, just without context.
          }
        }
        if (widget.initialIssue != null) {
          _send(widget.initialIssue);
        }
      });
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
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

  void _helpWithRecentOrder(OrderModel order, String issue) {
    setState(() => _order = order);
    _tabController.animateTo(1);
    _send(issue);
  }

  Future<void> _pickOrder() async {
    final picked = await showModalBottomSheet<OrderModel>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.colors.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => const _OrderPickerSheet(),
    );
    if (picked != null)
      setState(() => _order = picked.id.isEmpty ? null : picked);
  }

  Future<void> _pickProduct() async {
    final res = await showModalBottomSheet<Object>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.colors.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => const _ProductSearchSheet(),
    );
    if (!mounted) return;
    if (res is SuggestProduct) {
      setState(() => _product = res); // attach product as context
    } else if (res is SuggestCategory) {
      context.push(
          '/department/${res.slug}'); // category search → redirect to that screen
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider);
    if (user == null) return _signInPrompt(context);

    final state = ref.watch(supportControllerProvider);
    ref.listen(supportControllerProvider, (_, __) => _jumpToBottom());

    return SafePopScope(
      child: Scaffold(
        backgroundColor: context.brand.canvas,
        appBar: AppBar(
          leading: const AppBackButton(),
          titleSpacing: 0,
          title: Row(children: [
            CircleAvatar(
              radius: 16,
              backgroundColor: context.brand.soft,
              child: Icon(Icons.support_agent_rounded,
                  size: 20, color: context.brand.primaryDark),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Help & Support',
                    style: TextStyle(
                        color: context.colors.ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w800)),
                Text(
                    state.escalated
                        ? 'Connected to our team'
                        : '24x7 Customer Care & Assistant',
                    style: TextStyle(
                        fontSize: 11,
                        color: context.colors.textMuted,
                        fontWeight: FontWeight.w500)),
              ],
            ),
          ]),
          bottom: TabBar(
            controller: _tabController,
            indicatorColor: context.brand.primary,
            indicatorWeight: 3,
            labelColor: context.brand.primaryDark,
            unselectedLabelColor: context.colors.textMuted,
            labelStyle:
                const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5),
            tabs: const [
              Tab(text: 'Help Center & FAQs'),
              Tab(text: 'Live Support Chat'),
            ],
          ),
        ),
        body: TabBarView(
          controller: _tabController,
          children: [
            _helpCenterTab(context),
            _chatTab(context, state),
          ],
        ),
      ),
    );
  }

  // ── BigBasket-style Help Center Tab (Recent Orders + FAQs + Helpline) ────────
  Widget _helpCenterTab(BuildContext context) {
    final ordersAsync = ref.watch(myOrdersProvider);
    final b = context.brand;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        // Live Assistant Banner
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [b.primary, Color.lerp(b.primary, Colors.black, 0.25)!],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x22000000),
                  blurRadius: 10,
                  offset: Offset(0, 4)),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.forum_rounded, color: b.primary, size: 26),
              ),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('24x7 Support Assistant',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            fontSize: 16)),
                    SizedBox(height: 3),
                    Text(
                        'Instant help with orders, refunds, cancellations & policies',
                        style:
                            TextStyle(color: Colors.white70, fontSize: 11.5)),
                  ],
                ),
              ),
              ElevatedButton(
                onPressed: () => _tabController.animateTo(1),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: b.primaryDark,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  textStyle: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 12),
                ),
                child: const Text('Chat now ›'),
              ),
            ],
          ),
        ),

        const SizedBox(height: 20),

        // Need Help with a Recent Order? (BigBasket Flagship Feature)
        ordersAsync.when(
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
          data: (orders) {
            if (orders.isEmpty) return const SizedBox.shrink();
            final latest = orders.first;
            // Backend order.model.ts enum is pending/paid/fulfilled/cancelled/refunded — there is
            // no 'delivered' status, so match 'fulfilled' (same check as orders_screen.dart).
            final isDelivered = latest.status.toLowerCase() == 'fulfilled';
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Need help with recent order?',
                        style: TextStyle(
                            color: context.colors.ink,
                            fontSize: 16,
                            fontWeight: FontWeight.w800)),
                    GestureDetector(
                      onTap: () => context.push('/orders'),
                      child: Text('View all orders ›',
                          style: TextStyle(
                              color: b.primaryDark,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: context.colors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: context.colors.border),
                    boxShadow: const [
                      BoxShadow(
                          color: Color(0x08000000),
                          blurRadius: 8,
                          offset: Offset(0, 3)),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.receipt_long_rounded,
                                  size: 16, color: context.colors.textMuted),
                              const SizedBox(width: 6),
                              Text('Order #${latest.number}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13.5)),
                            ],
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: isDelivered
                                  ? const Color(0xFFDCFCE7)
                                  : const Color(0xFFFEF3C7),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              latest.status.toUpperCase(),
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w800,
                                color: isDelivered
                                    ? const Color(0xFF166534)
                                    : const Color(0xFF92400E),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${latest.items.length} item(s)${latest.amounts != null ? " · ₹${(latest.amounts!.grandTotal / 100).toStringAsFixed(0)}" : ""}',
                        style: TextStyle(
                            color: context.colors.textMuted, fontSize: 12.5),
                      ),
                      const SizedBox(height: 12),
                      const Divider(height: 1),
                      const SizedBox(height: 10),
                      Text('Quick resolution options:',
                          style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: context.colors.textMuted)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _orderIssueBtn(
                              context,
                              '📦 Missing / Damaged item',
                              () => _helpWithRecentOrder(latest,
                                  'I received damaged or missing items in Order #${latest.number}')),
                          _orderIssueBtn(
                              context,
                              '🚚 Where is my order?',
                              () => _helpWithRecentOrder(latest,
                                  "Where is my order #${latest.number}? Please track delivery.")),
                          _orderIssueBtn(
                              context,
                              '🧾 Bill & payment query',
                              () => _helpWithRecentOrder(latest,
                                  'I have a billing/payment issue with Order #${latest.number}')),
                          _orderIssueBtn(
                              context,
                              '🔄 Cancel / Return',
                              () => _helpWithRecentOrder(latest,
                                  'I want to cancel or return Order #${latest.number}')),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
              ],
            );
          },
        ),

        // Frequently Asked Questions (BigBasket-style Categorized Accordions)
        Text('Browse Help by Topic',
            style: TextStyle(
                color: context.colors.ink,
                fontSize: 16,
                fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text('Common questions answered instantly',
            style: TextStyle(fontSize: 12, color: context.colors.textMuted)),
        const SizedBox(height: 12),

        _faqCategoryCard(
          icon: Icons.local_shipping_outlined,
          title: 'Delivery & Order Tracking',
          color: const Color(0xFF0284C7),
          faqs: [
            _FaqItem(
              q: 'How do I track my order in real-time?',
              a: 'Once your order is confirmed and assigned to a rider, open the Orders tab and tap on your order. You can see live status progression from packed to out-for-delivery, along with rider contact details.',
              actionLabel: 'Go to Orders',
              onAction: () => context.push('/orders'),
            ),
            _FaqItem(
              q: 'Can I change my delivery address after placing an order?',
              a: 'You can update your address before the vendor packs the order by contacting support. Once the order is out for delivery with the rider, route changes are restricted.',
              actionLabel: 'Chat with Agent',
              onAction: () => _tabController.animateTo(1),
            ),
            const _FaqItem(
              q: 'What if my delivery is delayed?',
              a: 'During peak hours, severe traffic, or bad weather, delivery might take a few extra minutes. Our system automatically alerts you with updated ETAs.',
            ),
          ],
        ),

        const SizedBox(height: 10),

        _faqCategoryCard(
          icon: Icons.currency_rupee_rounded,
          title: 'Payments & Refunds',
          color: const Color(0xFF10B981),
          faqs: [
            const _FaqItem(
              q: 'When will I receive my refund?',
              a: 'Refunds for cancelled orders or returned items are initiated immediately. UPI and wallet refunds typically reflect within 2 to 4 hours. Credit/Debit card refunds reflect in 3 to 5 business days per your bank.',
            ),
            _FaqItem(
              q: 'Money was debited from my bank but order was not confirmed?',
              a: 'This usually occurs when payment gateways experience brief bank connection lags. The debited amount is automatically reversed by your bank within 24 to 48 hours.',
              actionLabel: 'Report Payment Query',
              onAction: () {
                _tabController.animateTo(1);
                _send(
                    'Money deducted from my bank but order was not confirmed');
              },
            ),
          ],
        ),

        const SizedBox(height: 10),

        _faqCategoryCard(
          icon: Icons.swap_horiz_rounded,
          title: 'Returns & Cancellations',
          color: const Color(0xFFF59E0B),
          faqs: [
            _FaqItem(
              q: 'How do I cancel my order?',
              a: 'You can cancel any unshipped order directly from the Order Details screen or by telling our Support Assistant. Once cancelled, full refund is immediately credited.',
              actionLabel: 'Cancel via Assistant',
              onAction: () {
                _tabController.animateTo(1);
                _send('I want to cancel an order');
              },
            ),
            _FaqItem(
              q: 'What should I do if items are damaged or defective?',
              a: 'Please report any damaged, spoiled or missing items within 24 hours of delivery. You can upload pictures and receive an instant refund or replacement.',
              actionLabel: 'Report Issue',
              onAction: () {
                _tabController.animateTo(1);
                _send('I have damaged or defective items in my delivery');
              },
            ),
          ],
        ),

        const SizedBox(height: 10),

        _faqCategoryCard(
          icon: Icons.storefront_rounded,
          title: 'Multi-Store Orders & Vendors',
          color: const Color(0xFF8B5CF6),
          faqs: const [
            _FaqItem(
              q: 'How does ordering from multiple stores in one cart work?',
              a: 'You can add items from multiple local stores into a single cart. The system automatically splits the order into sub-orders for each store. Each vendor prepares their portion independently.',
            ),
            _FaqItem(
              q: 'Will items from different stores arrive together?',
              a: 'Depending on vendor preparation times and rider dispatch, packages from different stores may arrive separately or consolidated by our logistics team.',
            ),
          ],
        ),

        const SizedBox(height: 24),

        // Direct Helpline & Support Channels
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.colors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Still need help? Reach us directly',
                  style: TextStyle(
                      color: context.colors.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 14.5)),
              const SizedBox(height: 12),
              _contactRow(
                icon: Icons.call_rounded,
                color: const Color(0xFF10B981),
                title: 'Toll-Free Customer Helpline',
                subtitle: '1800-419-7878 (9:00 AM – 11:00 PM)',
                onTap: () => launchUrl(Uri.parse('tel:18004197878')),
              ),
              const Divider(height: 20),
              _contactRow(
                icon: Icons.email_outlined,
                color: const Color(0xFF0284C7),
                title: 'Email Customer Support',
                subtitle: 'care@marketplace.com',
                onTap: () =>
                    launchUrl(Uri.parse('mailto:care@marketplace.com')),
              ),
              const Divider(height: 20),
              _contactRow(
                icon: Icons.chat_bubble_outline_rounded,
                color: const Color(0xFF8B5CF6),
                title: 'Interactive 24x7 Assistant',
                subtitle: 'Instant self-service & human agent escalation',
                onTap: () => _tabController.animateTo(1),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _orderIssueBtn(
      BuildContext context, String title, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: context.brand.soft,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color:
                  Color.lerp(context.brand.soft, context.brand.primary, 0.3)!),
        ),
        child: Text(
          title,
          style: TextStyle(
            color: context.brand.primaryDark,
            fontWeight: FontWeight.w700,
            fontSize: 11.5,
          ),
        ),
      ),
    );
  }

  Widget _contactRow({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 13.5)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: TextStyle(
                        color: context.colors.textMuted, fontSize: 11.5)),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded,
              color: context.colors.textMuted, size: 20),
        ],
      ),
    );
  }

  Widget _faqCategoryCard({
    required IconData icon,
    required String title,
    required Color color,
    required List<_FaqItem> faqs,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.colors.border),
      ),
      child: ExpansionTile(
        leading: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
          child: Icon(icon, color: color, size: 18),
        ),
        title: Text(title,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
        tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        children: faqs.map((f) => _faqTile(f)).toList(),
      ),
    );
  }

  Widget _faqTile(_FaqItem f) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(f.q,
              style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: context.colors.ink)),
          const SizedBox(height: 6),
          Text(f.a,
              style: TextStyle(
                  fontSize: 12, height: 1.4, color: context.colors.textMuted)),
          if (f.actionLabel != null && f.onAction != null) ...[
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: f.onAction,
                style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    visualDensity: VisualDensity.compact),
                child: Text('${f.actionLabel} ›',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 12)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ── Chat Tab (AI Assistant & Agent conversation) ─────────────────────────────
  Widget _chatTab(BuildContext context, SupportState state) {
    if (state.loading) return const Center(child: CircularProgressIndicator());
    if (!state.channelOn) {
      return _notice(Icons.chat_bubble_outline_rounded,
          'Support chat is currently unavailable.\nPlease try again later.');
    }
    if (state.threadId == null && state.error != null) {
      return _notice(Icons.wifi_off_rounded, state.error!,
          onRetry: () => ref.read(supportControllerProvider.notifier).retry());
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
            child: Text(state.error!,
                style: TextStyle(color: context.colors.danger, fontSize: 12.5)),
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
      color: context.colors.surface,
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasContext)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
              child: Wrap(spacing: 8, runSpacing: 4, children: [
                if (_order != null)
                  _contextChip(context, Icons.receipt_long_rounded,
                      'Order ${_order!.number}',
                      onRemove: () => setState(() => _order = null),
                      onView: () => context.push('/orders')),
                if (_product != null)
                  _contextChip(
                      context, Icons.inventory_2_outlined, _product!.title,
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
                _actionChip(
                    context,
                    Icons.receipt_long_rounded,
                    _order == null ? 'Select order' : 'Change order',
                    _pickOrder),
                _actionChip(context, Icons.search_rounded, 'Find product',
                    _pickProduct),
                const SizedBox(width: 4),
                for (final q in _quickIntents) _intentChip(context, q),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionChip(
          BuildContext c, IconData icon, String label, VoidCallback onTap) =>
      Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ActionChip(
          avatar: Icon(icon, size: 17, color: c.brand.primaryDark),
          label: Text(label),
          labelStyle: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: c.brand.primaryDark),
          backgroundColor: c.brand.soft,
          side: BorderSide.none,
          onPressed: onTap,
        ),
      );

  Widget _intentChip(BuildContext c, String text) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ActionChip(
          label: Text(text),
          labelStyle: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: context.colors.ink),
          backgroundColor: context.colors.surface,
          shape: StadiumBorder(side: BorderSide(color: context.colors.border)),
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
        labelStyle: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: c.brand.primaryDark),
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
          decoration: BoxDecoration(
              color: context.brand.soft,
              borderRadius: BorderRadius.circular(14)),
          child: Text(m.text,
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: context.brand.primaryDark,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600)),
        ),
      );
    }
    final me = m.isMe;
    return Align(
      alignment: me ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints:
            BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: me ? context.brand.primary : context.colors.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(me ? 16 : 4),
            bottomRight: Radius.circular(me ? 4 : 16),
          ),
          border: me ? null : Border.all(color: context.colors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!me && m.senderLabel != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(m.senderLabel!,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: context.brand.primaryDark)),
              ),
            Text(m.text,
                style: TextStyle(
                    color: me ? Colors.white : context.colors.ink,
                    fontSize: 14.5,
                    height: 1.35)),
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
            color: context.colors.surface,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(16),
              topRight: Radius.circular(16),
              bottomRight: Radius.circular(16),
              bottomLeft: Radius.circular(4),
            ),
            border: Border.all(color: context.colors.border),
          ),
          child: SizedBox(
            width: 34,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(
                3,
                (_) => DecoratedBox(
                  decoration: BoxDecoration(
                      color: context.colors.textMuted, shape: BoxShape.circle),
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
          Icon(Icons.verified_user_outlined,
              size: 18, color: context.brand.primaryDark),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
                'A support specialist has been notified and will reply right here.',
                style: TextStyle(
                    fontSize: 12.5,
                    color: context.brand.primaryDark,
                    fontWeight: FontWeight.w600)),
          ),
        ]),
      );

  Widget _composer(BuildContext context, SupportState state) {
    final canSend = !state.sending && state.threadId != null;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        decoration: BoxDecoration(
          color: context.colors.surface,
          border: Border(top: BorderSide(color: context.colors.border)),
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
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: canSend ? () => _send() : null,
            child: Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                  color:
                      canSend ? context.brand.primary : context.colors.border,
                  shape: BoxShape.circle),
              child:
                  const Icon(Icons.arrow_upward_rounded, color: Colors.white),
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
            Icon(icon, size: 46, color: context.colors.textMuted),
            const SizedBox(height: 14),
            Text(text,
                textAlign: TextAlign.center,
                style:
                    TextStyle(color: context.colors.textMuted, fontSize: 14.5)),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              OutlinedButton(
                  onPressed: onRetry, child: const Text('Try again')),
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
              Icon(Icons.support_agent_rounded,
                  size: 56, color: context.brand.primary),
              const SizedBox(height: 16),
              Text('Sign in to chat with support',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: context.colors.ink,
                      fontSize: 17,
                      fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text(
                  'Our assistant can check your orders, track deliveries and help with returns.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.colors.textMuted)),
              const SizedBox(height: 20),
              ElevatedButton(
                  onPressed: () => context.push('/login'),
                  child: const Text('Sign in')),
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
          Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: context.colors.border,
                  borderRadius: BorderRadius.circular(2))),
          Padding(
            padding: EdgeInsets.fromLTRB(20, 14, 20, 6),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('Which order is this about?',
                  style: TextStyle(
                      color: context.colors.ink,
                      fontSize: 16,
                      fontWeight: FontWeight.w800)),
            ),
          ),
          Expanded(
            child: orders.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) =>
                  const Center(child: Text('Could not load your orders')),
              data: (list) {
                if (list.isEmpty) {
                  return const Center(
                      child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text('You have no orders yet.')));
                }
                return ListView.separated(
                  controller: controller,
                  itemCount: list.length + 1,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    if (i == 0) {
                      return ListTile(
                        leading: Icon(Icons.chat_bubble_outline_rounded,
                            color: context.colors.textMuted),
                        title:
                            const Text('General question (no specific order)'),
                        onTap: () => Navigator.pop(
                            context,
                            OrderModel(
                                id: '',
                                number: '',
                                status: '',
                                total: 0,
                                itemCount: 0)),
                      );
                    }
                    final o = list[i - 1];
                    return ListTile(
                      leading: CircleAvatar(
                          backgroundColor: context.brand.soft,
                          child: Icon(Icons.receipt_long_rounded,
                              color: context.brand.primaryDark, size: 20)),
                      title: Text('Order ${o.number}',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(
                          '${o.status} · ${o.itemCount} item(s) · ${_money(o.total)}'),
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
  ConsumerState<_ProductSearchSheet> createState() =>
      _ProductSearchSheetState();
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
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: context.colors.textMuted,
                letterSpacing: 0.4)),
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
            Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: context.colors.border,
                    borderRadius: BorderRadius.circular(2))),
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
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none),
                ),
              ),
            ),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: (_results.isEmpty && _categories.isEmpty)
                  ? Center(
                      child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text('Type to search products & categories',
                              style:
                                  TextStyle(color: context.colors.textMuted))))
                  : ListView(
                      controller: controller,
                      children: [
                        if (_categories.isNotEmpty) _header('Categories'),
                        ..._categories.map((cat) => ListTile(
                              leading: Icon(Icons.category_outlined,
                                  color: context.brand.primaryDark),
                              title: Text(cat.name,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600)),
                              trailing: const Icon(Icons.north_east_rounded,
                                  size: 16),
                              // Category → redirect straight to that catalog screen.
                              onTap: () => Navigator.pop(context, cat),
                            )),
                        if (_results.isNotEmpty) _header('Products'),
                        ..._results.map((p) => ListTile(
                              leading: Icon(Icons.inventory_2_outlined,
                                  color: context.colors.textMuted),
                              title: Text(p.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600)),
                              subtitle: p.storeName != null
                                  ? Text(p.storeName!)
                                  : null,
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
