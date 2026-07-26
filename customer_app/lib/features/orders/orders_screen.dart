import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/order.dart';

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

class _OrderCard extends StatelessWidget {
  final OrderModel order;
  final Color color;
  const _OrderCard({required this.order, required this.color});
  @override
  Widget build(BuildContext context) {
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
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
              child: Text(order.status, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
            ),
          ]),
          const SizedBox(height: 6),
          Text('${order.itemCount} item(s)${order.total > 0 ? ' · ${rupees(order.total)}' : ''}',
              style: const TextStyle(color: BrandColors.textMuted, fontSize: 13)),
          if (order.createdAt != null)
            Text(timeAgo(order.createdAt), style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
        ],
      ),
    );
  }
}
