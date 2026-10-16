import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/store.dart';
import 'cart_controller.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lines = ref.watch(cartProvider);
    final cart = ref.read(cartProvider.notifier);
    final subtotal = lines.fold<int>(0, (n, l) => n + l.lineTotal);

    // Grouped by vendor — a multi-vendor cart gets one instructions box per store, not
    // one note that would be shown to every vendor regardless of relevance.
    final groups = <String, List<CartLine>>{};
    for (final l in lines) {
      groups.putIfAbsent(l.storeId, () => []).add(l);
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your cart'),
        actions: [
          if (lines.isNotEmpty)
            TextButton(onPressed: cart.clear, child: const Text('Clear')),
        ],
      ),
      body: lines.isEmpty
          ? _EmptyCart(onShop: () => context.go('/'))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                for (final entry in groups.entries) ...[
                  _VendorGroup(storeId: entry.key, lines: entry.value, cart: cart),
                  const SizedBox(height: 14),
                ],
              ],
            ),
      bottomNavigationBar: lines.isEmpty
          ? null
          : SafeArea(
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: const BoxDecoration(
                    color: Colors.white,
                    border: Border(top: BorderSide(color: BrandColors.border))),
                child: Row(children: [
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Subtotal',
                          style: TextStyle(
                              color: BrandColors.textMuted, fontSize: 12)),
                      Text(rupees(subtotal),
                          style: const TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 18)),
                    ],
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: SizedBox(
                      height: 50,
                      child: ElevatedButton(
                        onPressed: () => context.push('/checkout'),
                        child: const Text('Proceed to checkout'),
                      ),
                    ),
                  ),
                ]),
              ),
            ),
    );
  }
}

class _VendorGroup extends ConsumerStatefulWidget {
  final String storeId;
  final List<CartLine> lines;
  final CartController cart;
  const _VendorGroup({required this.storeId, required this.lines, required this.cart});

  @override
  ConsumerState<_VendorGroup> createState() => _VendorGroupState();
}

class _VendorGroupState extends ConsumerState<_VendorGroup> {
  String _mode = 'now'; // 'now' | 'scheduled' | 'standard'
  String _selectedDay = 'Tomorrow';
  String _selectedSlot = 'Morning (9:00 AM – 12:00 PM)';

