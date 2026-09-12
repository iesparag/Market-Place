import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/order.dart';
import '../checkout/payment_controller.dart';

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  Color _statusColor(BuildContext context, String s) => switch (s) {
        'fulfilled' || 'delivered' => BrandColors.success,
        'paid' => context.brand.primary,
        'cancelled' => BrandColors.danger,
        _ => BrandColors.textMuted,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My orders')),
      body: user == null
          ? Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.receipt_long_rounded, size: 48, color: BrandColors.textMuted),
                const SizedBox(height: 10),
                const Text('Sign in to see your orders', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 14),
                ElevatedButton(onPressed: () => context.push('/login'), child: const Text('Sign in')),
              ]),
            )
          : ref.watch(myOrdersProvider).when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: BrandColors.textMuted))),
              data: (orders) => orders.isEmpty
                  ? const Center(child: Text('No orders yet', style: TextStyle(color: BrandColors.textMuted)))
                  : RefreshIndicator(
                      onRefresh: () async => ref.invalidate(myOrdersProvider),
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: orders.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, i) => _OrderCard(order: orders[i], color: _statusColor(context, orders[i].status)),
                      ),
                    ),
            ),
    );
  }
}

class _OrderCard extends ConsumerStatefulWidget {
  final OrderModel order;
  final Color color;
  const _OrderCard({required this.order, required this.color});
  @override
  ConsumerState<_OrderCard> createState() => _OrderCardState();
}

class _OrderCardState extends ConsumerState<_OrderCard> {
  bool _paying = false;

  /// Owned here (not a provider): the native Razorpay listener must survive the
  /// async gap while the sheet is open, then be torn down exactly once.
  late final PaymentController _payment = PaymentController(ref.read(paymentRepoProvider));

  @override
  void dispose() {
    _payment.dispose();
    super.dispose();
  }

  /// Retry payment for an order that was placed but never paid.
  Future<void> _pay() async {
    setState(() => _paying = true);
    final result = await _payment.pay(orderId: widget.order.id, method: 'razorpay');
    if (!mounted) return;
    setState(() => _paying = false);

    final messenger = ScaffoldMessenger.of(context);
    switch (result) {
      case PayPaid():
        messenger.showSnackBar(const SnackBar(content: Text('Payment successful 🎉')));
        ref.invalidate(myOrdersProvider);
      case PayCod():
        ref.invalidate(myOrdersProvider);
      case PayCancelled():
        messenger.showSnackBar(const SnackBar(content: Text('Payment cancelled — your order is still saved.')));
      case PayPending(:final message):
        messenger.showSnackBar(SnackBar(content: Text(message)));
        // Outcome is uncertain, not absent — a UPI collect / wallet redirect can still
        // land after the sheet closes; the webhook settles it, so refresh once the
        // server has had a chance to hear about it.
        final settled = await _payment.waitForSettlement(widget.order.id);
        if (settled != null && mounted) ref.invalidate(myOrdersProvider);
      case PayFailed(:final message):
        messenger.showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: BrandColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(child: Text(order.number.isEmpty ? 'Order' : order.number, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace'))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(color: widget.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
              child: Text(order.status, style: TextStyle(color: widget.color, fontWeight: FontWeight.w700, fontSize: 12)),
            ),
          ]),
          const SizedBox(height: 6),
          Text('${order.itemCount} item(s)${order.total > 0 ? ' · ${rupees(order.total)}' : ''}',
              style: const TextStyle(color: BrandColors.textMuted, fontSize: 13)),
          if (order.createdAt != null)
            Text(timeAgo(order.createdAt), style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),

          if (order.refundedAmount > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('↩️ ${rupees(order.refundedAmount)} refunded',
                  style: const TextStyle(color: BrandColors.success, fontSize: 12.5, fontWeight: FontWeight.w600)),
            ),

          if (order.isCodPending)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Row(children: [
                const Text('💵', style: TextStyle(fontSize: 15)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text('Pay ${rupees(order.total)} in cash on delivery',
                      style: const TextStyle(color: BrandColors.textMuted, fontSize: 12.5)),
                ),
              ]),
            ),

          if (order.needsPayment) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 42,
              child: ElevatedButton(
                onPressed: _paying ? null : _pay,
                child: _paying
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(order.total > 0 ? 'Pay ${rupees(order.total)}' : 'Pay now'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
