import '../core/api/api_client.dart';

/// One selectable way to pay, as configured by the admin.
class PaymentMethodOption {
  final String id; // razorpay | cod
  final String label;
  final String description;
  final bool enabled;
  final int? maxOrderValue; // paise; null/0 = no cap

  const PaymentMethodOption({
    required this.id,
    required this.label,
    required this.description,
    required this.enabled,
    this.maxOrderValue,
  });

  factory PaymentMethodOption.fromJson(Map<String, dynamic> j) => PaymentMethodOption(
        id: (j['id'] ?? '').toString(),
        label: (j['label'] ?? '').toString(),
        description: (j['description'] ?? '').toString(),
        enabled: j['enabled'] == true,
        maxOrderValue: j['maxOrderValue'] is num ? (j['maxOrderValue'] as num).toInt() : null,
      );

  /// COD is capped by the admin — an over-cap cart must not offer it.
  bool availableFor(int orderTotal) {
    if (!enabled) return false;
    if (id == 'cod' && (maxOrderValue ?? 0) > 0 && orderTotal > maxOrderValue!) return false;
    return true;
  }

  String? unavailableReason(int orderTotal) {
    if (id == 'cod' && (maxOrderValue ?? 0) > 0 && orderTotal > maxOrderValue!) {
      return 'Not available above ₹${(maxOrderValue! / 100).toStringAsFixed(0)}';
    }
    return null;
  }
}

class PaymentConfig {
  final String provider; // razorpay | mock
  final bool live;
  final String publicKey;
  final List<PaymentMethodOption> methods;
  const PaymentConfig({
    required this.provider,
    required this.live,
    required this.publicKey,
    required this.methods,
  });
}

/// Everything the gateway sheet needs for one order.
class CheckoutSession {
  final String paymentId;
  final String orderId;
  final String orderNumber;
  final String method;
  final String provider;
  final String publicKey;
  final String? providerOrderId;
  final int amount;
  final String currency;
  final String brandName;
  final String brandLogo;
  final String prefillName;
  final String prefillEmail;
  final String prefillContact;
  final bool requiresGateway;

  const CheckoutSession({
    required this.paymentId,
    required this.orderId,
    required this.orderNumber,
    required this.method,
    required this.provider,
    required this.publicKey,
    required this.providerOrderId,
    required this.amount,
    required this.currency,
    required this.brandName,
    required this.brandLogo,
    required this.prefillName,
    required this.prefillEmail,
    required this.prefillContact,
    required this.requiresGateway,
  });

  factory CheckoutSession.fromJson(Map<String, dynamic> j) {
    final prefill = (j['prefill'] as Map?)?.cast<String, dynamic>() ?? const {};
    return CheckoutSession(
      paymentId: (j['paymentId'] ?? '').toString(),
      orderId: (j['orderId'] ?? '').toString(),
      orderNumber: (j['orderNumber'] ?? '').toString(),
      method: (j['method'] ?? '').toString(),
      provider: (j['provider'] ?? '').toString(),
      publicKey: (j['publicKey'] ?? '').toString(),
      providerOrderId: j['providerOrderId']?.toString(),
      amount: (j['amount'] as num?)?.toInt() ?? 0,
      currency: (j['currency'] ?? 'INR').toString(),
      brandName: (j['brandName'] ?? 'Marketplace').toString(),
      brandLogo: (j['brandLogo'] ?? '').toString(),
      prefillName: (prefill['name'] ?? '').toString(),
      prefillEmail: (prefill['email'] ?? '').toString(),
      prefillContact: (prefill['contact'] ?? '').toString(),
      requiresGateway: j['requiresGateway'] == true,
    );
  }
}

class PaymentStatus {
  final String orderId;
  final String orderStatus;
  final String paymentStatus; // unpaid | pending | paid | failed | refunded | partially_refunded
  final String? method;
  final int amount;
  final int refundedAmount;
  final String? lastFailure;

  const PaymentStatus({
    required this.orderId,
    required this.orderStatus,
    required this.paymentStatus,
    required this.method,
    required this.amount,
    required this.refundedAmount,
    required this.lastFailure,
  });

