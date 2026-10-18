import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../core/location/delivery_resolution.dart';
import '../../data/providers.dart';
import '../../models/store.dart';
import '../../models/address.dart';
import '../../data/payment_repository.dart';
import 'cart_controller.dart';
import '../../shared/widgets/safe_pop_scope.dart';
import '../../shared/widgets/product_card.dart';
import '../checkout/checkout_screen.dart';
import '../shell/app_shell.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (context.mounted) ScaffoldMessenger.of(context).clearSnackBars();
    });
    final lines = ref.watch(cartProvider);
    final cart = ref.read(cartProvider.notifier);
    final subtotal = lines.fold<int>(0, (n, l) => n + l.lineTotal);
    final activeAddress = ref.watch(activeDeliveryAddressProvider);
    final pricing = ref.watch(pricingSettingsProvider).valueOrNull;
    final stores = ref.watch(vendorsProvider).valueOrNull ?? const [];
    final deliveryQuote = pricing?.quote(
      subtotal,
      address: activeAddress,
      lines: lines,
      stores: stores,
    );

    // Grouped by vendor — a multi-vendor cart gets one instructions box per store, not
    // one note that would be shown to every vendor regardless of relevance.
    final groups = <String, List<CartLine>>{};
    for (final l in lines) {
      groups.putIfAbsent(l.storeId, () => []).add(l);
    }

    return SafePopScope(
      child: Scaffold(
        appBar: AppBar(
          leading: const AppBackButton(),
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
                  _CartDeliveryAddressBar(
                    address: activeAddress,
                    onChange: () => _showAddressPicker(context, ref),
                  ),
                  if (deliveryQuote?.deliveryBreakdown != null) ...[
                    const SizedBox(height: 10),
                    _CartDeliveryEstimateCard(
                      breakdown: deliveryQuote!.deliveryBreakdown!,
                      address: activeAddress,
                      subtotal: subtotal,
                      pricing: pricing,
                    ),
                  ],
                  const SizedBox(height: 12),
                  for (final entry in groups.entries) ...[
                    _VendorGroup(
                        storeId: entry.key, lines: entry.value, cart: cart),
                    const SizedBox(height: 14),
                  ],
                  _CartBillSummaryCard(
                    subtotal: subtotal,
                    quote: deliveryQuote,
                    pricing: pricing,
                  ),
                  const SizedBox(height: 14),
                  _CartRecommendations(productId: lines.first.productId),
                ],
              ),
        bottomNavigationBar: lines.isEmpty
            ? const AppBottomNav()
            : SafeArea(
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                      color: context.colors.surface,
                      border: Border(
                          top: BorderSide(color: context.colors.border))),
                  child: Row(children: [
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          deliveryQuote != null
                              ? (deliveryQuote.delivery == 0
                                  ? 'FREE Delivery${deliveryQuote.tax > 0 ? " · Tax incl." : ""}'
                                  : 'Delivery: ${rupees(deliveryQuote.delivery)}${deliveryQuote.tax > 0 ? " · Tax incl." : ""}')
                              : 'Subtotal',
                          style: TextStyle(
                              color: deliveryQuote?.delivery == 0
                                  ? context.colors.success
                                  : context.colors.textMuted,
                              fontWeight: deliveryQuote?.delivery == 0
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              fontSize: 12),
                        ),
                        Text(rupees(deliveryQuote?.grandTotal ?? subtotal),
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
      ),
    );
  }
}

class _VendorGroup extends ConsumerStatefulWidget {
  final String storeId;
  final List<CartLine> lines;
  final CartController cart;
  const _VendorGroup(
      {required this.storeId, required this.lines, required this.cart});

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
    final activeAddress = ref.read(activeDeliveryAddressProvider);
    final stores = ref.read(vendorsProvider).valueOrNull ?? [];
    final v = _findVendor(stores);
    final eval = evaluateDeliverability(address: activeAddress, vendor: v);
    final isLocal = eval.isLocal;
    final isOpen = v?.isOpenNow ?? true;

