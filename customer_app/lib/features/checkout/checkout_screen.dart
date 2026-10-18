import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../core/location/delivery_resolution.dart';
import '../../data/providers.dart';
import '../../models/address.dart';
import '../../data/payment_repository.dart';
import '../cart/cart_controller.dart';
import 'places_search_field.dart';
import 'payment_controller.dart';
import '../../shared/widgets/error_view.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});
  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  String? _selectedId;
  bool _placing = false;
  String _method = 'razorpay';
  String _stage = 'idle'; // idle | placing | paying

  final _couponCtrl = TextEditingController();
  String? _appliedCoupon;
  int _couponDiscount = 0;
  bool _applyingCoupon = false;
  String? _couponError;

  bool _usePoints = false;
  int _pointsBalance = 0;
  int _pointsBalanceValuePaise = 0;
  int _pointsToRedeem = 0;
  int _pointsDiscount = 0;

  /// Owned by this screen: it holds a native Razorpay listener that must outlive the
  /// async gap while the sheet is open, and must be torn down exactly once.
  late final PaymentController _payment =
      PaymentController(ref.read(paymentRepoProvider));

  /// Snapshot of lines during placement/payment so screen does not zero out behind the payment sheet
  List<CartLine>? _activeLines;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ScaffoldMessenger.of(context).clearSnackBars();
    });
    _selectedId = ref.read(activeAddressIdProvider);
    if (ref.read(authProvider) == null) return;
    ref.read(checkoutRepoProvider).loyaltyBalance().then((b) {
      if (mounted) {
        setState(() {
          _pointsBalance = b.points;
          _pointsBalanceValuePaise = b.valuePaise;
        });
      }
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _payment.dispose();
    _couponCtrl.dispose();
    super.dispose();
  }

  Future<void> _togglePoints(bool use, int itemsTotal) async {
    if (!use || _pointsBalance <= 0) {
      setState(() {
        _usePoints = false;
        _pointsToRedeem = 0;
        _pointsDiscount = 0;
      });
      return;
    }
    final preview = await ref
        .read(checkoutRepoProvider)
        .previewRedeemPoints(_pointsBalance, itemsTotal);
    if (!mounted) return;
    setState(() {
      _usePoints = true;
      _pointsToRedeem = preview.points;
      _pointsDiscount = preview.discount;
    });
  }

  Future<void> _applyCoupon(int itemsTotal) async {
    final code = _couponCtrl.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _applyingCoupon = true;
      _couponError = null;
    });
    try {
      final discount =
          await ref.read(checkoutRepoProvider).validateCoupon(code, itemsTotal);
      if (!mounted) return;
      setState(() {
        _appliedCoupon = code.toUpperCase();
        _couponDiscount = discount;
        _applyingCoupon = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _couponDiscount = 0;
        _appliedCoupon = null;
        _applyingCoupon = false;
        _couponError =
            friendlyError(e, fallback: 'This coupon could not be applied.');
      });
    }
  }

  void _removeCoupon() {
    setState(() {
      _appliedCoupon = null;
      _couponDiscount = 0;
      _couponError = null;
      _couponCtrl.clear();
    });
  }

  void _syncSlotsForAddress(Address addr, List<CartLine> lines) {
    final stores = ref.read(vendorsProvider).valueOrNull ?? [];
    final storeIds = lines.map((l) => l.storeId).toSet();
    final currentSlots = ref.read(cartDeliverySlotsProvider);

    for (final sid in storeIds) {
      final vendor = stores.where((s) => s.id == sid).firstOrNull;
      if (vendor == null) continue;

      final eval = evaluateDeliverability(address: addr, vendor: vendor);
      final isLocal = eval.isLocal;

      final existing = currentSlots[sid];
      if (!isLocal) {
        // Intercity delivery: MUST be standard (5-7 days)
        if (existing?.type != 'standard') {
          ref.read(cartDeliverySlotsProvider.notifier).setSlot(
                sid,
                const VendorDeliverySlot(
                  type: 'standard',
                  slot: '5–7 business days',
                  label: '📦 Standard Delivery (Estimated 5–7 days)',
                ),
              );
        }
      } else {
        // Local delivery: if it was standard, adapt to local
        if (existing?.type == 'standard') {
          if (!vendor.isOpenNow) {
            ref.read(cartDeliverySlotsProvider.notifier).setSlot(
                  sid,
                  const VendorDeliverySlot(
                    type: 'scheduled',
                    date: 'Tomorrow',
                    slot: 'Morning (9:00 AM – 12:00 PM)',
                    label:
                        '📅 Scheduled: Tomorrow (Morning 9:00 AM – 12:00 PM)',
                  ),
                );
          } else {
            ref.read(cartDeliverySlotsProvider.notifier).setSlot(
                  sid,
                  const VendorDeliverySlot(
                    type: 'now',
                    slot: '⚡ 15–30 mins',
                    label: '⚡ Now (Delivery in 15–30 mins)',
                  ),
                );
          }
        } else if (!vendor.isOpenNow && existing?.type == 'now') {
          ref.read(cartDeliverySlotsProvider.notifier).setSlot(
                sid,
                const VendorDeliverySlot(
                  type: 'scheduled',
                  date: 'Tomorrow',
                  slot: 'Morning (9:00 AM – 12:00 PM)',
                  label: '📅 Scheduled: Tomorrow (Morning 9:00 AM – 12:00 PM)',
                ),
              );
        }
      }
    }
  }

  Address? _pick(List<Address> list) {
    if (list.isEmpty) return null;
    final targetId = _selectedId ?? ref.read(activeAddressIdProvider);
    if (targetId != null) {
      final m = list.where((a) => a.id == targetId);
      if (m.isNotEmpty) return m.first;
    }
    final def = list.where((a) => a.isDefault);
    return def.isNotEmpty ? def.first : list.first;
  }

  /// Place the order, then take payment for it.
  ///
  /// The order is created first and deliberately survives a failed or abandoned
  /// payment — the customer keeps the order and can retry from the orders screen,
  /// instead of losing their cart to a flaky UPI app.
  Future<void> _place(List<CartLine> lines, Address? addr) async {
    if (addr == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Add a delivery address first')));
      return;
    }
    // Backend requires a resolved pin to run its vendor-to-customer deliverability check
    // (orders.service.ts) — an address saved before that check shipped, or hand-edited
    // after a Places pick, can be missing lat/lng. Catch it here with a clear, actionable
    // message instead of letting the order request fail on a generic validation error.
    if (addr.lat == null || addr.lng == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'This address needs a confirmed location — re-search it above and pick a suggestion.'),
      ));
      return;
    }
    _activeLines = List<CartLine>.from(lines);
    _syncSlotsForAddress(addr, lines);
    setState(() {
      _placing = true;
      _stage = 'placing';
    });

    String orderId;
    String orderNumber;
    try {
      final order = await ref.read(checkoutRepoProvider).placeOrder(
            lines: lines,
            address: addr,
            storeInstructions: ref.read(cartInstructionsProvider),
            deliverySlots: ref.read(cartDeliverySlotsProvider),
            couponCode: _appliedCoupon,
            redeemPoints: _usePoints ? _pointsToRedeem : null,
          );
      orderId = order.id;
      orderNumber = order.number;
      ref.read(cartProvider.notifier).clear();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _placing = false;
        _stage = 'idle';
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(friendlyError(e,
              fallback: 'Could not place your order. Please try again.'))));
      return;
    }

    if (mounted) setState(() => _stage = 'paying');
    final result = await _payment.pay(orderId: orderId, method: _method);
    if (!mounted) return;

    setState(() {
      _placing = false;
      _stage = 'idle';
    });

    switch (result) {
      case PayPaid():
        _activeLines = null;
        context.go(
            '/order-success?number=${Uri.encodeComponent(orderNumber)}&id=${Uri.encodeComponent(orderId)}&paid=1');
      case PayCod():
        _activeLines = null;
        context.go(
            '/order-success?number=${Uri.encodeComponent(orderNumber)}&id=${Uri.encodeComponent(orderId)}&cod=1');
      case PayCancelled():
        _showUnpaid(orderId, orderNumber,
            "You didn't complete the payment, so nothing was charged. Your order is saved and ready whenever you are.");
      case PayFailed(:final message):
        _showUnpaid(orderId, orderNumber, message);
      case PayPending(:final message):
        _showPending(orderId, orderNumber, message);
    }
  }

  /// Genuinely unpaid (cancelled or failed) — safe to retry, so "Pay now" is the primary action.
  void _showUnpaid(String orderId, String orderNumber, String message) {
    _outcomeDialog(
      orderId: orderId,
      orderNumber: orderNumber,
      icon: Icons.receipt_long_rounded,
      iconColor: const Color(0xFFF59E0B),
      iconBg: const Color(0xFFFFF4E5),
      title: 'Order saved — not paid yet',
      message: message,
      caption:
          'If money was debited from your bank, please wait a moment — it will update automatically in My Orders.',
      actionsBuilder: (dialogCtx) => [
        SizedBox(
          width: double.infinity,
          height: 50,
          child: ElevatedButton(
            onPressed: () {
              _activeLines = null;
              Navigator.pop(dialogCtx);
              context.go('/order/$orderId');
            },
            child: const Text('View order / Pay'),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          height: 50,
          child: OutlinedButton(
            onPressed: () {
              _activeLines = null;
              Navigator.pop(dialogCtx);
              context.go('/');
            },
            child: const Text('Keep shopping'),
          ),
        ),
      ],
    );
  }

  /// Outcome is uncertain, not absent — the gateway may already have taken the money and
  /// we're just waiting to hear back. Deliberately has NO "pay now" button: offering one
  /// here would risk the customer paying twice for the same order.
  void _showPending(String orderId, String orderNumber, String message) {
    _outcomeDialog(
      orderId: orderId,
      orderNumber: orderNumber,
      icon: Icons.hourglass_top_rounded,
      iconColor: const Color(0xFF2563EB),
      iconBg: const Color(0xFFEAF2FF),
      title: 'Confirming your payment',
      message: message,
      caption:
          "Please don't pay again for this order — we'll update it automatically.",
      actionsBuilder: (dialogCtx) => [
        SizedBox(
          width: double.infinity,
          height: 50,
          child: ElevatedButton(
            onPressed: () {
              _activeLines = null;
              Navigator.pop(dialogCtx);
              context.go('/order/$orderId');
            },
            child: const Text('Track this order'),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          height: 50,
          child: OutlinedButton(
            onPressed: () {
              _activeLines = null;
              Navigator.pop(dialogCtx);
              context.go('/');
            },
            child: const Text('Keep shopping'),
          ),
        ),
      ],
    );
  }

  /// Shared chrome for a post-checkout outcome: icon, headline, message, order number chip,
  /// then whatever actions the caller needs — mirrors the visual language of
  /// [OrderSuccessScreen] (icon circle + stacked full-width buttons) so every checkout
  /// outcome, paid or not, feels like the same app.
  void _outcomeDialog({
    required String orderId,
    required String orderNumber,
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String title,
    required String message,
    required List<Widget> Function(BuildContext dialogCtx) actionsBuilder,
    String? caption,
  }) {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) => PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (didPop) return;
          _activeLines = null;
          Navigator.pop(dialogCtx);
          context.go('/order/$orderId');
        },
        child: Dialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          insetPadding: const EdgeInsets.symmetric(horizontal: 24),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
            child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration:
                    BoxDecoration(color: iconBg, shape: BoxShape.circle),
                child: Icon(icon, color: iconColor, size: 36),
              ),
              const SizedBox(height: 18),
              Text(title,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w900,
                      color: context.colors.ink)),
              const SizedBox(height: 8),
              Text(message,
                  textAlign: TextAlign.center,
                  style:
                      TextStyle(color: context.colors.textMuted, height: 1.4)),
              const SizedBox(height: 16),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                    color: context.colors.bg,
                    borderRadius: BorderRadius.circular(10)),
                child: Text('Order $orderNumber',
                    style: TextStyle(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w700,
                        color: context.colors.ink)),
              ),
              if (caption != null) ...[
                const SizedBox(height: 12),
                Text(caption,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: context.colors.textMuted,
                        fontSize: 12.5,
                        fontStyle: FontStyle.italic)),
              ],
              const SizedBox(height: 24),
              ...actionsBuilder(dialogCtx),
            ],
          ),
        ),
      ),
    ),
  );
}

  String _payLabel(int total) {
    if (_stage == 'placing') return 'Placing your order…';
    if (_stage == 'paying') return 'Waiting for payment…';
    return _method == 'cod'
        ? 'Place order · ${rupees(total)}'
        : 'Pay ${rupees(total)}';
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider);
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.lock_outline_rounded,
                size: 48, color: context.colors.textMuted),
            const SizedBox(height: 10),
            Text('Sign in to checkout',
                style: TextStyle(
                    color: context.colors.ink, fontWeight: FontWeight.w700)),
            const SizedBox(height: 14),
            ElevatedButton(
                onPressed: () => context.push('/login'),
                child: const Text('Sign in')),
          ]),
        ),
      );
    }

    final cartLines = ref.watch(cartProvider);
    final lines = (_activeLines != null && _activeLines!.isNotEmpty)
        ? _activeLines!
        : cartLines;
    if (lines.isEmpty && !_placing && _stage == 'idle') {
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () {
              if (Navigator.of(context).canPop()) {
                context.pop();
              } else {
                context.go('/cart');
              }
            },
          ),
          title: const Text('Checkout'),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: context.brand.soft,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.shopping_bag_outlined,
                      size: 40, color: context.brand.primary),
                ),
                const SizedBox(height: 20),
                Text(
                  'Your cart is empty',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: context.colors.ink,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Add items to your cart before proceeding to checkout.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: context.colors.textMuted,
                    fontSize: 14,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: () => context.go('/'),
                    child: const Text('Browse products'),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final subtotal = lines.fold<int>(0, (n, l) => n + l.lineTotal);
    final addressesAsync = ref.watch(addressesProvider);

    // Show exactly what the server will charge — tax and delivery included.
    // The coupon discount is only a preview (computeDiscount re-runs authoritatively
    // server-side at order creation), so it's capped at the current subtotal in case
    // items changed after it was applied.
    final couponDiscount =
        _appliedCoupon != null ? _couponDiscount.clamp(0, subtotal) : 0;
    final pointsDiscount = _usePoints ? _pointsDiscount : 0;
    final discount = (couponDiscount + pointsDiscount).clamp(0, subtotal);
    final pricing = ref.watch(pricingSettingsProvider).valueOrNull;
    final features = pricing?.features ?? const FeatureFlags();
    final selectedAddress = _pick(addressesAsync.valueOrNull ?? []);
    final stores = ref.watch(vendorsProvider).valueOrNull ?? const [];
    final quote = pricing?.quote(
          subtotal,
          discount: discount,
          address: selectedAddress,
          lines: lines,
          stores: stores,
        ) ??
        CheckoutQuote(
            itemsTotal: subtotal,
            discount: discount,
            tax: 0,
            delivery: 0,
            grandTotal: subtotal - discount);

    final methods = (ref.watch(paymentConfigProvider).valueOrNull?.methods ??
            const <PaymentMethodOption>[])
        .where((m) => m.enabled)
        .toList();
    // Never leave a disabled method selected (e.g. a COD cart that grew past the cap).
    final selected = methods.where((m) => m.id == _method);
    if (methods.isNotEmpty &&
        (selected.isEmpty || !selected.first.availableFor(quote.grandTotal))) {
      final fallback = methods.where((m) => m.availableFor(quote.grandTotal));
      if (fallback.isNotEmpty && fallback.first.id != _method) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _method = fallback.first.id);
        });
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () {
            if (Navigator.of(context).canPop()) {
              context.pop();
            } else {
              context.go('/cart');
            }
          },
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (features.checkoutAdBannerEnabled) ...[
            const _CheckoutAdBanner(),
            const SizedBox(height: 16),
          ],

          // Address
          Row(children: [
            Text('Delivery address',
                style: TextStyle(
                    color: context.colors.ink,
                    fontWeight: FontWeight.w800,
                    fontSize: 16)),
            const Spacer(),
            TextButton.icon(
                onPressed: _addAddressSheet,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add')),
          ]),
          addressesAsync.when(
            loading: () => const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator())),
            error: (e, _) => ErrorView(error: e),
            data: (list) {
              if (list.isEmpty) {
                return _dashedBox(
                    'No saved address — tap "Add" to enter your delivery address.');
              }
              final selected = _pick(list);
              if (selected != null) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted) _syncSlotsForAddress(selected, lines);
                });
              }
              return Column(
                children: [
                  ...list.map((a) => _AddressCard(
                        address: a,
                        selected: a.id == selected?.id,
                        onTap: () {
                          setState(() => _selectedId = a.id);
                          ref.read(activeAddressIdProvider.notifier).state =
                              a.id;
                          _syncSlotsForAddress(a, lines);
                        },
                      )),
                  if (selected != null)
                    _DeliveryFulfillmentCard(address: selected, lines: lines),
                ],
              );
            },
          ),

          const SizedBox(height: 20),
          Text('Order summary',
              style: TextStyle(
                  color: context.colors.ink,
                  fontWeight: FontWeight.w800,
                  fontSize: 16)),
          const SizedBox(height: 8),
          ...lines.map((l) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(children: [
                  Expanded(
                      child: Text('${l.title}  ×${l.qty}',
                          maxLines: 1, overflow: TextOverflow.ellipsis)),
                  Text(rupees(l.lineTotal),
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                ]),
              )),
          const Divider(height: 24),

          // Coupon
          if (features.couponsEnabled) ...[
          Text('Have a coupon?',
              style: TextStyle(
                  color: context.colors.ink,
                  fontWeight: FontWeight.w800,
                  fontSize: 16)),
          const SizedBox(height: 8),
          if (_appliedCoupon != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                  color: context.colors.success.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: context.colors.success)),
              child: Row(children: [
                Icon(Icons.local_offer_rounded,
                    size: 18, color: context.colors.success),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(
                        '$_appliedCoupon applied · −${rupees(couponDiscount)}',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: context.colors.success))),
                TextButton(onPressed: _removeCoupon, child: const Text('Remove')),
              ]),
            )
          else
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _couponCtrl,
                  textCapitalization: TextCapitalization.characters,
                  decoration:
                      const InputDecoration(labelText: 'Coupon code'),
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                height: 48,
                child: ElevatedButton(
                  onPressed: _applyingCoupon
                      ? null
                      : () => _applyCoupon(quote.itemsTotal),
                  child: _applyingCoupon
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Apply'),
                ),
              ),
            ]),
          if (_couponError != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(_couponError!,
                  style: TextStyle(color: context.colors.danger, fontSize: 12.5)),
            ),
          ],

          // Loyalty points
          if (features.loyaltyEnabled && _pointsBalance > 0) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                  color: context.colors.bg,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: context.colors.border)),
              child: Row(children: [
                Icon(Icons.stars_rounded,
                    size: 20, color: context.brand.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                      _usePoints
                          ? 'Using $_pointsToRedeem points · −${rupees(_pointsDiscount)}'
                          : 'You have $_pointsBalance points (worth ₹${(_pointsBalanceValuePaise / 100).toStringAsFixed(0)})',
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 13)),
                ),
                Switch(
                  value: _usePoints,
                  onChanged: (v) => _togglePoints(v, quote.itemsTotal),
                ),
              ]),
            ),
          ],

          const SizedBox(height: 16),

          _row('Subtotal', rupees(quote.itemsTotal)),
          if (quote.discount > 0)
            _row('Discount', '−${rupees(quote.discount)}',
                valueColor: context.colors.success),
          _deliveryRow(context, quote, selectedAddress, pricing),
          if (quote.tax > 0)
            _row(
              pricing != null && pricing.taxPercent > 0
                  ? 'Taxes & GST (${pricing.taxPercent}%)'
                  : 'Taxes & GST',
              rupees(quote.tax),
            ),
          const Divider(height: 18),
          _row('Total', rupees(quote.grandTotal), bold: true),
          if (quote.deliveryBreakdown != null) ...[
            const SizedBox(height: 12),
            _DeliveryTransparencyCard(
              breakdown: quote.deliveryBreakdown!,
              address: selectedAddress,
              pricing: pricing,
              itemsTotal: quote.itemsTotal,
            ),
          ],

          const SizedBox(height: 22),
          Text('Payment method',
              style: TextStyle(
                  color: context.colors.ink,
                  fontWeight: FontWeight.w800,
                  fontSize: 16)),
          const SizedBox(height: 8),
          ...methods.map((m) {
            final available = m.availableFor(quote.grandTotal);
            final reason = m.unavailableReason(quote.grandTotal);
            return _MethodCard(
              method: m,
              selected: _method == m.id,
              enabled: available,
              subtitle: reason ?? m.description,
              onTap: available ? () => setState(() => _method = m.id) : null,
            );
          }),
        ],
      ),
      bottomNavigationBar: lines.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _placing
                        ? null
                        : () => _place(
                            lines, _pick(addressesAsync.valueOrNull ?? [])),
                    child: _placing
                        ? Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                                const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: Colors.white)),
                                const SizedBox(width: 12),
                                Text(_payLabel(quote.grandTotal),
                                    style: const TextStyle(fontSize: 15)),
                              ])
                        : Text(_payLabel(quote.grandTotal),
                            style: const TextStyle(fontSize: 16)),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _row(String k, String v, {bool bold = false, Color? valueColor}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Text(k,
              style: TextStyle(
                  color: context.colors.ink,
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
                  fontSize: bold ? 16 : 14)),
          const Spacer(),
          Text(v,
              style: TextStyle(
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
                  fontSize: bold ? 16 : 14,
                  color: valueColor)),
        ]),
      );

  Widget _deliveryRow(
    BuildContext context,
    CheckoutQuote quote,
    Address? address,
    PricingSettings? pricing,
  ) {
    final breakdown = quote.deliveryBreakdown;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Text('Delivery',
            style: TextStyle(
                color: context.colors.ink,
                fontWeight: FontWeight.w500,
                fontSize: 14)),
        if (breakdown != null) ...[
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => showDeliveryBreakdownModal(
              context,
              breakdown: breakdown,
              address: address,
              pricing: pricing,
              itemsTotal: quote.itemsTotal,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: context.brand.soft,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                    color: context.brand.primary.withValues(alpha: 0.3)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.info_outline_rounded,
                      size: 13, color: context.brand.primaryDark),
                  const SizedBox(width: 3),
                  Text(
                    'Breakdown',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: context.brand.primaryDark),
                  ),
                ],
              ),
            ),
          ),
        ],
        const Spacer(),
        Text(
          quote.delivery == 0 ? 'FREE' : rupees(quote.delivery),
          style: TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 14,
              color: quote.delivery == 0 ? context.colors.success : null),
        ),
      ]),
    );
  }

  Widget _dashedBox(String msg) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: context.colors.bg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.colors.border)),
        child: Text(msg, style: TextStyle(color: context.colors.textMuted)),
      );

  void _addAddressSheet() {
    final label = TextEditingController(text: 'Home');
    final line1 = TextEditingController();
    final city = TextEditingController();
    final pincode = TextEditingController();
    final phone = TextEditingController();
    bool saving = false;
    double? lat;
    double? lng;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.colors.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(
              20, 18, 20, 20 + MediaQuery.of(sheetCtx).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Add address',
                  style: TextStyle(
                      color: context.colors.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 18)),
              const SizedBox(height: 14),
              PlacesSearchField(onPicked: (r) {
                line1.text = r.line1;
                city.text = r.city;
                if (r.pincode != null && r.pincode!.isNotEmpty) {
                  pincode.text = r.pincode!;
                }
                lat = r.lat;
                lng = r.lng;
              }),
              const SizedBox(height: 10),
              TextField(
                  controller: label,
                  decoration:
                      const InputDecoration(labelText: 'Label (Home / Work)')),
              const SizedBox(height: 10),
              TextField(
                  controller: line1,
                  decoration: const InputDecoration(labelText: 'Address line')),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                    child: TextField(
                        controller: city,
                        decoration: const InputDecoration(labelText: 'City'))),
                const SizedBox(width: 10),
                Expanded(
                    child: TextField(
                        controller: pincode,
                        keyboardType: TextInputType.number,
                        decoration:
                            const InputDecoration(labelText: 'Pincode'))),
              ]),
              const SizedBox(height: 10),
              TextField(
                  controller: phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Phone')),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: saving
                      ? null
                      : () async {
                          if (line1.text.trim().isEmpty ||
                              city.text.trim().isEmpty) {
                            ScaffoldMessenger.of(sheetCtx).showSnackBar(
                                const SnackBar(
                                    content:
                                        Text('Address line & city required')));
                            return;
                          }
                          setSheet(() => saving = true);
                          try {
                            final a =
                                await ref.read(checkoutRepoProvider).addAddress(
                                      label: label.text.trim().isEmpty
                                          ? 'Home'
                                          : label.text.trim(),
                                      line1: line1.text.trim(),
                                      city: city.text.trim(),
                                      pincode: pincode.text.trim(),
                                      phone: phone.text.trim(),
                                      isDefault: true,
                                      lat: lat,
                                      lng: lng,
                                    );
                            ref.invalidate(addressesProvider);
                            ref.read(activeAddressIdProvider.notifier).state =
                                a.id;
                            if (mounted) setState(() => _selectedId = a.id);
                            if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                          } catch (e) {
                            setSheet(() => saving = false);
                            if (sheetCtx.mounted) {
                              ScaffoldMessenger.of(sheetCtx).showSnackBar(SnackBar(
                                  content: Text(friendlyError(e,
                                      fallback:
                                          'Could not save this address. Please try again.'))));
                            }
                          }
                        },
                  child: saving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Save address'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Admin-configured launch ad (same `AppConfig.ad` the splash screen shows),
/// resurfaced here so merchandising reaches the one screen every order passes
/// through — no separate ad-slot backend needed, the admin edits one field
/// (Appearance → Ad title/subtitle) and it shows in both places.
class _CheckoutAdBanner extends ConsumerWidget {
  const _CheckoutAdBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider).valueOrNull;
    final ad = config?['ad'];
    final title = ad is Map ? ad['title']?.toString() : null;
    final subtitle = ad is Map ? ad['subtitle']?.toString() : null;
    if (title == null || title.isEmpty) return const SizedBox.shrink();

    final b = context.brand;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: b.gradient,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(children: [
        const Icon(Icons.campaign_rounded, color: Colors.white, size: 26),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 14)),
              if (subtitle != null && subtitle.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(subtitle,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 12, height: 1.3)),
                ),
            ],
          ),
        ),
      ]),
    );
  }
}