  static const _days = ['Tomorrow', 'In 2 Days', 'In 3 Days'];
  static const _slots = [
    'Morning (9:00 AM – 12:00 PM)',
    'Afternoon (12:00 PM – 4:00 PM)',
    'Evening (4:00 PM – 8:00 PM)',
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initSlot());
  }

  Vendor? _findVendor(List<Vendor> stores) {
    for (final s in stores) {
      if (s.id == widget.storeId) return s;
    }
    return null;
  }

  void _initSlot() {
    final stores = ref.read(vendorsProvider).valueOrNull ?? [];
    final v = _findVendor(stores);
    final isLocal = v?.isLocal ?? true;
    final isOpen = v?.isOpenNow ?? true;

    if (!isOpen) {
      // Closed store: Default to scheduled delivery
      if (mounted) setState(() => _mode = 'scheduled');
      ref.read(cartDeliverySlotsProvider.notifier).setSlot(
            widget.storeId,
            VendorDeliverySlot(
              type: 'scheduled',
              date: _selectedDay,
              slot: _selectedSlot,
              label: '📅 Scheduled: $_selectedDay ($_selectedSlot)',
            ),
          );
    } else if (isLocal) {
      if (mounted) setState(() => _mode = 'now');
      ref.read(cartDeliverySlotsProvider.notifier).setSlot(
            widget.storeId,
            const VendorDeliverySlot(
              type: 'now',
              slot: '⚡ 15–30 mins',
              label: '⚡ Now (Delivery in 15–30 mins)',
            ),
          );
    } else {
      if (mounted) setState(() => _mode = 'standard');
      ref.read(cartDeliverySlotsProvider.notifier).setSlot(
            widget.storeId,
            const VendorDeliverySlot(
              type: 'standard',
              slot: '5–6 business days',
              label: '📦 Standard Delivery (Estimated 5–6 days)',
            ),
          );
    }
  }

  void _selectNow() {
    setState(() => _mode = 'now');
    ref.read(cartDeliverySlotsProvider.notifier).setSlot(
          widget.storeId,
          const VendorDeliverySlot(
            type: 'now',
            slot: '⚡ 15–30 mins',
            label: '⚡ Now (Delivery in 15–30 mins)',
          ),
        );
  }

  void _updateScheduled(String day, String slot) {
    setState(() {
      _selectedDay = day;
      _selectedSlot = slot;
      _mode = 'scheduled';
    });
    ref.read(cartDeliverySlotsProvider.notifier).setSlot(
          widget.storeId,
          VendorDeliverySlot(
            type: 'scheduled',
            date: day,
            slot: slot,
            label: '📅 Scheduled: $day ($slot)',
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    final storeName = widget.lines.first.storeName;
    final instructions = ref.watch(cartInstructionsProvider)[widget.storeId] ?? '';
    final stores = ref.watch(vendorsProvider).valueOrNull ?? [];
    final vendor = _findVendor(stores);
    final isLocal = vendor?.isLocal ?? true;
    final isOpen = vendor?.isOpenNow ?? true;

    // Automatically correct mode if store is closed and mode is 'now'
    if (!isOpen && _mode == 'now') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          setState(() => _mode = 'scheduled');
          ref.read(cartDeliverySlotsProvider.notifier).setSlot(
                widget.storeId,
                VendorDeliverySlot(
                  type: 'scheduled',
                  date: _selectedDay,
                  slot: _selectedSlot,
                  label: '📅 Scheduled: $_selectedDay ($_selectedSlot)',
                ),
              );
        }
      });
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: BrandColors.border),
        boxShadow: const [
          BoxShadow(color: Color(0x06000000), blurRadius: 8, offset: Offset(0, 3)),
        ],
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Store Name Header
          if (storeName != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: b.primary.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.storefront_rounded, size: 16, color: b.primary),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(storeName,
                            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
                        if (vendor != null && vendor.vendorType.isNotEmpty)
                          Text(vendor.vendorType,
                              style: const TextStyle(color: BrandColors.textMuted, fontSize: 11)),
                      ],
                    ),
                  ),
                  if (!isOpen)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEE2E2),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: const Color(0xFFFCA5A5)),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.schedule_rounded, size: 11, color: Color(0xFF991B1B)),
                          SizedBox(width: 3),
                          Text('Store Closed',
                              style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF991B1B))),
                        ],
                      ),
                    )
                  else if (isLocal)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3C7),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text('⚡ Instant Available',
                          style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF92400E))),
                    )
                  else
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE0F2FE),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text('📦 Intercity Store',
                          style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0369A1))),
                    ),
                ],
              ),
            ),

          // ── Delivery Slot Selector ──────────────────────────────
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.schedule_rounded, size: 14, color: Color(0xFF475569)),
                    SizedBox(width: 5),
                    Text(
                      'Delivery Slot',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF334155),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                if (isLocal) ...[
                  // Local store: Now or Schedule for later
                  Row(
                    children: [
                      Expanded(
                        child: GestureDetector(
                          onTap: isOpen
                              ? _selectNow
                              : () {
                                  ScaffoldMessenger.of(context).hideCurrentSnackBar();
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Store is closed right now. Please choose Schedule Later.'),
                                      duration: Duration(seconds: 2),
                                    ),
                                  );
                                },
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                            decoration: BoxDecoration(
                              color: !isOpen
                                  ? const Color(0xFFF1F5F9)
                                  : (_mode == 'now' ? const Color(0xFFFEF3C7) : Colors.white),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: !isOpen
                                    ? const Color(0xFFE2E8F0)
                                    : (_mode == 'now'
                                        ? const Color(0xFFF59E0B)
                                        : const Color(0xFFCBD5E1)),
                                width: (_mode == 'now' && isOpen) ? 1.8 : 1,
                              ),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text('⚡',
                                    style: TextStyle(
                                        fontSize: 13,
                                        color: !isOpen ? const Color(0xFF94A3B8) : null)),
                                const SizedBox(width: 4),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      !isOpen ? 'Now (Closed)' : 'Now (Default)',
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w900,
                                        color: !isOpen
                                            ? const Color(0xFF94A3B8)
                                            : (_mode == 'now'
                                                ? const Color(0xFF92400E)
                                                : const Color(0xFF334155)),
                                      ),
                                    ),
                                    Text(
                                      !isOpen ? 'Opens later' : '15–30 mins',
                                      style: TextStyle(
                                        fontSize: 9.5,
                                        color: !isOpen
                                            ? const Color(0xFF94A3B8)
                                            : const Color(0xFF64748B),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: GestureDetector(
                          onTap: () => _updateScheduled(_selectedDay, _selectedSlot),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                            decoration: BoxDecoration(
                              color: _mode == 'scheduled' ? const Color(0xFFEDE9FE) : Colors.white,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: _mode == 'scheduled'
                                    ? const Color(0xFF7C3AED)
                                    : const Color(0xFFCBD5E1),
                                width: _mode == 'scheduled' ? 1.8 : 1,
                              ),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.event_available_rounded,
                                    size: 15, color: Color(0xFF7C3AED)),
                                const SizedBox(width: 4),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      !isOpen ? 'Schedule (Default)' : 'Schedule Later',
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w900,
                                        color: _mode == 'scheduled'
                                            ? const Color(0xFF5B21B6)
                                            : const Color(0xFF334155),
                                      ),
                                    ),
                                    const Text('Next 1–3 days',
                                        style: TextStyle(fontSize: 9.5, color: Color(0xFF64748B))),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),

                  if (!isOpen)
                    Container(
                      margin: const EdgeInsets.only(top: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFFECACA)),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.info_outline_rounded, size: 14, color: Color(0xFFB91C1C)),
                          SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Store is closed right now. Your order will be prepared & delivered in your chosen slot.',
                              style: TextStyle(
                                  fontSize: 10.5,
                                  color: Color(0xFF7F1D1D),
                                  fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                    ),

                  // If Schedule for Later is picked, show day + time picker
                  if (_mode == 'scheduled') ...[
                    const SizedBox(height: 10),
                    // Day Selector Chips
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: _days.map((day) {
                          final sel = _selectedDay == day;
                          return Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: ChoiceChip(
                              label: Text(day),
                              selected: sel,
                              onSelected: (_) => _updateScheduled(day, _selectedSlot),
                              labelStyle: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: sel ? Colors.white : const Color(0xFF475569),
                              ),
                              selectedColor: const Color(0xFF7C3AED),
                              backgroundColor: Colors.white,
                              side: BorderSide(
                                color: sel ? const Color(0xFF7C3AED) : const Color(0xFFCBD5E1),
                              ),
                              visualDensity: VisualDensity.compact,
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                    const SizedBox(height: 6),

                    // Time Slot Dropdown
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFCBD5E1)),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedSlot,
                          isExpanded: true,
                          style: const TextStyle(fontSize: 11.5, color: Color(0xFF1E293B), fontWeight: FontWeight.w700),
                          items: _slots
                              .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                              .toList(),
                          onChanged: (v) {
                            if (v != null) _updateScheduled(_selectedDay, v);
                          },
                        ),
                      ),
                    ),
                  ],
                ] else ...[
                  // Intercity Store: Standard Delivery (Estimated 5-6 Days)
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE0F2FE),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFBAE6FD)),
                    ),
                    child: const Row(
                      children: [
                        Text('📦', style: TextStyle(fontSize: 16)),
                        SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Standard Intercity Delivery · 5–6 Days',
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 12,
                                  color: Color(0xFF0369A1),
                                ),
                              ),
                              SizedBox(height: 2),
                              Text(
                                'Store is outside your city. Order will be accepted & shipped safely via courier.',
                                style: TextStyle(fontSize: 10.5, color: Color(0xFF0284C7)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Items in this vendor's sub-order
          for (final l in widget.lines) ...[
            _CartLineRow(line: l, cart: widget.cart),
            const SizedBox(height: 10),
          ],

          // Instructions for Vendor
          TextFormField(
            initialValue: instructions,
            maxLines: 2,
            minLines: 1,
            style: const TextStyle(fontSize: 13),
            decoration: InputDecoration(
              isDense: true,
              labelText: storeName != null
                  ? 'Instructions for $storeName (optional)'
                  : 'Instructions for vendor (optional)',
              hintText: 'e.g. ring the bell, no onions, leave at the door…',
              border: const OutlineInputBorder(),
            ),
            onChanged: (v) =>
                ref.read(cartInstructionsProvider.notifier).set(widget.storeId, v),
          ),
        ],
      ),
    );
  }
}

