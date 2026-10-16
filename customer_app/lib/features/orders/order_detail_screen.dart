import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart' as ll;
import '../../core/format.dart';
import '../../core/socket/order_socket_service.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/order.dart';
import 'pay_order_button.dart';

class _Stage {
  final String label;
  final String? time;
  final bool done;
  final IconData icon;
  const _Stage(this.label, this.time, this.done, this.icon);
}

const _taskStepMeta = <String, (String, IconData)>{
  'accepted': ('Order confirmed by the store', Icons.storefront_outlined),
  'preparing': ('Preparing your order', Icons.soup_kitchen_outlined),
  'ready': ('Ready for pickup', Icons.inventory_2_outlined),
  'pickup_started': ('Rider heading to pickup', Icons.directions_bike_outlined),
  'pickup_arrived': ('Rider at the store', Icons.storefront),
  'picked_up': ('Picked up', Icons.inventory_2),
  'delivery_started': ('Out for delivery', Icons.local_shipping_outlined),
  'delivery_arrived': ('Rider has arrived', Icons.near_me_outlined),
  'delivered': ('Delivered', Icons.check_circle_outline),
  'cancelled': ('Delivery cancelled', Icons.cancel_outlined),
};
const _taskStepOrder = [
  'accepted',
  'preparing',
  'ready',
  'pickup_started',
  'pickup_arrived',
  'picked_up',
  'delivery_started',
  'delivery_arrived',
  'delivered',
];

/// Status-only fallback — used before an order is a real commitment (still `pending`,
/// so it has no delivery task yet). Placed / Paid (or Cash on delivery) / Fulfilled,
/// branching to Cancelled/Refunded.
List<_Stage> _timeline(OrderModel o) {
  final stages = <_Stage>[_Stage('Order placed', o.createdAt, true, Icons.shopping_bag_outlined)];
  if (o.status == 'cancelled') {
    stages.add(_Stage('Order cancelled', o.updatedAt, true, Icons.cancel_outlined));
    return stages;
  }
  final paidOrCod = o.isPaid || o.paymentMethod == 'cod';
  stages.add(_Stage(
    o.paymentMethod == 'cod' ? 'Cash on delivery' : 'Payment confirmed',
    o.isPaid ? o.paidAt : null,
    paidOrCod,
    Icons.payments_outlined,
  ));
  if (o.status == 'refunded') {
    stages.add(_Stage('Refund processed', o.updatedAt, true, Icons.replay_rounded));
    return stages;
  }
  stages.add(_Stage('Fulfilled', o.status == 'fulfilled' ? o.updatedAt : null, o.status == 'fulfilled', Icons.local_shipping_outlined));
  return stages;
}

/// Real per-store delivery timeline, once the order has a committed `DeliveryTask`.
List<_Stage> _timelineForTask(OrderModel o, DeliveryTaskInfo task) {
  final stages = <_Stage>[_Stage('Order placed', o.createdAt, true, Icons.shopping_bag_outlined)];
  final paidOrCod = o.isPaid || o.paymentMethod == 'cod';
  stages.add(_Stage(
    o.paymentMethod == 'cod' ? 'Cash on delivery' : 'Payment confirmed',
    o.isPaid ? o.paidAt : null,
    paidOrCod,
    Icons.payments_outlined,
  ));

  final byStatus = {for (final h in task.statusHistory) h.status: h.at};
  if (byStatus.containsKey('cancelled')) {
    final meta = _taskStepMeta['cancelled']!;
    stages.add(_Stage(meta.$1, byStatus['cancelled'], true, meta.$2));
    return stages;
  }
  for (final key in _taskStepOrder) {
    final meta = _taskStepMeta[key]!;
    final at = byStatus[key];
    stages.add(_Stage(meta.$1, at, at != null, meta.$2));
  }
  return stages;
}

