import '../core/api/api_client.dart';
import '../models/address.dart';
import '../models/store.dart';
import '../features/cart/cart_controller.dart';
import '../core/location/delivery_resolution.dart';

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

  factory PaymentMethodOption.fromJson(Map<String, dynamic> j) =>
      PaymentMethodOption(
        id: (j['id'] ?? '').toString(),
        label: (j['label'] ?? '').toString(),
        description: (j['description'] ?? '').toString(),
        enabled: j['enabled'] == true,
        maxOrderValue: j['maxOrderValue'] is num
            ? (j['maxOrderValue'] as num).toInt()
            : null,
      );

  /// COD is capped by the admin — an over-cap cart must not offer it.
  bool availableFor(int orderTotal) {
    if (!enabled) return false;
    if (id == 'cod' && (maxOrderValue ?? 0) > 0 && orderTotal > maxOrderValue!) {
      return false;
    }
    return true;
  }

  String? unavailableReason(int orderTotal) {
    if (id == 'cod' &&
        (maxOrderValue ?? 0) > 0 &&
        orderTotal > maxOrderValue!) {
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
  final String
      paymentStatus; // unpaid | pending | paid | failed | refunded | partially_refunded
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
          .map((e) =>
              PaymentMethodOption.fromJson((e as Map).cast<String, dynamic>()))
          .toList(),
    );
  }

  Future<CheckoutSession> startCheckout(
      {required String orderId, required String method}) async {
    final data = await api.post('/payments/checkout',
        body: {'orderId': orderId, 'method': method}) as Map<String, dynamic>;
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
    final data = await api.post('/payments/mock-pay',
        body: {'providerOrderId': providerOrderId}) as Map<String, dynamic>;
    return PaymentStatus.fromJson(data);
  }

  Future<PaymentStatus> status(String orderId) async {
    final data =
        await api.get('/payments/order/$orderId') as Map<String, dynamic>;
    return PaymentStatus.fromJson(data);
  }
}

/// One vendor leg of a multi-vendor delivery calculation.
class VendorDeliveryLegQuote {
  final String storeId;
  final String storeName;
  final String? storeCity;
  final String? customerCity;
  final double? distanceKm;
  final bool isLocal;
  final String deliveryType; // 'local_now' | 'third_party_courier'
  final int baseFee;
  final num? baseKm;
  final int? perKmFee;
  final num? extraKm;
  final int? extraKmFee;
  final int vendorDeliveryFee;
  final String calculationText;

  const VendorDeliveryLegQuote({
    required this.storeId,
    required this.storeName,
    this.storeCity,
    this.customerCity,
    this.distanceKm,
    required this.isLocal,
    required this.deliveryType,
    required this.baseFee,
    this.baseKm,
    this.perKmFee,
    this.extraKm,
    this.extraKmFee,
    required this.vendorDeliveryFee,
    required this.calculationText,
  });

  factory VendorDeliveryLegQuote.fromJson(Map<String, dynamic> j) =>
      VendorDeliveryLegQuote(
        storeId: (j['storeId'] ?? '').toString(),
        storeName: (j['storeName'] ?? '').toString(),
        storeCity: j['storeCity']?.toString(),
        customerCity: j['customerCity']?.toString(),
        distanceKm: (j['distanceKm'] as num?)?.toDouble(),
        isLocal: j['isLocal'] == true,
        deliveryType: (j['deliveryType'] ?? 'local_now').toString(),
        baseFee: (j['baseFee'] as num?)?.toInt() ?? 3000,
        baseKm: j['baseKm'] as num?,
        perKmFee: (j['perKmFee'] as num?)?.toInt(),
        extraKm: j['extraKm'] as num?,
        extraKmFee: (j['extraKmFee'] as num?)?.toInt(),
        vendorDeliveryFee: (j['vendorDeliveryFee'] as num?)?.toInt() ?? 0,
        calculationText: (j['calculationText'] ?? '').toString(),
      );
}

class MultiVendorDeliveryQuoteBreakdown {
  final int totalDeliveryFee;
  final int finalDeliveryFee;
  final bool isFreeDelivery;
  final int freeDeliveryAbove;
  final int freeDeliveryRemaining;
  final List<VendorDeliveryLegQuote> vendors;

  const MultiVendorDeliveryQuoteBreakdown({
    required this.totalDeliveryFee,
    required this.finalDeliveryFee,
    required this.isFreeDelivery,
    required this.freeDeliveryAbove,
    required this.freeDeliveryRemaining,
    required this.vendors,
  });

