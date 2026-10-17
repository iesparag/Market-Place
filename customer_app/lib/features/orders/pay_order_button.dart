import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/format.dart';
import '../../data/providers.dart';
import '../checkout/payment_controller.dart';

/// Retry/complete payment for an order that was placed but not (yet) paid.
/// Shared by the orders list card and the order detail screen so the native
/// Razorpay listener lifecycle — genuinely fiddly, money-correctness-sensitive —
/// exists in exactly one place.
class PayOrderButton extends ConsumerStatefulWidget {
  final String orderId;
  final int total;
  const PayOrderButton({super.key, required this.orderId, required this.total});

  @override
  ConsumerState<PayOrderButton> createState() => _PayOrderButtonState();
}

class _PayOrderButtonState extends ConsumerState<PayOrderButton> {
  bool _paying = false;

  /// Owned here (not a provider): the native Razorpay listener must survive the
  /// async gap while the sheet is open, then be torn down exactly once.
  late final PaymentController _payment =
      PaymentController(ref.read(paymentRepoProvider));

  @override
  void dispose() {
    _payment.dispose();
    super.dispose();
  }

  void _refresh() {
    ref.invalidate(myOrdersProvider);
    ref.invalidate(orderProvider(widget.orderId));
  }

  Future<void> _pay() async {
    setState(() => _paying = true);
    final result =
        await _payment.pay(orderId: widget.orderId, method: 'razorpay');
    if (!mounted) return;
    setState(() => _paying = false);

    final messenger = ScaffoldMessenger.of(context);
    switch (result) {
      case PayPaid():
        messenger.showSnackBar(
            const SnackBar(content: Text('Payment successful 🎉')));
        _refresh();
      case PayCod():
        _refresh();
      case PayCancelled():
        messenger.showSnackBar(const SnackBar(
            content: Text('Payment cancelled — your order is still saved.')));
      case PayPending(:final message):
        messenger.showSnackBar(SnackBar(content: Text(message)));
        // Outcome is uncertain, not absent — a UPI collect / wallet redirect can still
        // land after the sheet closes; the webhook settles it, so refresh once the
        // server has had a chance to hear about it.
        final settled = await _payment.waitForSettlement(widget.orderId);
        if (settled != null && mounted) _refresh();
      case PayFailed(:final message):
        messenger.showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton(
        onPressed: _paying ? null : _pay,
        child: _paying
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white))
            : Text(
                widget.total > 0 ? 'Pay ${rupees(widget.total)}' : 'Pay now'),
      ),
    );
  }
}