class _AddressCard extends StatelessWidget {
  final Address address;
  final bool selected;
  final VoidCallback onTap;
  const _AddressCard(
      {required this.address, required this.selected, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? b.soft : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: selected ? b.primary : context.colors.border,
              width: selected ? 1.5 : 1),
        ),
        child: Row(children: [
          Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: selected ? b.primary : context.colors.textMuted),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Text(address.label,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  if (address.isDefault) ...[
                    const SizedBox(width: 8),
                    Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                            color: context.colors.bg,
                            borderRadius: BorderRadius.circular(4)),
                        child: Text('Default',
                            style: TextStyle(
                                fontSize: 10,
                                color: context.colors.textMuted))),
                  ],
                ]),
                const SizedBox(height: 2),
                Text(address.oneLine,
                    style: TextStyle(
                        color: context.colors.textMuted, fontSize: 13)),
                if (address.phone != null && address.phone!.isNotEmpty)
                  Text('📞 ${address.phone}',
                      style: TextStyle(
                          color: context.colors.textMuted, fontSize: 12)),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}

/// A selectable payment method row (UPI/card/netbanking, or cash on delivery).
class _MethodCard extends StatelessWidget {
  final PaymentMethodOption method;
  final bool selected;
  final bool enabled;
  final String subtitle;
  final VoidCallback? onTap;
  const _MethodCard({
    required this.method,
    required this.selected,
    required this.enabled,
    required this.subtitle,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(top: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: selected && enabled ? b.soft : Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected && enabled ? b.primary : context.colors.border,
              width: selected && enabled ? 1.5 : 1,
            ),
          ),
          child: Row(children: [
            Icon(
              selected && enabled
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: selected && enabled ? b.primary : context.colors.textMuted,
            ),
            const SizedBox(width: 12),
            Text(method.id == 'cod' ? '💵' : '📱',
                style: const TextStyle(fontSize: 20)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(method.label,
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(subtitle,
                        style: TextStyle(
                            color: context.colors.textMuted, fontSize: 12.5)),
                  ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _DeliveryFulfillmentCard extends ConsumerWidget {
  final Address? address;
  final List<CartLine> lines;
  const _DeliveryFulfillmentCard({required this.address, required this.lines});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (address == null || lines.isEmpty) return const SizedBox.shrink();
    final stores = ref.watch(vendorsProvider).valueOrNull ?? [];
    final slots = ref.watch(cartDeliverySlotsProvider);
    final storeIds = lines.map((l) => l.storeId).toSet();

    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.local_shipping_outlined,
                  size: 16, color: context.colors.ink),
              const SizedBox(width: 6),
              Text(
                'Delivery Schedule & SLA',
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                    color: context.colors.ink),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final sid in storeIds) ...[
            Builder(builder: (ctx) {
              final storeName =
                  lines.firstWhere((l) => l.storeId == sid).storeName ??
                      'Store';
              final vendor = stores.where((s) => s.id == sid).firstOrNull;
              final slot = slots[sid];

              final eval =
                  evaluateDeliverability(address: address, vendor: vendor);
              final isStandard = !eval.isLocal || slot?.type == 'standard';
              final isScheduled = !isStandard && slot?.type == 'scheduled';

              if (isStandard) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0F9FF),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFBAE6FD)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('📦',
                          style: TextStyle(
                              color: context.colors.ink, fontSize: 16)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '$storeName · Standard Courier Delivery',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12.5,
                                  color: Color(0xFF0369A1)),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              eval.distanceKm != null
                                  ? 'Distance: ~${eval.distanceKm!.round()} km · Estimated 5–7 business days'
                                  : 'Intercity destination · Estimated 5–7 business days',
                              style: const TextStyle(
                                  fontSize: 11,
                                  color: Color(0xFF0C4A6E),
                                  fontWeight: FontWeight.w600),
                            ),
                            if (address!.city.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  'Shipping to ${address!.label} (${address!.city}${address!.pincode != null ? ' - ${address!.pincode}' : ''}) from ${vendor?.city ?? 'vendor city'}',
                                  style: const TextStyle(
                                      fontSize: 10.5, color: Color(0xFF0284C7)),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }

              if (isScheduled) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF5F3FF),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFDDD6FE)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.event_available_rounded,
                          size: 16, color: Color(0xFF7C3AED)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '$storeName · Scheduled Local Delivery',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                  color: Color(0xFF5B21B6)),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              slot?.label ??
                                  'Delivery as per your scheduled slot',
                              style: const TextStyle(
                                  fontSize: 11,
                                  color: Color(0xFF4C1D95),
                                  fontWeight: FontWeight.w500),
                            ),
                            if (vendor != null && !vendor.isOpenNow)
                              const Text(
                                'Store is currently closed · will prepare order for chosen slot',
                                style: TextStyle(
                                    fontSize: 10, color: Color(0xFF6D28D9)),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }

              // Express Now (15-30 mins)
              return Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFFDE68A)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('⚡',
                        style:
                            TextStyle(color: context.colors.ink, fontSize: 16)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$storeName · Express Now Delivery',
                            style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 12,
                                color: Color(0xFF92400E)),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            eval.distanceKm != null
                                ? 'Distance: ~${eval.distanceKm!.toStringAsFixed(1)} km · Delivered in 15–30 mins'
                                : 'Express local delivery in 15–30 mins',
                            style: const TextStyle(
                                fontSize: 11,
                                color: Color(0xFF78350F),
                                fontWeight: FontWeight.w500),
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
    );
  }
}

class _DeliveryTransparencyCard extends StatelessWidget {
  final MultiVendorDeliveryQuoteBreakdown breakdown;
  final Address? address;
  final PricingSettings? pricing;
  final int itemsTotal;

  const _DeliveryTransparencyCard({
    required this.breakdown,
    required this.address,
    required this.pricing,
    required this.itemsTotal,
  });

  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    final isFree = breakdown.isFreeDelivery;

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
                  'Multi-Vendor Delivery Fee Breakdown',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      color: context.colors.ink),
                ),
              ),
              GestureDetector(
                onTap: () => showDeliveryBreakdownModal(
                  context,
                  breakdown: breakdown,
                  address: address,
                  pricing: pricing,
                  itemsTotal: itemsTotal,
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
            ],
          ),
          const SizedBox(height: 8),
          for (final leg in breakdown.vendors) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(
                color: context.colors.bg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: context.colors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        leg.isLocal ? '⚡' : '📦',
                        style: const TextStyle(fontSize: 14),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          leg.storeName,
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 12.5,
                            color: context.colors.ink,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: leg.isLocal
                              ? (Theme.of(context).brightness == Brightness.dark
                                  ? const Color(0xFF78350F).withValues(alpha: 0.4)
                                  : const Color(0xFFFEF3C7))
                              : (Theme.of(context).brightness == Brightness.dark
                                  ? const Color(0xFF0C4A6E).withValues(alpha: 0.4)
                                  : const Color(0xFFE0F2FE)),
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: Text(
                          leg.isLocal ? 'Local Now' : 'Courier Intercity',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: leg.isLocal
                                ? (Theme.of(context).brightness == Brightness.dark
                                    ? const Color(0xFFFCD34D)
                                    : const Color(0xFF92400E))
                                : (Theme.of(context).brightness == Brightness.dark
                                    ? const Color(0xFF7DD3FC)
                                    : const Color(0xFF0369A1)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(Icons.location_on_outlined,
                          size: 13, color: context.colors.textMuted),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          '${leg.storeCity != null && leg.storeCity!.isNotEmpty ? leg.storeCity : 'Vendor'} → ${address?.city ?? 'Customer'} · ${leg.distanceKm != null ? '${leg.distanceKm!.toStringAsFixed(1)} km' : 'Location confirmed'}',
                          style: TextStyle(
                              fontSize: 11, color: context.colors.textMuted),
                        ),
                      ),
                      Text(
                        rupees(leg.vendorDeliveryFee),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: context.colors.ink,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    leg.calculationText,
                    style: TextStyle(
                      fontSize: 10.5,
                      color: context.colors.textMuted,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (isFree)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xFF064E3B).withValues(alpha: 0.35)
                    : const Color(0xFFECFDF5),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xFF059669).withValues(alpha: 0.5)
                      : const Color(0xFFA7F3D0),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.check_circle_rounded,
                      size: 14,
                      color: Theme.of(context).brightness == Brightness.dark
                          ? const Color(0xFF6EE7B7)
                          : const Color(0xFF059669)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '🎉 Free Delivery Applied! Your order total (${rupees(itemsTotal)}) meets the ${rupees(breakdown.freeDeliveryAbove)} free delivery threshold.',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).brightness == Brightness.dark
                              ? const Color(0xFF6EE7B7)
                              : const Color(0xFF065F46)),
                    ),
                  ),
                ],
              ),
            )
          else if (breakdown.freeDeliveryRemaining > 0)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xFF78350F).withValues(alpha: 0.35)
                    : const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xFFD97706).withValues(alpha: 0.5)
                      : const Color(0xFFFDE68A),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.local_shipping_rounded,
                      size: 14,
                      color: Theme.of(context).brightness == Brightness.dark
                          ? const Color(0xFFFCD34D)
                          : const Color(0xFFD97706)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Add ${rupees(breakdown.freeDeliveryRemaining)} more items to get FREE delivery across all vendors!',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).brightness == Brightness.dark
                              ? const Color(0xFFFCD34D)
                              : const Color(0xFF92400E)),
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