  factory MultiVendorDeliveryQuoteBreakdown.fromJson(Map<String, dynamic> j) {
    final list = (j['vendors'] as List?)
            ?.whereType<Map>()
            .map((e) =>
                VendorDeliveryLegQuote.fromJson(e.cast<String, dynamic>()))
            .toList() ??
        const [];
    return MultiVendorDeliveryQuoteBreakdown(
      totalDeliveryFee: (j['totalDeliveryFee'] as num?)?.toInt() ?? 0,
      finalDeliveryFee: (j['finalDeliveryFee'] as num?)?.toInt() ?? 0,
      isFreeDelivery: j['isFreeDelivery'] == true,
      freeDeliveryAbove: (j['freeDeliveryAbove'] as num?)?.toInt() ?? 50000,
      freeDeliveryRemaining:
          (j['freeDeliveryRemaining'] as num?)?.toInt() ?? 0,
      vendors: list,
    );
  }
}

/// Platform pricing rules, so the app can show the same total the server will charge.
/// Mirrors the maths in `ordersService.create`.
class CheckoutQuote {
  final int itemsTotal;
  final int discount;
  final int tax;
  final int delivery;
  final int grandTotal;
  final MultiVendorDeliveryQuoteBreakdown? deliveryBreakdown;

  const CheckoutQuote({
    required this.itemsTotal,
    this.discount = 0,
    required this.tax,
    required this.delivery,
    required this.grandTotal,
    this.deliveryBreakdown,
  });
}

/// Admin on/off switches (settings.page.ts "Features" section) — same flags the
/// backend already enforces server-side; this is just so the UI doesn't show a
/// control for something that will be rejected/no-op when tapped.
class FeatureFlags {
  final bool couponsEnabled;
  final bool loyaltyEnabled;
  final bool referralEnabled;
  final bool frequentlyBoughtTogetherEnabled;
  final bool wishlistPriceDropAlertsEnabled;
  final bool recentlyViewedEnabled;
  final bool checkoutAdBannerEnabled;
  const FeatureFlags({
    this.couponsEnabled = true,
    this.loyaltyEnabled = true,
    this.referralEnabled = true,
    this.frequentlyBoughtTogetherEnabled = true,
    this.wishlistPriceDropAlertsEnabled = true,
    this.recentlyViewedEnabled = true,
    this.checkoutAdBannerEnabled = true,
  });

  factory FeatureFlags.fromJson(Map<String, dynamic>? j) => FeatureFlags(
        couponsEnabled: j?['couponsEnabled'] != false,
        loyaltyEnabled: j?['loyaltyEnabled'] != false,
        referralEnabled: j?['referralEnabled'] != false,
        frequentlyBoughtTogetherEnabled:
            j?['frequentlyBoughtTogetherEnabled'] != false,
        wishlistPriceDropAlertsEnabled:
            j?['wishlistPriceDropAlertsEnabled'] != false,
        recentlyViewedEnabled: j?['recentlyViewedEnabled'] != false,
        checkoutAdBannerEnabled: j?['checkoutAdBannerEnabled'] != false,
      );
}

class PricingSettings {
  final num taxPercent;
  final int deliveryFee;
  final int freeDeliveryAbove;
  final int localDeliveryBaseFee;
  final num localDeliveryBaseKm;
  final int localDeliveryPerKmFee;
  final int thirdPartyDeliveryFee;
  final FeatureFlags features;

  const PricingSettings({
    required this.taxPercent,
    required this.deliveryFee,
    required this.freeDeliveryAbove,
    this.localDeliveryBaseFee = 3000,
    this.localDeliveryBaseKm = 3,
    this.localDeliveryPerKmFee = 1000,
    this.thirdPartyDeliveryFee = 7000,
    this.features = const FeatureFlags(),
  });

  factory PricingSettings.fromJson(Map<String, dynamic> j) => PricingSettings(
        taxPercent: (j['taxPercent'] as num?) ?? 5,
        deliveryFee: (j['deliveryFee'] as num?)?.toInt() ?? 4000,
        freeDeliveryAbove: (j['freeDeliveryAbove'] as num?)?.toInt() ?? 50000,
        localDeliveryBaseFee:
            (j['localDeliveryBaseFee'] as num?)?.toInt() ?? 3000,
        localDeliveryBaseKm: (j['localDeliveryBaseKm'] as num?) ?? 3,
        localDeliveryPerKmFee:
            (j['localDeliveryPerKmFee'] as num?)?.toInt() ?? 1000,
        thirdPartyDeliveryFee:
            (j['thirdPartyDeliveryFee'] as num?)?.toInt() ?? 7000,
        features: FeatureFlags.fromJson(j['features'] as Map<String, dynamic>?),
      );