class OrderDetailScreen extends ConsumerStatefulWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  late final OrderSocketService _socket = OrderSocketService(ref.read(tokenStoreProvider));
  ll.LatLng? _riderLatLng;
  List<ll.LatLng>? _routePoints;
  ll.LatLng? _routeFetchedFor; // guards against refetching the same rider position repeatedly

  @override
  void initState() {
    super.initState();
    _socket.join(widget.orderId);
    _socket.statusUpdates.listen((_) {
      if (mounted) ref.invalidate(orderProvider(widget.orderId));
    });
    _socket.locationUpdates.listen((data) {
      final lat = (data['lat'] as num?)?.toDouble();
      final lng = (data['lng'] as num?)?.toDouble();
      if (lat != null && lng != null && mounted) {
        setState(() => _riderLatLng = ll.LatLng(lat, lng));
      }
    });
  }

  @override
  void dispose() {
    _socket.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(orderProvider(widget.orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Order details')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: BrandColors.textMuted))),
        data: (order) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(orderProvider(widget.orderId)),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _card(child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(order.number, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace', fontSize: 15)),
                    if (order.createdAt != null)
                      Text(timeAgo(order.createdAt), style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
                  ]),
                ),
                Text(rupees(order.total), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
              ])),
              const SizedBox(height: 14),

              ..._statusSections(order),

              if (order.shippingAddress != null || order.contact != null)
                _section('Delivery details', Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (order.shippingAddress != null && order.shippingAddress!.oneLine.isNotEmpty)
                    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Icon(Icons.location_on_outlined, size: 18, color: BrandColors.textMuted),
                      const SizedBox(width: 8),
                      Expanded(child: Text(order.shippingAddress!.oneLine, style: const TextStyle(fontSize: 13.5))),
                    ]),
                  if (order.contact?.phone != null && order.contact!.phone!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Row(children: [
                        const Icon(Icons.call_outlined, size: 18, color: BrandColors.textMuted),
                        const SizedBox(width: 8),
                        Text(order.contact!.phone!, style: const TextStyle(fontSize: 13.5)),
                      ]),
                    ),
                ])),
              if (order.shippingAddress != null || order.contact != null) const SizedBox(height: 14),

              _section('Items', Column(
                children: order.items.map((it) => _ItemRow(item: it)).toList(),
              )),
              const SizedBox(height: 14),

              if (order.amounts != null)
                _section('Price details', Column(children: [
                  _priceRow('Items total', rupees(order.amounts!.itemsTotal)),
                  if (order.amounts!.discount > 0) _priceRow('Discount', '− ${rupees(order.amounts!.discount)}', color: BrandColors.success),
                  _priceRow('Tax', rupees(order.amounts!.tax)),
                  _priceRow('Delivery', order.amounts!.delivery == 0 ? 'FREE' : rupees(order.amounts!.delivery),
                      color: order.amounts!.delivery == 0 ? BrandColors.success : null),
                  const Divider(height: 20),
                  _priceRow('Total', rupees(order.amounts!.grandTotal), bold: true),
                  if (order.refundedAmount > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: _priceRow('Refunded', rupees(order.refundedAmount), color: BrandColors.success),
                    ),
                ])),
              const SizedBox(height: 14),

              _section('Payment', Row(children: [
                Icon(order.paymentMethod == 'cod' ? Icons.payments_outlined : Icons.credit_card_outlined, size: 18, color: BrandColors.textMuted),
                const SizedBox(width: 8),
                Text(_paymentLabel(order), style: const TextStyle(fontSize: 13.5)),
              ])),

              const SizedBox(height: 20),
              if (order.needsPayment) PayOrderButton(orderId: order.id, total: order.total),
              if (order.canCancel) ...[
                if (order.needsPayment) const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: OutlinedButton(
                    onPressed: () => _cancel(context, ref, order.id),
                    child: const Text('Cancel order'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// One "Status" section per delivery task (almost always just one — multi-vendor
  /// orders get one per store), each with a live map once that leg is out for delivery.
  /// Falls back to the order-status-only timeline when no task exists yet (order still
  /// `pending`, not a real commitment).
  List<Widget> _statusSections(OrderModel order) {
    if (order.deliveryTasks.isEmpty) {
      return [
        _section('Status', Column(children: _timelineRows(_timeline(order)))),
        const SizedBox(height: 14),
      ];
    }
    final widgets = <Widget>[];
    for (var i = 0; i < order.deliveryTasks.length; i++) {
      final task = order.deliveryTasks[i];
      final title = order.deliveryTasks.length > 1 ? 'Status — package ${i + 1} of ${order.deliveryTasks.length}' : 'Status';
      widgets.add(_section(
        title,
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ..._timelineRows(_timelineForTask(order, task)),
          if (task.isOutForDelivery) ...[
            const SizedBox(height: 4),
            _liveMapFor(task),
          ],
        ]),
      ));
      widgets.add(const SizedBox(height: 14));
    }
    return widgets;
  }

  List<Widget> _timelineRows(List<_Stage> stages) => stages
      .asMap()
      .entries
      .map((e) => _TimelineRow(stage: e.value, isLast: e.key == stages.length - 1))
      .toList();

  Widget _liveMapFor(DeliveryTaskInfo task) {
    final position = _riderLatLng ??
        (task.rider?.lastKnownLat != null && task.rider?.lastKnownLng != null
            ? ll.LatLng(task.rider!.lastKnownLat!, task.rider!.lastKnownLng!)
            : null);
    if (position == null) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: BrandColors.bg, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          const Icon(Icons.two_wheeler, size: 18, color: BrandColors.textMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              task.rider != null ? '${task.rider!.name} is on the way — waiting for their live location…' : 'Rider is on the way',
              style: const TextStyle(color: BrandColors.textMuted, fontSize: 12.5),
            ),
          ),
        ]),
      );
    }
    // Destination known → fetch (and cache-by-position) the road-following route from
    // the backend's /routing (self-hosted OSRM). Null result (OSRM not configured, or a
    // transient failure) just means no polyline is drawn — the marker still works fine
    // on its own, so this never blocks the live-tracking UI.
    final dropLat = task.dropLat, dropLng = task.dropLng;
    if (dropLat != null && dropLng != null && _routeFetchedFor != position) {
      _routeFetchedFor = position;
      ref.read(routingRepoProvider).route(from: position, to: ll.LatLng(dropLat, dropLng)).then((pts) {
        if (mounted) setState(() => _routePoints = pts);
      });
    }

    final destination = (dropLat != null && dropLng != null) ? ll.LatLng(dropLat, dropLng) : null;
    final bounds = destination != null ? LatLngBounds.fromPoints([position, destination]) : null;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (task.rider != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text('${task.rider!.name} · ${task.rider!.vehicleType ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        ),
      ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          height: 200,
          child: FlutterMap(
            options: bounds != null
                ? MapOptions(initialCameraFit: CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(40)))
                : MapOptions(initialCenter: position, initialZoom: 15),
            children: [
              TileLayer(
                urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.example.customer_app',
              ),
              if (_routePoints != null)
                PolylineLayer(polylines: [
                  Polyline(points: _routePoints!, strokeWidth: 4, color: context.brand.primary),
                ]),
              MarkerLayer(markers: [
                Marker(
                  point: position,
                  width: 40,
                  height: 40,
                  child: Icon(Icons.two_wheeler, color: context.brand.primary, size: 32),
                ),
                if (destination != null)
                  Marker(
                    point: destination,
                    width: 34,
                    height: 34,
                    child: const Icon(Icons.location_on_rounded, color: Color(0xFFE11D48), size: 30),
                  ),
              ]),
            ],
          ),
        ),
      ),
    ]);
  }

  String _paymentLabel(OrderModel o) {
    final method = switch (o.paymentMethod) {
      'cod' => 'Cash on delivery',
      'razorpay' => 'Online (Razorpay)',
      'mock' => 'Online (test)',
      _ => 'Not started',
    };
    final status = switch (o.paymentStatus) {
      'paid' => 'Paid',
      'failed' => 'Failed',
      'refunded' => 'Refunded',
      'partially_refunded' => 'Partially refunded',
      'pending' => 'Pending',
      _ => 'Unpaid',
    };
    return '$method · $status';
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref, String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dCtx) => AlertDialog(
        title: const Text('Cancel this order?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dCtx, false), child: const Text('No')),
          TextButton(onPressed: () => Navigator.pop(dCtx, true), child: const Text('Yes, cancel')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(checkoutRepoProvider).cancelOrder(id);
      ref.invalidate(orderProvider(id));
      ref.invalidate(myOrdersProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Order cancelled')));
      }
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Widget _card({required Widget child}) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: BrandColors.border)),
        child: child,
      );

  Widget _section(String title, Widget child) => _card(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height: 10),
          child,
        ]),
      );

  Widget _priceRow(String k, String v, {bool bold = false, Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Text(k, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w500, fontSize: bold ? 15 : 13.5)),
          const Spacer(),
          Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: bold ? 15 : 13.5, color: color)),
        ]),
      );
}

