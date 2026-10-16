import 'package:flutter/material.dart';
import '../../shared/widgets/error_view.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/order.dart';
import 'pay_order_button.dart';

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});
  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  DateTimeRange? _range;

  Future<void> _pickRange(List<OrderModel> orders) async {
    final dated = orders.where((o) => o.createdAt != null).toList();
    final earliest = dated.isEmpty
        ? DateTime.now().subtract(const Duration(days: 365))
        : dated.map((o) => DateTime.parse(o.createdAt!)).reduce((a, b) => a.isBefore(b) ? a : b);
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(earliest.year, earliest.month, earliest.day),
      lastDate: DateTime.now(),
      initialDateRange: _range,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: context.brand.primary)),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _range = picked);
  }

  List<OrderModel> _filtered(List<OrderModel> orders) {
    if (_range == null) return orders;
    final start = DateTime(_range!.start.year, _range!.start.month, _range!.start.day);
    final end = DateTime(_range!.end.year, _range!.end.month, _range!.end.day, 23, 59, 59);
    return orders.where((o) {
      if (o.createdAt == null) return false;
      final d = DateTime.parse(o.createdAt!);
      return !d.isBefore(start) && !d.isAfter(end);
    }).toList();
  }

  Color _statusColor(BuildContext context, String s) => switch (s) {
        'fulfilled' || 'delivered' => BrandColors.success,
        'paid' => context.brand.primary,
        'cancelled' => BrandColors.danger,
        _ => const Color(0xFFB45309),
      };

  IconData _statusIcon(String s) => switch (s) {
        'fulfilled' || 'delivered' => Icons.check_circle_rounded,
        'paid' => Icons.local_shipping_rounded,
        'cancelled' => Icons.cancel_rounded,
        _ => Icons.schedule_rounded,
      };

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('My orders'),
        actions: [
          if (user != null)
            ref.watch(myOrdersProvider).maybeWhen(
                  data: (orders) => orders.isEmpty
                      ? const SizedBox.shrink()
                      : IconButton(
                          icon: Icon(_range == null ? Icons.filter_list_rounded : Icons.filter_list_off_rounded,
                              color: _range != null ? context.brand.primary : null),
                          tooltip: 'Filter by date',
                          onPressed: () => _range == null ? _pickRange(orders) : setState(() => _range = null),
                        ),
                  orElse: () => const SizedBox.shrink(),
                ),
        ],
      ),
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
              error: (e, _) => ErrorView(error: e),
              data: (allOrders) {
                final orders = _filtered(allOrders);
                return Column(children: [
                  if (_range != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Chip(
                          avatar: const Icon(Icons.date_range_rounded, size: 16),
                          label: Text(
                              '${DateFormat('d MMM').format(_range!.start)} – ${DateFormat('d MMM yyyy').format(_range!.end)} · ${orders.length} order${orders.length == 1 ? '' : 's'}'),
                          onDeleted: () => setState(() => _range = null),
                          backgroundColor: context.brand.soft,
                          deleteIconColor: context.brand.primaryDark,
                          labelStyle: TextStyle(color: context.brand.primaryDark, fontWeight: FontWeight.w700, fontSize: 12.5),
                        ),
                      ),
                    ),
                  Expanded(
                    child: orders.isEmpty
                        ? Center(
                            child: Text(_range == null ? 'No orders yet' : 'No orders in this date range',
                                style: const TextStyle(color: BrandColors.textMuted)),
                          )
                        : RefreshIndicator(
                            onRefresh: () async => ref.invalidate(myOrdersProvider),
                            child: ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: orders.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 12),
                              itemBuilder: (_, i) => _OrderCard(
                                order: orders[i],
                                color: _statusColor(context, orders[i].status),
                                icon: _statusIcon(orders[i].status),
                              ),
                            ),
                          ),
                  ),
                ]);
              },
            ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final OrderModel order;
  final Color color;
  final IconData icon;
  const _OrderCard({required this.order, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) {
    final thumbs = order.items.take(3).toList();
    final extra = order.items.length - thumbs.length;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      elevation: 0,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/order/${order.id}'),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: BrandColors.border),
            boxShadow: const [BoxShadow(color: Color(0x08000000), blurRadius: 10, offset: Offset(0, 4))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
                child: Row(children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(order.number.isEmpty ? 'Order' : order.number,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: 0.2)),
                        const SizedBox(height: 2),
                        if (order.createdAt != null)
                          Text(_formatDate(order.createdAt!), style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(icon, size: 13, color: color),
                      const SizedBox(width: 4),
                      Text(_statusLabel(order.status), style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 11.5)),
                    ]),
                  ),
                ]),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  SizedBox(
                    width: 54,
                    height: 54,
                    child: Stack(children: [
                      for (var i = thumbs.length - 1; i >= 0; i--)
                        Positioned(
                          left: i * 8.0,
                          child: Container(
                            width: 54 - i * 8,
                            height: 54,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(10),
                              color: const Color(0xFFF1F5F9),
                              border: Border.all(color: Colors.white, width: 2),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: thumbs[i].image != null && thumbs[i].image!.isNotEmpty
                                ? CachedNetworkImage(imageUrl: thumbs[i].image!, fit: BoxFit.cover)
                                : const Icon(Icons.image_outlined, size: 18, color: BrandColors.textMuted),
                          ),
                        ),
                    ]),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          thumbs.isEmpty
                              ? '${order.itemCount} item${order.itemCount == 1 ? '' : 's'}'
                              : [thumbs.first.title, if (extra > 0) '+$extra more'].join(' · '),
                          maxLines: 2, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                        ),
                        const SizedBox(height: 4),
                        Text('${order.itemCount} item${order.itemCount == 1 ? '' : 's'}',
                            style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
                      ],
                    ),
                  ),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(rupees(order.total), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
                    const SizedBox(height: 4),
                    const Icon(Icons.chevron_right_rounded, size: 18, color: BrandColors.textMuted),
                  ]),
                ]),
              ),
              if (order.refundedAmount > 0)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                  child: _infoStrip('↩️ ${rupees(order.refundedAmount)} refunded', BrandColors.success),
                ),
              if (order.isCodPending)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                  child: _infoStrip('💵 Pay ${rupees(order.total)} in cash on delivery', const Color(0xFFB45309)),
                ),
              if (order.needsPayment)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                  child: PayOrderButton(orderId: order.id, total: order.total),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoStrip(String text, Color color) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(8)),
        child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
      );

  String _statusLabel(String s) => switch (s) {
        'fulfilled' || 'delivered' => 'Delivered',
        'paid' => 'In progress',
        'cancelled' => 'Cancelled',
        'pending' => 'Pending',
        'refunded' => 'Refunded',
        _ => s,
      };

  String _formatDate(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return '';
    final now = DateTime.now();
    final diff = DateTime(now.year, now.month, now.day).difference(DateTime(d.year, d.month, d.day)).inDays;
    if (diff == 0) return 'Today · ${DateFormat('h:mm a').format(d)}';
    if (diff == 1) return 'Yesterday · ${DateFormat('h:mm a').format(d)}';
    return DateFormat('d MMM yyyy, h:mm a').format(d);
  }
}