  /// Calculates dynamic, multi-vendor distance-based quote matching server logic.
  CheckoutQuote quote(
    int itemsTotal, {
    int discount = 0,
    Address? address,
    List<CartLine> lines = const [],
    List<Vendor> stores = const [],
  }) {
    if (lines.isEmpty || itemsTotal <= 0) {
      return const CheckoutQuote(
        itemsTotal: 0,
        discount: 0,
        tax: 0,
        delivery: 0,
        grandTotal: 0,
      );
    }

    final taxable = (itemsTotal - discount).clamp(0, itemsTotal);
    final tax = ((taxable * taxPercent) / 100).round();

    if (address == null) {
      final delivery = itemsTotal >= freeDeliveryAbove ? 0 : deliveryFee;
      return CheckoutQuote(
        itemsTotal: itemsTotal,
        discount: discount,
        tax: tax,
        delivery: delivery,
        grandTotal: taxable + tax + delivery,
      );
    }

    // Multi-vendor calculation across distinct vendor stores
    final storeIds = lines.map((l) => l.storeId).toSet();
    final vendorLegs = <VendorDeliveryLegQuote>[];

    for (final sid in storeIds) {
      final storeName =
          lines.firstWhere((l) => l.storeId == sid).storeName ?? 'Store';
      final vendor = stores.where((s) => s.id == sid).firstOrNull;
      final eval = evaluateDeliverability(address: address, vendor: vendor);
      final isLocal = eval.isLocal;
      final distanceKm = eval.distanceKm;

      int vendorDeliveryFee;
      String calculationText;
      num? extraKm;
      int? extraKmFee;

      if (isLocal) {
        if (distanceKm != null) {
          if (distanceKm <= localDeliveryBaseKm) {
            vendorDeliveryFee = localDeliveryBaseFee;
            calculationText =
                'Base ₹${(localDeliveryBaseFee / 100).toStringAsFixed(0)} (up to $localDeliveryBaseKm km)';
          } else {
            extraKm = ((distanceKm - localDeliveryBaseKm) * 10).round() / 10;
            extraKmFee = (extraKm * localDeliveryPerKmFee).round();
            vendorDeliveryFee = localDeliveryBaseFee + extraKmFee;
            calculationText =
                'Base ₹${(localDeliveryBaseFee / 100).toStringAsFixed(0)} ($localDeliveryBaseKm km) + ($extraKm km × ₹${(localDeliveryPerKmFee / 100).toStringAsFixed(0)}/km) = ₹${(vendorDeliveryFee / 100).toStringAsFixed(0)}';
          }
        } else {
          vendorDeliveryFee = localDeliveryBaseFee;
          calculationText =
              'Local Base ₹${(localDeliveryBaseFee / 100).toStringAsFixed(0)}';
        }
      } else {
        vendorDeliveryFee = thirdPartyDeliveryFee;
        final distTag =
            distanceKm != null ? ' (~${distanceKm.round()} km)' : '';
        calculationText =
            'Third-Party Courier Standard$distTag = ₹${(thirdPartyDeliveryFee / 100).toStringAsFixed(0)}';
      }

      vendorLegs.add(
        VendorDeliveryLegQuote(
          storeId: sid,
          storeName: storeName,
          storeCity: vendor?.city,
          customerCity: address.city,
          distanceKm: distanceKm,
          isLocal: isLocal,
          deliveryType: isLocal ? 'local_now' : 'third_party_courier',
          baseFee: isLocal ? localDeliveryBaseFee : thirdPartyDeliveryFee,
          baseKm: isLocal ? localDeliveryBaseKm : null,
          perKmFee: isLocal ? localDeliveryPerKmFee : null,
          extraKm: extraKm,
          extraKmFee: extraKmFee,
          vendorDeliveryFee: vendorDeliveryFee,
          calculationText: calculationText,
        ),
      );
    }

    final totalDelivery =
        vendorLegs.fold<int>(0, (s, v) => s + v.vendorDeliveryFee);
    final isFree = itemsTotal >= freeDeliveryAbove;
    final finalDelivery = isFree ? 0 : totalDelivery;
    final remaining =
        (freeDeliveryAbove - itemsTotal).clamp(0, freeDeliveryAbove);

    final breakdown = MultiVendorDeliveryQuoteBreakdown(
      totalDeliveryFee: totalDelivery,
      finalDeliveryFee: finalDelivery,
      isFreeDelivery: isFree,
      freeDeliveryAbove: freeDeliveryAbove,
      freeDeliveryRemaining: remaining,
      vendors: vendorLegs,
    );

    return CheckoutQuote(
      itemsTotal: itemsTotal,
      discount: discount,
      tax: tax,
      delivery: finalDelivery,
      grandTotal: taxable + tax + finalDelivery,
      deliveryBreakdown: breakdown,
    );
  }
}