class _TimelineRow extends StatelessWidget {
  final _Stage stage;
  final bool isLast;
  const _TimelineRow({required this.stage, required this.isLast});

  @override
  Widget build(BuildContext context) {
    final color = stage.done ? context.brand.primary : BrandColors.textMuted;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(children: [
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: stage.done ? color.withValues(alpha: 0.12) : BrandColors.bg,
                border: Border.all(color: color, width: 1.5),
              ),
              child: Icon(stage.icon, size: 15, color: color),
            ),
            if (!isLast) Expanded(child: Container(width: 2, color: stage.done ? color : BrandColors.border)),
          ]),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 18),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(stage.label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, color: stage.done ? BrandColors.ink : BrandColors.textMuted)),
                if (stage.time != null)
                  Text(timeAgo(stage.time), style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

/// Each row is the frozen order-time snapshot (title/variant/price as they were when
/// this was bought — never re-priced from the live product) — but tapping through to
/// the product's current page, and flagging if today's price has since moved, needs a
/// live lookup by productId (orders never store a slug; see catalog_repository.dart's
/// productSlugById doc comment for why).
class _ItemRow extends ConsumerStatefulWidget {
  final OrderItem item;
  const _ItemRow({required this.item});
  @override
  ConsumerState<_ItemRow> createState() => _ItemRowState();
}

class _ItemRowState extends ConsumerState<_ItemRow> {
  bool _loading = false;

  Future<void> _open() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      final resolved = await ref.read(catalogRepoProvider).productSlugById(widget.item.productId);
      if (!mounted) return;
      final diff = resolved.currentPrice - widget.item.unitPrice;
      if (diff != 0) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(diff > 0
              ? 'Price has gone up by ${rupees(diff)} since you ordered this'
              : 'Price has dropped by ${rupees(-diff)} since you ordered this'),
        ));
      }
      if (mounted) context.push('/p/${resolved.slug}');
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('This product is no longer available.')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return InkWell(
      onTap: _open,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: item.image != null && item.image!.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: item.image!,
                    width: 48, height: 48, fit: BoxFit.cover,
                    errorWidget: (_, __, ___) => _placeholder(),
                  )
                : _placeholder(),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(item.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
              if (item.variantLabel != null)
                Text(item.variantLabel!, style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
              Text('Qty ${item.qty}', style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
            ]),
          ),
          if (_loading)
            const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
          else ...[
            Text(rupees(item.lineTotal), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            const Icon(Icons.chevron_right_rounded, size: 18, color: BrandColors.textMuted),
          ],
        ]),
      ),
    );
  }

  Widget _placeholder() => Container(
        width: 48, height: 48,
        color: BrandColors.bg,
        child: const Icon(Icons.image_not_supported_outlined, size: 20, color: BrandColors.textMuted),
      );
}
