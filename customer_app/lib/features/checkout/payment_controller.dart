import 'dart:async';

import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../core/api/api_client.dart';
import '../../data/payment_repository.dart';

/// How a pay attempt ended. A user cancelling is a normal outcome, not an error —
/// the caller shows a gentle message and keeps the order payable.
sealed class PayResult {
  const PayResult();
}

class PayPaid extends PayResult {
  final PaymentStatus status;
  const PayPaid(this.status);
}

/// Cash on delivery — confirmed, nothing collected yet.
class PayCod extends PayResult {
  final PaymentStatus status;
  const PayCod(this.status);
}

class PayCancelled extends PayResult {
  const PayCancelled();
}

class PayFailed extends PayResult {
  final String message;
  const PayFailed(this.message);
}

/// Drives one payment from start to finish.
///
/// The Razorpay plugin is event-based and global-ish, so this wraps it in a
/// `Completer` and guarantees:
///  - exactly one outcome per attempt (late duplicate events are ignored),
///  - the native listener is always torn down, even on an exception,
///  - the *server* decides whether the payment counts — the SDK's "success" is only
///    a signed claim, which `/payments/confirm` verifies.
class PaymentController {
  final PaymentRepository repo;
  PaymentController(this.repo);

  Razorpay? _razorpay;
  Completer<PayResult>? _completer;
  CheckoutSession? _session;

  /// Start (or retry) payment for [orderId] using [method] (`razorpay` or `cod`).
  Future<PayResult> pay({required String orderId, required String method}) async {
    CheckoutSession session;
    try {
      session = await repo.startCheckout(orderId: orderId, method: method);
    } on ApiException catch (e) {
      return PayFailed(e.message);
    } catch (_) {
      return const PayFailed('Could not start the payment. Please try again.');
    }

    // COD settles on delivery — there is no sheet to open.
    if (!session.requiresGateway) {
      final status = await _safeStatus(orderId);
      return PayCod(status ??
          const PaymentStatus(
            orderId: '',
            orderStatus: 'pending',
            paymentStatus: 'pending',
            method: 'cod',
            amount: 0,
            refundedAmount: 0,
            lastFailure: null,
          ));
    }

    // Dev gateway (server has no Razorpay keys): confirm straight through.
    if (session.provider == 'mock') {
      try {
        return PayPaid(await repo.mockPay(session.providerOrderId!));
      } on ApiException catch (e) {
        return PayFailed(e.message);
      }
    }

    return _openSheet(session, orderId);
  }

  Future<PayResult> _openSheet(CheckoutSession session, String orderId) {
    final completer = Completer<PayResult>();
    _completer = completer;
    _session = session;

    final razorpay = Razorpay();
    _razorpay = razorpay;
    razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
    razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onError);
    razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _onExternalWallet);

    try {
      razorpay.open({
        'key': session.publicKey,
        'amount': session.amount, // already paise — no conversion
        'currency': session.currency,
        'name': session.brandName,
        if (session.brandLogo.isNotEmpty) 'image': session.brandLogo,
        'description': 'Order ${session.orderNumber}',
        'order_id': session.providerOrderId,
        'prefill': {
          'name': session.prefillName,
          'email': session.prefillEmail,
          'contact': session.prefillContact,
        },
        'notes': {'orderId': orderId},
        'theme': {'color': '#EA580C'},
        'retry': {'enabled': true, 'max_count': 1},
      });
    } catch (e) {
      _finish(PayFailed('Could not open the payment screen: $e'));
    }
    return completer.future;
  }

  Future<void> _onSuccess(PaymentSuccessResponse response) async {
    final session = _session;
    final providerOrderId = response.orderId ?? session?.providerOrderId;
    final providerPaymentId = response.paymentId;
    final signature = response.signature;

    if (providerOrderId == null || providerPaymentId == null || signature == null) {
      // Shouldn't happen with an order-backed checkout, but never assume: fall back
      // to asking our own server what it thinks.
      await _finishWithServerTruth('We could not verify your payment. If money was debited it will be confirmed shortly.');
      return;
    }

    try {
      final status = await repo.confirm(
        providerOrderId: providerOrderId,
        providerPaymentId: providerPaymentId,
        signature: signature,
      );
      _finish(PayPaid(status));
    } catch (_) {
      // The sheet succeeded but our verify call didn't land (flaky network). The
      // webhook is the backstop — re-read our own status before declaring failure.
      await _finishWithServerTruth(
        'Payment received but not yet confirmed. It will update automatically in a moment.',
      );
    }
  }

  void _onError(PaymentFailureResponse response) {
    // Razorpay reports a user-dismissed sheet as an error code; treat it as a cancel.
    if (response.code == Razorpay.PAYMENT_CANCELLED) {
      _finish(const PayCancelled());
      return;
    }
    _finish(PayFailed(_readableError(response)));
  }

  void _onExternalWallet(ExternalWalletResponse response) {
    // The customer left for an external wallet app; the webhook will settle it.
    _finish(PayFailed('Complete the payment in ${response.walletName ?? 'your wallet app'} — we will confirm it automatically.'));
  }

  Future<void> _finishWithServerTruth(String fallbackMessage) async {
    final orderId = _session?.orderId;
    final status = orderId == null ? null : await _safeStatus(orderId);
    if (status != null && status.isPaid) {
      _finish(PayPaid(status));
    } else {
      _finish(PayFailed(fallbackMessage));
    }
  }

  Future<PaymentStatus?> _safeStatus(String orderId) async {
    try {
      return await repo.status(orderId);
    } catch (_) {
      return null;
    }
  }

  /// Complete exactly once, then tear the native listener down.
  void _finish(PayResult result) {
    final completer = _completer;
    _completer = null;
    _session = null;
    dispose();
    if (completer != null && !completer.isCompleted) completer.complete(result);
  }

  /// Poll after an inconclusive attempt (UPI collect can settle minutes later).
  Future<PaymentStatus?> waitForSettlement(String orderId, {Duration timeout = const Duration(seconds: 60)}) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      await Future<void>.delayed(const Duration(seconds: 3));
      final status = await _safeStatus(orderId);
      if (status != null && status.paymentStatus != 'pending' && status.paymentStatus != 'unpaid') {
        return status;
      }
    }
    return null;
  }

  /// Safe to call more than once; must be called from the screen's `dispose()`.
  void dispose() {
    _razorpay?.clear();
    _razorpay = null;
  }

  static String _readableError(PaymentFailureResponse r) {
    final message = r.message;
    if (message != null && message.trim().isNotEmpty && !message.contains('{')) return message;
    return 'Payment failed. Please try another method.';
  }
}