class _CartLineRow extends StatelessWidget {
  final CartLine line;
  final CartController cart;
  const _CartLineRow({required this.line, required this.cart});

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          width: 64,
          height: 64,
          child: line.image != null
              ? CachedNetworkImage(imageUrl: line.image!, fit: BoxFit.cover)
              : Container(color: const Color(0xFFF1F1F4), child: const Icon(Icons.image_outlined)),
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(line.title,
                maxLines: 2, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
            const SizedBox(height: 6),
            Text(rupees(line.price), style: const TextStyle(fontWeight: FontWeight.w800)),
          ],
        ),
      ),
      _QtyBox(
        qty: line.qty,
        onDec: () => cart.setQty(line.key, line.qty - 1),
        onInc: () => cart.setQty(line.key, line.qty + 1),
      ),
    ]);
  }
}

class _QtyBox extends StatelessWidget {
  final int qty;
  final VoidCallback onDec, onInc;
  const _QtyBox({required this.qty, required this.onDec, required this.onInc});
  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Container(
      decoration: BoxDecoration(
          border: Border.all(color: b.primary),
          borderRadius: BorderRadius.circular(10)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(
            icon: const Icon(Icons.remove, size: 18),
            color: b.primary,
            onPressed: onDec,
            visualDensity: VisualDensity.compact),
        Text('$qty', style: const TextStyle(fontWeight: FontWeight.w800)),
        IconButton(
            icon: const Icon(Icons.add, size: 18),
            color: b.primary,
            onPressed: onInc,
            visualDensity: VisualDensity.compact),
      ]),
    );
  }
}

class _EmptyCart extends StatelessWidget {
  final VoidCallback onShop;
  const _EmptyCart({required this.onShop});
  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 132,
            height: 132,
            decoration: BoxDecoration(color: b.soft, shape: BoxShape.circle),
            alignment: Alignment.center,
            child: const Text('🛒', style: TextStyle(fontSize: 58)),
          ),
          const SizedBox(height: 22),
          const Text('Your cart is empty',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 19)),
          const SizedBox(height: 6),
          const Text('Add products to get started',
              style: TextStyle(color: BrandColors.textMuted, fontSize: 13.5)),
          const SizedBox(height: 24),
          SizedBox(
            height: 50,
            child: ElevatedButton.icon(
              onPressed: onShop,
              icon: const Icon(Icons.storefront_rounded, size: 19),
              label: const Text('Start shopping'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 30),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
