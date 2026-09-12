import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/address.dart';
import '../../data/payment_repository.dart';
import '../cart/cart_controller.dart';
import 'payment_controller.dart';

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

  /// Owned by this screen: it holds a native Razorpay listener that must outlive the
  /// async gap while the sheet is open, and must be torn down exactly once.
  late final PaymentController _payment = PaymentController(ref.read(paymentRepoProvider));

  @override
  void dispose() {
    _payment.dispose();
    super.dispose();
  }

  Address? _pick(List<Address> list) {
    if (list.isEmpty) return null;
    if (_selectedId != null) {
      final m = list.where((a) => a.id == _selectedId);
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add a delivery address first')));
      return;
    }
    setState(() {
      _placing = true;
      _stage = 'placing';
    });

    String orderId;
    String orderNumber;
    try {
      final order = await ref.read(checkoutRepoProvider).placeOrder(lines: lines, address: addr);
      orderId = order.id;
      orderNumber = order.number;
      ref.read(cartProvider.notifier).clear();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _placing = false;
        _stage = 'idle';
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Order failed: $e')));
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
        context.go('/order-success?number=${Uri.encodeComponent(orderNumber)}&paid=1');
      case PayCod():
        context.go('/order-success?number=${Uri.encodeComponent(orderNumber)}&cod=1');
      case PayCancelled():
        _showUnpaid(orderNumber, "You didn't complete the payment, so nothing was charged. Your order is saved and ready whenever you are.");
      case PayFailed(:final message):
        _showUnpaid(orderNumber, message);
      case PayPending(:final message):
        _showPending(orderNumber, message);
    }
  }

  /// Genuinely unpaid (cancelled or failed) — safe to retry, so "Pay now" is the primary action.
  void _showUnpaid(String orderNumber, String message) {
    _outcomeDialog(
      orderNumber: orderNumber,
      icon: Icons.receipt_long_rounded,
      iconColor: const Color(0xFFF59E0B),
      iconBg: const Color(0xFFFFF4E5),
      title: 'Order saved — not paid yet',
      message: message,
      actionsBuilder: (dialogCtx) => [
        SizedBox(
          width: double.infinity,
          height: 50,
          child: ElevatedButton(
            onPressed: () {
              Navigator.pop(dialogCtx);
              context.go('/orders');
            },
            child: const Text('Pay now'),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          height: 50,
          child: OutlinedButton(
            onPressed: () {
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
  void _showPending(String orderNumber, String message) {
    _outcomeDialog(
      orderNumber: orderNumber,
      icon: Icons.hourglass_top_rounded,
      iconColor: const Color(0xFF2563EB),
      iconBg: const Color(0xFFEAF2FF),
      title: 'Confirming your payment',
      message: message,
      caption: "Please don't pay again for this order — we'll update it automatically.",
      actionsBuilder: (dialogCtx) => [
        SizedBox(
          width: double.infinity,
          height: 50,
          child: ElevatedButton(
            onPressed: () {
              Navigator.pop(dialogCtx);
              context.go('/orders');
            },
            child: const Text('Track in My Orders'),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          height: 50,
          child: OutlinedButton(
            onPressed: () {
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
      builder: (dialogCtx) => Dialog(
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
                decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
                child: Icon(icon, color: iconColor, size: 36),
              ),
              const SizedBox(height: 18),
              Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(color: BrandColors.textMuted, height: 1.4)),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(color: BrandColors.bg, borderRadius: BorderRadius.circular(10)),
                child: Text('Order $orderNumber', style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
              ),
              if (caption != null) ...[
                const SizedBox(height: 12),
                Text(caption, textAlign: TextAlign.center, style: const TextStyle(color: BrandColors.textMuted, fontSize: 12.5, fontStyle: FontStyle.italic)),
              ],
              const SizedBox(height: 24),
              ...actionsBuilder(dialogCtx),
            ],
          ),
        ),
      ),
    );
  }

  String _payLabel(int total) {
    if (_stage == 'placing') return 'Placing your order…';
    if (_stage == 'paying') return 'Waiting for payment…';
    return _method == 'cod' ? 'Place order · ${rupees(total)}' : 'Pay ${rupees(total)}';
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider);
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.lock_outline_rounded, size: 48, color: BrandColors.textMuted),
            const SizedBox(height: 10),
            const Text('Sign in to checkout', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 14),
            ElevatedButton(onPressed: () => context.push('/login'), child: const Text('Sign in')),
          ]),
        ),
      );
    }

    final lines = ref.watch(cartProvider);
    final subtotal = lines.fold<int>(0, (n, l) => n + l.lineTotal);
    final addressesAsync = ref.watch(addressesProvider);

    // Show exactly what the server will charge — tax and delivery included.
    final pricing = ref.watch(pricingSettingsProvider).valueOrNull;
    final quote = pricing?.quote(subtotal) ??
        CheckoutQuote(itemsTotal: subtotal, tax: 0, delivery: 0, grandTotal: subtotal);

    final methods = (ref.watch(paymentConfigProvider).valueOrNull?.methods ?? const <PaymentMethodOption>[])
        .where((m) => m.enabled)
        .toList();
    // Never leave a disabled method selected (e.g. a COD cart that grew past the cap).
    final selected = methods.where((m) => m.id == _method);
    if (methods.isNotEmpty && (selected.isEmpty || !selected.first.availableFor(quote.grandTotal))) {
      final fallback = methods.where((m) => m.availableFor(quote.grandTotal));
      if (fallback.isNotEmpty && fallback.first.id != _method) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _method = fallback.first.id);
        });
      }
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Address
          Row(children: [
            const Text('Delivery address', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const Spacer(),
            TextButton.icon(onPressed: _addAddressSheet, icon: const Icon(Icons.add, size: 18), label: const Text('Add')),
          ]),
          addressesAsync.when(
            loading: () => const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
            error: (e, _) => Text('$e', style: const TextStyle(color: BrandColors.textMuted)),
            data: (list) {
              if (list.isEmpty) {
                return _dashedBox('No saved address — tap "Add" to enter your delivery address.');
              }
              final selected = _pick(list);
              return Column(
                children: list.map((a) => _AddressCard(
                      address: a,
                      selected: a.id == selected?.id,
                      onTap: () => setState(() => _selectedId = a.id),
                    )).toList(),
              );
            },
          ),

          const SizedBox(height: 20),
          const Text('Order summary', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          ...lines.map((l) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(children: [
                  Expanded(child: Text('${l.title}  ×${l.qty}', maxLines: 1, overflow: TextOverflow.ellipsis)),
                  Text(rupees(l.lineTotal), style: const TextStyle(fontWeight: FontWeight.w600)),
                ]),
              )),
          const Divider(height: 24),
          _row('Subtotal', rupees(quote.itemsTotal)),
          _row('Tax', rupees(quote.tax)),
          _row('Delivery', quote.delivery == 0 ? 'FREE' : rupees(quote.delivery),
              valueColor: quote.delivery == 0 ? BrandColors.success : null),
          const SizedBox(height: 6),
          _row('Total', rupees(quote.grandTotal), bold: true),

          const SizedBox(height: 22),
          const Text('Payment method', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
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
                    onPressed: _placing ? null : () => _place(lines, _pick(addressesAsync.valueOrNull ?? [])),
                    child: _placing
                        ? Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                            const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                            const SizedBox(width: 12),
                            Text(_payLabel(quote.grandTotal), style: const TextStyle(fontSize: 15)),
                          ])
                        : Text(_payLabel(quote.grandTotal), style: const TextStyle(fontSize: 16)),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _row(String k, String v, {bool bold = false, Color? valueColor}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Text(k, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w500, fontSize: bold ? 16 : 14)),
          const Spacer(),
          Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: bold ? 16 : 14, color: valueColor)),
        ]),
      );

  Widget _dashedBox(String msg) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: BrandColors.bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: BrandColors.border)),
        child: Text(msg, style: const TextStyle(color: BrandColors.textMuted)),
      );

  void _addAddressSheet() {
    final label = TextEditingController(text: 'Home');
    final line1 = TextEditingController();
    final city = TextEditingController();
    final pincode = TextEditingController();
    final phone = TextEditingController();
    bool saving = false;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(20, 18, 20, 20 + MediaQuery.of(sheetCtx).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Add address', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              const SizedBox(height: 14),
              TextField(controller: label, decoration: const InputDecoration(labelText: 'Label (Home / Work)')),
              const SizedBox(height: 10),
              TextField(controller: line1, decoration: const InputDecoration(labelText: 'Address line')),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: TextField(controller: city, decoration: const InputDecoration(labelText: 'City'))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: pincode, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Pincode'))),
              ]),
              const SizedBox(height: 10),
              TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity, height: 48,
                child: ElevatedButton(
                  onPressed: saving
                      ? null
                      : () async {
                          if (line1.text.trim().isEmpty || city.text.trim().isEmpty) {
                            ScaffoldMessenger.of(sheetCtx).showSnackBar(const SnackBar(content: Text('Address line & city required')));
                            return;
                          }
                          setSheet(() => saving = true);
                          try {
                            final a = await ref.read(checkoutRepoProvider).addAddress(
                                  label: label.text.trim().isEmpty ? 'Home' : label.text.trim(),
                                  line1: line1.text.trim(), city: city.text.trim(),
                                  pincode: pincode.text.trim(), phone: phone.text.trim(),
                                  isDefault: true,
                                );
                            ref.invalidate(addressesProvider);
                            if (mounted) setState(() => _selectedId = a.id);
                            if (sheetCtx.mounted) Navigator.pop(sheetCtx);
                          } catch (e) {
                            setSheet(() => saving = false);
                            if (sheetCtx.mounted) ScaffoldMessenger.of(sheetCtx).showSnackBar(SnackBar(content: Text('$e')));
                          }
                        },
                  child: saving
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
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

class _AddressCard extends StatelessWidget {
  final Address address;
  final bool selected;
  final VoidCallback onTap;
  const _AddressCard({required this.address, required this.selected, required this.onTap});
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
          border: Border.all(color: selected ? b.primary : BrandColors.border, width: selected ? 1.5 : 1),
        ),
        child: Row(children: [
          Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked, color: selected ? b.primary : BrandColors.textMuted),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Text(address.label, style: const TextStyle(fontWeight: FontWeight.w800)),
                  if (address.isDefault) ...[
                    const SizedBox(width: 8),
                    Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1), decoration: BoxDecoration(color: BrandColors.bg, borderRadius: BorderRadius.circular(4)), child: const Text('Default', style: TextStyle(fontSize: 10, color: BrandColors.textMuted))),
                  ],
                ]),
                const SizedBox(height: 2),
                Text(address.oneLine, style: const TextStyle(color: BrandColors.textMuted, fontSize: 13)),
                if (address.phone != null && address.phone!.isNotEmpty)
                  Text('📞 ${address.phone}', style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
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
              color: selected && enabled ? b.primary : BrandColors.border,
              width: selected && enabled ? 1.5 : 1,
            ),
          ),
          child: Row(children: [
            Icon(
              selected && enabled ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              color: selected && enabled ? b.primary : BrandColors.textMuted,
            ),
            const SizedBox(width: 12),
            Text(method.id == 'cod' ? '💵' : '📱', style: const TextStyle(fontSize: 20)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(method.label, style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(subtitle, style: const TextStyle(color: BrandColors.textMuted, fontSize: 12.5)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