    if (!isLocal) {
      if (mounted) setState(() => _mode = 'standard');
      ref.read(cartDeliverySlotsProvider.notifier).setSlot(
            widget.storeId,
            const VendorDeliverySlot(
              type: 'standard',
              slot: '5–7 business days',
              label: '📦 Standard Delivery (Estimated 5–7 days)',
            ),
          );
    } else if (!isOpen) {
      // Closed local store: Default to scheduled delivery
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
    } else {
      if (mounted) setState(() => _mode = 'now');
      ref.read(cartDeliverySlotsProvider.notifier).setSlot(
            widget.storeId,
            const VendorDeliverySlot(
              type: 'now',
              slot: '⚡ 15–30 mins',
              label: '⚡ Now (Delivery in 15–30 mins)',
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
    final instructions =
        ref.watch(cartInstructionsProvider)[widget.storeId] ?? '';
    final stores = ref.watch(vendorsProvider).valueOrNull ?? [];
    final vendor = _findVendor(stores);
    final activeAddress = ref.watch(activeDeliveryAddressProvider);
    final eval = evaluateDeliverability(address: activeAddress, vendor: vendor);
    final isLocal = eval.isLocal;
    final isOpen = vendor?.isOpenNow ?? true;

    // Automatically adapt mode if deliverability or store hours shift
    if (!isLocal && _mode != 'standard') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          setState(() => _mode = 'standard');
          ref.read(cartDeliverySlotsProvider.notifier).setSlot(
                widget.storeId,
                const VendorDeliverySlot(
                  type: 'standard',
                  slot: '5–7 business days',
                  label: '📦 Standard Delivery (Estimated 5–7 days)',
                ),
              );
        }
      });
    } else if (isLocal && _mode == 'standard') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          if (!isOpen) {
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
          } else {
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
        }
      });
    } else if (isLocal && !isOpen && _mode == 'now') {
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
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.colors.border),
        boxShadow: const [
          BoxShadow(
              color: Color(0x06000000), blurRadius: 8, offset: Offset(0, 3)),
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
                    child: Icon(Icons.storefront_rounded,
                        size: 16, color: b.primary),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(storeName,
                            style: const TextStyle(
                                fontWeight: FontWeight.w900, fontSize: 14)),
                        if (vendor != null && vendor.vendorType.isNotEmpty)
                          Text(vendor.vendorType,
                              style: TextStyle(
                                  color: context.colors.textMuted,
                                  fontSize: 11)),
                      ],
                    ),
                  ),
                  if (!isOpen)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: context.colors.danger.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                            color:
                                context.colors.danger.withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.schedule_rounded,
                              size: 11, color: context.colors.danger),
                          const SizedBox(width: 3),
                          Text('Store Closed',
                              style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: context.colors.danger)),
                        ],
                      ),
                    )
                  else if (isLocal)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: context.colors.star.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('⚡ Instant Available',
                          style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: context.colors.star)),
                    )
                  else
                    Builder(builder: (context) {
                      final isDark =
                          Theme.of(context).brightness == Brightness.dark;
                      final infoColor = isDark
                          ? const Color(0xFF7DD3FC)
                          : const Color(0xFF0369A1);
                      return Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color:
                              infoColor.withValues(alpha: isDark ? 0.18 : 0.15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text('📦 Intercity Store',
                            style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: infoColor)),
                      );
                    }),
                ],
              ),
            ),

          // ── Delivery Slot Selector ──────────────────────────────
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: context.colors.bg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.colors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.schedule_rounded,
                        size: 14, color: context.colors.ink2),
                    const SizedBox(width: 5),
                    Text(
                      'Delivery Slot',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: context.colors.ink2,
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
                                  ScaffoldMessenger.of(context)
                                      .hideCurrentSnackBar();
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                          'Store is closed right now. Please choose Schedule Later.'),
                                      duration: Duration(seconds: 2),
                                    ),
                                  );
                                },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                vertical: 8, horizontal: 10),
                            decoration: BoxDecoration(
                              color: !isOpen
                                  ? context.colors.bg
                                  : (_mode == 'now'
                                      ? context.colors.star
                                          .withValues(alpha: 0.18)
                                      : context.colors.surface),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: !isOpen
                                    ? context.colors.border
                                    : (_mode == 'now'
                                        ? const Color(0xFFF59E0B)
                                        : context.colors.border),
                                width: (_mode == 'now' && isOpen) ? 1.8 : 1,
                              ),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text('⚡',
                                    style: TextStyle(
                                        fontSize: 13,
                                        color: !isOpen
                                            ? context.colors.textMuted
                                            : null)),
                                const SizedBox(width: 4),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      !isOpen
                                          ? 'Now (Closed)'
                                          : 'Now (Default)',
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w900,
                                        color: !isOpen
                                            ? context.colors.textMuted
                                            : (_mode == 'now'
                                                ? context.colors.star
                                                : context.colors.ink2),
                                      ),
                                    ),
                                    Text(
                                      !isOpen ? 'Opens later' : '15–30 mins',
                                      style: TextStyle(
                                        fontSize: 9.5,
                                        color: context.colors.textMuted,
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
                          onTap: () =>
                              _updateScheduled(_selectedDay, _selectedSlot),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                vertical: 8, horizontal: 10),
                            decoration: BoxDecoration(
                              color: _mode == 'scheduled'
                                  ? const Color(0xFF7C3AED)
                                      .withValues(alpha: 0.16)
                                  : context.colors.surface,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: _mode == 'scheduled'
                                    ? const Color(0xFF7C3AED)
                                    : context.colors.border,
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
                                      !isOpen
                                          ? 'Schedule (Default)'
                                          : 'Schedule Later',
                                      style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w900,
                                        color: _mode == 'scheduled'
                                            ? (Theme.of(context).brightness ==
                                                    Brightness.dark
                                                ? const Color(0xFFC4B5FD)
                                                : const Color(0xFF5B21B6))
                                            : context.colors.ink2,
                                      ),
                                    ),
                                    Text('Next 1–3 days',
                                        style: TextStyle(
                                            fontSize: 9.5,
                                            color: context.colors.textMuted)),
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
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 6),
                      decoration: BoxDecoration(
                        color: context.colors.danger.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                            color:
                                context.colors.danger.withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline_rounded,
                              size: 14, color: context.colors.danger),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Store is closed right now. Your order will be prepared & delivered in your chosen slot.',
                              style: TextStyle(
                                  fontSize: 10.5,
                                  color: context.colors.danger,
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
                              onSelected: (_) =>
                                  _updateScheduled(day, _selectedSlot),
                              labelStyle: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: sel ? Colors.white : context.colors.ink2,
                              ),
                              selectedColor: const Color(0xFF7C3AED),
                              backgroundColor: context.colors.bg,
                              side: BorderSide(
                                color: sel
                                    ? const Color(0xFF7C3AED)
                                    : context.colors.border,
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
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 2),
                      decoration: BoxDecoration(
                        color: context.colors.surface,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: context.colors.border),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedSlot,
                          isExpanded: true,
                          style: TextStyle(
                              fontSize: 11.5,
                              color: context.colors.ink,
                              fontWeight: FontWeight.w700),
                          items: _slots
                              .map((s) =>
                                  DropdownMenuItem(value: s, child: Text(s)))
                              .toList(),
                          onChanged: (v) {
                            if (v != null) _updateScheduled(_selectedDay, v);
                          },
                        ),
                      ),
                    ),
                  ],
                ] else ...[
                  // Intercity Store: Standard Delivery (Estimated 5–7 Days)
                  Builder(builder: (context) {
                    final isDark =
                        Theme.of(context).brightness == Brightness.dark;
                    final infoColor = isDark
                        ? const Color(0xFF93C5FD)
                        : const Color(0xFF1E40AF);
                    final infoColorMuted = isDark
                        ? const Color(0xFFBFDBFE)
                        : const Color(0xFF1E3A8A);
                    return Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color:
                            infoColor.withValues(alpha: isDark ? 0.16 : 0.08),
                        borderRadius: BorderRadius.circular(10),
                        border:
                            Border.all(color: infoColor.withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('📦',
                              style: TextStyle(
                                  color: context.colors.ink, fontSize: 18)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Standard Courier Delivery · 5–7 Days',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 12.5,
                                    color: infoColor,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  activeAddress != null
                                      ? 'Intercity shipping to ${activeAddress.label} (${activeAddress.city}${activeAddress.pincode != null ? ' - ${activeAddress.pincode}' : ''}) from ${vendor?.city ?? 'vendor location'}.'
                                      : 'Store is outside local delivery zone. Order will be shipped safely via courier.',
                                  style: TextStyle(
                                      fontSize: 11, color: infoColorMuted),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '🚚 Express 15-30m / scheduled morning slots are only available within the store\'s local city.',
                                  style: TextStyle(
                                      fontSize: 10,
                                      color: infoColor,
                                      fontWeight: FontWeight.w600),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
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
            onChanged: (v) => ref
                .read(cartInstructionsProvider.notifier)
                .set(widget.storeId, v),
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
              ? CachedNetworkImage(
                  placeholder: (_, __) => Container(color: context.colors.bg),
                  errorWidget: (_, __, ___) => Container(
                      color: context.colors.bg,
                      child: Icon(Icons.image_not_supported_outlined,
                          color: context.colors.textMuted, size: 20)),
                  imageUrl: line.image!,
                  fit: BoxFit.cover)
              : Container(
                  color: context.colors.bg,
                  child: Icon(Icons.image_outlined,
                      color: context.colors.textMuted)),
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(line.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontWeight: FontWeight.w600, fontSize: 13.5)),
            const SizedBox(height: 6),
            Text(rupees(line.price),
                style: const TextStyle(fontWeight: FontWeight.w800)),
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
            child: Text('🛒',
                style: TextStyle(color: context.colors.ink, fontSize: 58)),
          ),
          const SizedBox(height: 22),
          Text('Your cart is empty',
              style: TextStyle(
                  color: context.colors.ink,
                  fontWeight: FontWeight.w900,
                  fontSize: 19)),
          const SizedBox(height: 6),
          Text('Add products to get started',
              style:
                  TextStyle(color: context.colors.textMuted, fontSize: 13.5)),
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

class _CartDeliveryAddressBar extends StatelessWidget {
  final Address? address;
  final VoidCallback onChange;

  const _CartDeliveryAddressBar(
      {required this.address, required this.onChange});

  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: context.colors.bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.colors.border),
        boxShadow: const [
          BoxShadow(
              color: Color(0x06000000), blurRadius: 4, offset: Offset(0, 2)),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: b.primary.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.location_on_rounded, size: 17, color: b.primary),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Text(
                      address != null
                          ? 'Deliver to: ${address!.label}'
                          : 'Delivery destination',
                      style: TextStyle(
                          color: context.colors.ink,
                          fontWeight: FontWeight.w800,
                          fontSize: 13),
                    ),
                    if (address?.isDefault == true) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 5, vertical: 1.5),
                        decoration: BoxDecoration(
                          color: context.colors.success.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'DEFAULT',
                          style: TextStyle(
                              fontSize: 8.5,
                              fontWeight: FontWeight.w900,
                              color: context.colors.success),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 1),
                Text(
                  address != null
                      ? address!.oneLine
                      : 'Select your address to calculate accurate delivery time',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: context.colors.textMuted, fontSize: 11.5),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onChange,
            style: TextButton.styleFrom(
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.symmetric(horizontal: 10),
            ),
            child: Text(
              address != null ? 'Change' : 'Select',
              style: TextStyle(
                  fontWeight: FontWeight.w900, color: b.primary, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

void _showAddressPicker(BuildContext context, WidgetRef ref) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return Consumer(
        builder: (ctx, ref, _) {
          final addresses = ref.watch(addressesProvider).valueOrNull ?? [];
          final active = ref.watch(activeDeliveryAddressProvider);
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Choose Delivery Address',
                          style: TextStyle(
                              color: context.colors.ink,
                              fontWeight: FontWeight.w900,
                              fontSize: 17)),
                      IconButton(
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  Text(
                      'Delivery timeline & slots are based on your selected address',
                      style: TextStyle(
                          fontSize: 12, color: context.colors.textMuted)),
                  const SizedBox(height: 12),
                  if (addresses.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      child: Center(
                        child: Text('No saved addresses yet',
                            style: TextStyle(color: context.colors.textMuted)),
                      ),
                    )
                  else
                    ...addresses.map((a) {
                      final isSelected = a.id == active?.id;
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? context.brand.soft
                              : context.colors.surface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isSelected
                                ? context.brand.primary
                                : context.colors.border,
                            width: isSelected ? 1.5 : 1,
                          ),
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 2),
                          leading: Icon(
                            isSelected
                                ? Icons.radio_button_checked_rounded
                                : Icons.radio_button_off_rounded,
                            color: isSelected
                                ? context.brand.primary
                                : context.colors.textMuted,
                          ),
                          title: Row(
                            children: [
                              Text(a.label,
                                  style: TextStyle(
                                      color: context.colors.ink,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13.5)),
                              if (a.city.isNotEmpty)
                                Text(' (${a.city})',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: context.colors.textMuted)),
                              if (a.isDefault) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 5, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: context.colors.success
                                        .withValues(alpha: 0.16),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text('DEFAULT',
                                      style: TextStyle(
                                          fontSize: 8.5,
                                          fontWeight: FontWeight.w800,
                                          color: context.colors.success)),
                                ),
                              ],
                            ],
                          ),
                          subtitle: Text(
                            a.oneLine,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 11.5),
                          ),
                          onTap: () {
                            ref.read(activeAddressIdProvider.notifier).state =
                                a.id;
                            Navigator.pop(ctx);
                          },
                        ),
                      );
                    }),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: OutlinedButton.icon(
                      icon:
                          const Icon(Icons.add_location_alt_rounded, size: 18),
                      label: const Text('Add new address'),
                      onPressed: () {
                        Navigator.pop(ctx);
                        context.push('/addresses');
                      },
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      );
    },
  );
}