void showDeliveryBreakdownModal(
  BuildContext context, {
  required MultiVendorDeliveryQuoteBreakdown breakdown,
  required Address? address,
  required PricingSettings? pricing,
  required int itemsTotal,
}) {
  final baseFee = pricing?.localDeliveryBaseFee ?? 3000;
  final baseKm = pricing?.localDeliveryBaseKm ?? 3;
  final perKm = pricing?.localDeliveryPerKmFee ?? 1000;
  final thirdPartyFee = pricing?.thirdPartyDeliveryFee ?? 7000;
  final freeAbove = pricing?.freeDeliveryAbove ?? 50000;

  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.colors.surface,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.fromLTRB(
          20, 18, 20, 24 + MediaQuery.of(ctx).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF2563EB).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.receipt_long_rounded,
                    color: Color(0xFF2563EB), size: 22),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Delivery Charge Transparency',
                      style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 16,
                          color: context.colors.ink),
                    ),
                    Text(
                      'Distance & formula applied per vendor',
                      style: TextStyle(color: context.colors.textMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: Icon(Icons.close_rounded, color: context.colors.ink),
                onPressed: () => Navigator.pop(ctx),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Config rules banner
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.colors.bg,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: context.colors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '⚙️ Platform Delivery Pricing Rules (Set in Admin)',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      color: context.colors.ink),
                ),
                const SizedBox(height: 6),
                Text(
                  '• ⚡ Local Express: Base ₹${(baseFee / 100).toStringAsFixed(0)} for first $baseKm km + ₹${(perKm / 100).toStringAsFixed(0)}/km extra distance\n'
                  '• 📦 Third-Party Courier: Flat ₹${(thirdPartyFee / 100).toStringAsFixed(0)} per intercity vendor store\n'
                  '• 🎁 Free Delivery: Applies when items subtotal exceeds ₹${(freeAbove / 100).toStringAsFixed(0)}',
                  style: TextStyle(
                      fontSize: 11, color: context.colors.textMuted, height: 1.45),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          Text(
            'Vendor Leg Details',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: context.colors.ink),
          ),
          const SizedBox(height: 8),

          for (final leg in breakdown.vendors) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.colors.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: context.colors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(leg.isLocal ? '⚡' : '📦',
                          style: const TextStyle(fontSize: 16)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          leg.storeName,
                          style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                              color: context.colors.ink),
                        ),
                      ),
                      Text(
                        rupees(leg.vendorDeliveryFee),
                        style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 13.5,
                            color: context.colors.ink),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Pickup: ${leg.storeCity != null && leg.storeCity!.isNotEmpty ? leg.storeCity : "Store"} → Delivery: ${address?.city ?? "Customer location"}',
                    style: TextStyle(
                        fontSize: 11.5, color: context.colors.textMuted),
                  ),
                  Text(
                    leg.distanceKm != null
                        ? 'Measured distance: ${leg.distanceKm!.toStringAsFixed(1)} km'
                        : 'City-level courier dispatch',
                    style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: context.colors.ink),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: context.colors.bg,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: context.colors.border),
                    ),
                    child: Text(
                      'Math: ${leg.calculationText}',
                      style: TextStyle(
                          fontSize: 11,
                          color: context.colors.ink,
                          fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const Divider(height: 20),
          Row(
            children: [
              Text('Total Delivery Fee',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: context.colors.ink)),
              const Spacer(),
              Text(
                rupees(breakdown.totalDeliveryFee),
                style: TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 14, color: context.colors.ink),
              ),
            ],
          ),
          if (breakdown.isFreeDelivery) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                const Text('Free Delivery Discount',
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: Color(0xFF059669))),
                const Spacer(),
                Text(
                  '−${rupees(breakdown.totalDeliveryFee)}',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: Color(0xFF059669)),
                ),
              ],
            ),
          ],
          const SizedBox(height: 6),
          Row(
            children: [
              const Text('Final Delivery Payable',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
              const Spacer(),
              Text(
                breakdown.finalDeliveryFee == 0
                    ? 'FREE'
                    : rupees(breakdown.finalDeliveryFee),
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 15,
                  color: breakdown.finalDeliveryFee == 0
                      ? const Color(0xFF059669)
                      : const Color(0xFF0F172A),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