  bool get isPaid => paymentStatus == 'paid';

  factory PaymentStatus.fromJson(Map<String, dynamic> j) => PaymentStatus(
        orderId: (j['orderId'] ?? '').toString(),
        orderStatus: (j['orderStatus'] ?? '').toString(),
        paymentStatus: (j['paymentStatus'] ?? 'unpaid').toString(),
        method: j['method']?.toString(),
        amount: (j['amount'] as num?)?.toInt() ?? 0,
        refundedAmount: (j['refundedAmount'] as num?)?.toInt() ?? 0,
        lastFailure: j['lastFailure']?.toString(),
      );
}

/// Talks to the payments API. Knows nothing about the Razorpay SDK — that lives in
/// `PaymentController`, so this stays testable and platform-free.
class PaymentRepository {
  final ApiClient api;
  PaymentRepository(this.api);

  Future<PaymentConfig> config() async {
    final data = await api.get('/payments/methods') as Map<String, dynamic>;
    return PaymentConfig(
      provider: (data['provider'] ?? 'mock').toString(),
      live: data['live'] == true,
      publicKey: (data['publicKey'] ?? '').toString(),
      methods: ((data['methods'] as List?) ?? const [])
          .map((e) => PaymentMethodOption.fromJson((e as Map).cast<String, dynamic>()))
          .toList(),
    );
  }

  Future<CheckoutSession> startCheckout({required String orderId, required String method}) async {
    final data = await api.post('/payments/checkout', body: {'orderId': orderId, 'method': method})
        as Map<String, dynamic>;
    return CheckoutSession.fromJson(data);
  }

  /// Hand the gateway's signed success back to the server for verification.
  Future<PaymentStatus> confirm({
    required String providerOrderId,
    required String providerPaymentId,
    required String signature,
  }) async {
    final data = await api.post('/payments/confirm', body: {
      'providerOrderId': providerOrderId,
      'providerPaymentId': providerPaymentId,
      'signature': signature,
    }) as Map<String, dynamic>;
    return PaymentStatus.fromJson(data);
  }

  /// Dev gateway only (no Razorpay keys on the server).
  Future<PaymentStatus> mockPay(String providerOrderId) async {
    final data = await api.post('/payments/mock-pay', body: {'providerOrderId': providerOrderId})
        as Map<String, dynamic>;
    return PaymentStatus.fromJson(data);
  }

  Future<PaymentStatus> status(String orderId) async {
    final data = await api.get('/payments/order/$orderId') as Map<String, dynamic>;
    return PaymentStatus.fromJson(data);
  }
}

/// Platform pricing rules, so the app can show the same total the server will charge.
/// Mirrors the maths in `ordersService.create`.
class CheckoutQuote {
  final int itemsTotal;
  final int tax;
  final int delivery;
  final int grandTotal;
  const CheckoutQuote({
    required this.itemsTotal,
    required this.tax,
    required this.delivery,
    required this.grandTotal,
  });
}

class PricingSettings {
  final num taxPercent;
  final int deliveryFee;
  final int freeDeliveryAbove;
  const PricingSettings({
    required this.taxPercent,
    required this.deliveryFee,
    required this.freeDeliveryAbove,
  });

  factory PricingSettings.fromJson(Map<String, dynamic> j) => PricingSettings(
        taxPercent: (j['taxPercent'] as num?) ?? 5,
        deliveryFee: (j['deliveryFee'] as num?)?.toInt() ?? 4000,
        freeDeliveryAbove: (j['freeDeliveryAbove'] as num?)?.toInt() ?? 50000,
      );

  /// Same rounding as the backend (`percentOf` → round to nearest paisa).
  CheckoutQuote quote(int itemsTotal, {int discount = 0}) {
    final taxable = itemsTotal - discount;
    final tax = ((taxable * taxPercent) / 100).round();
    final delivery = itemsTotal >= freeDeliveryAbove ? 0 : deliveryFee;
    return CheckoutQuote(
      itemsTotal: itemsTotal,
      tax: tax,
      delivery: delivery,
      grandTotal: taxable + tax + delivery,
    );
  }
}