/// "You might also like" — frequently-bought-together recommendations keyed off the
/// first item in the cart (the same co-purchase rail shown on the product page).
class _CartRecommendations extends ConsumerWidget {
  final String productId;
  const _CartRecommendations({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(frequentlyBoughtTogetherProvider(productId));
    final items = async.valueOrNull ?? const [];
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text('You might also like',
              style: TextStyle(
                  color: context.colors.ink,
                  fontWeight: FontWeight.w800,
                  fontSize: 16)),
        ),
        SizedBox(
          height: 272,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) =>
                SizedBox(width: 156, child: ProductCard(product: items[i])),
          ),
        ),
      ],
    );
  }
}

class _CartDeliveryEstimateCard extends StatelessWidget {
  final MultiVendorDeliveryQuoteBreakdown breakdown;
  final Address? address;
  final int subtotal;
  final PricingSettings? pricing;

  const _CartDeliveryEstimateCard({
    required this.breakdown,
    required this.address,
    required this.subtotal,
    this.pricing,
  });

  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    final isFree = breakdown.isFreeDelivery;
    final count = breakdown.vendors.length;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.local_shipping_outlined,
                  size: 16, color: b.primary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  count > 1
                      ? 'Multi-Vendor Delivery ($count Stores)'
                      : 'Delivery to ${address?.city ?? "your address"}',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12.5,
                      color: context.colors.ink),
                ),
              ),
              GestureDetector(
                onTap: () => showDeliveryBreakdownModal(
                  context,
                  breakdown: breakdown,
                  address: address,
                  pricing: pricing,
                  itemsTotal: subtotal,
                ),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: context.colors.bg,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: context.colors.border),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.tune_rounded, size: 12, color: b.primary),
                      const SizedBox(width: 3),
                      Text(
                        'Rules & Math',
                        style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: b.primary),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: isFree
                      ? (isDark
                          ? const Color(0xFF064E3B).withValues(alpha: 0.35)
                          : const Color(0xFFDCFCE7))
                      : b.soft,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  isFree ? 'FREE' : rupees(breakdown.finalDeliveryFee),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: isFree
                        ? (isDark
                            ? const Color(0xFF6EE7B7)
                            : const Color(0xFF15803D))
                        : b.primaryDark,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final leg in breakdown.vendors) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: context.colors.bg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: context.colors.border),
              ),
              child: Row(
                children: [
                  Text(leg.isLocal ? '⚡' : '📦',
                      style: const TextStyle(fontSize: 13)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          leg.storeName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: context.colors.ink,
                          ),
                        ),
                        Text(
                          '${leg.distanceKm != null ? "${leg.distanceKm!.toStringAsFixed(1)} km" : (leg.isLocal ? "Local" : "Courier")} · ${leg.calculationText}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 11, color: context.colors.textMuted),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    rupees(leg.vendorDeliveryFee),
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: context.colors.ink),
                  ),
                ],
              ),
            ),
          ],
          if (!isFree && breakdown.freeDeliveryRemaining > 0)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: isDark
                    ? const Color(0xFF78350F).withValues(alpha: 0.35)
                    : const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: isDark
                      ? const Color(0xFFD97706).withValues(alpha: 0.5)
                      : const Color(0xFFFDE68A),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.local_shipping_rounded,
                      size: 14,
                      color: isDark
                          ? const Color(0xFFFCD34D)
                          : const Color(0xFFD97706)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Add ${rupees(breakdown.freeDeliveryRemaining)} more for Free Delivery!',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: isDark
                            ? const Color(0xFFFCD34D)
                            : const Color(0xFF92400E),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _CartBillSummaryCard extends StatelessWidget {
  final int subtotal;
  final CheckoutQuote? quote;
  final PricingSettings? pricing;

  const _CartBillSummaryCard({
    required this.subtotal,
    required this.quote,
    required this.pricing,
  });

  @override
  Widget build(BuildContext context) {
    final delivery = quote?.delivery;
    final tax = quote?.tax ?? 0;
    final grandTotal = quote?.grandTotal ?? (subtotal + tax + (delivery ?? 0));

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.receipt_long_rounded,
                  size: 18, color: context.brand.primary),
              const SizedBox(width: 8),
              Text(
                'Bill details',
                style: TextStyle(
                  color: context.colors.ink,
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _priceRow(context, 'Items subtotal', rupees(subtotal)),
          const SizedBox(height: 6),
          _priceRow(
            context,
            'Delivery fee',
            delivery == null
                ? 'Select address'
                : delivery == 0
                    ? 'FREE'
                    : rupees(delivery),
            valueColor: delivery == 0 ? context.colors.success : null,
          ),
          if (tax > 0) ...[
            const SizedBox(height: 6),
            _priceRow(
              context,
              pricing?.taxPercent != null && pricing!.taxPercent > 0
                  ? 'Taxes & GST (${pricing!.taxPercent}%)'
                  : 'Taxes & GST',
              rupees(tax),
            ),
          ],
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(height: 1),
          ),
          _priceRow(
            context,
            'To Pay',
            rupees(grandTotal),
            bold: true,
            fontSize: 15,
          ),
        ],
      ),
    );
  }

  Widget _priceRow(
    BuildContext context,
    String label,
    String value, {
    bool bold = false,
    Color? valueColor,
    double fontSize = 13.5,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            color: bold ? context.colors.ink : context.colors.textMuted,
            fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
            fontSize: fontSize,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            color: valueColor ?? context.colors.ink,
            fontWeight: bold ? FontWeight.w900 : FontWeight.w600,
            fontSize: fontSize,
          ),
        ),
      ],
    );
  }
}

