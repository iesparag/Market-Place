class OrderItem {
  final String productId;
  final String storeId;
  final String title;
  final String? variantLabel;
  final String? image;
  final int qty;
  final int unitPrice; // paise
  final int lineTotal; // paise

  OrderItem({
    required this.productId,
    required this.storeId,
    required this.title,
    this.variantLabel,
    this.image,
    required this.qty,
    required this.unitPrice,
    required this.lineTotal,
  });

  factory OrderItem.fromJson(Map<String, dynamic> j) => OrderItem(
        productId: (j['productId'] ?? '').toString(),
        storeId: (j['storeId'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        variantLabel: (j['variantLabel'] as String?)?.trim().isEmpty == true ? null : j['variantLabel']?.toString(),
        image: j['image']?.toString(),
        qty: (j['qty'] as num?)?.toInt() ?? 1,
        unitPrice: (j['unitPrice'] as num?)?.toInt() ?? 0,
        lineTotal: (j['lineTotal'] as num?)?.toInt() ?? 0,
      );
}

class OrderAmounts {
  final int itemsTotal;
  final int discount;
  final int tax;
  final int delivery;
  final int grandTotal;

  OrderAmounts({
    required this.itemsTotal,
    required this.discount,
    required this.tax,
    required this.delivery,
    required this.grandTotal,
  });

  factory OrderAmounts.fromJson(Map<String, dynamic> j) => OrderAmounts(
        itemsTotal: (j['itemsTotal'] as num?)?.toInt() ?? 0,
        discount: (j['discount'] as num?)?.toInt() ?? 0,
        tax: (j['tax'] as num?)?.toInt() ?? 0,
        delivery: (j['delivery'] as num?)?.toInt() ?? 0,
        grandTotal: (j['grandTotal'] as num?)?.toInt() ?? 0,
      );
}

class OrderContact {
  final String? name;
  final String? phone;
  final String? email;

  OrderContact({this.name, this.phone, this.email});

  factory OrderContact.fromJson(Map<String, dynamic> j) => OrderContact(
        name: j['name']?.toString(),
        phone: j['phone']?.toString(),
        email: j['email']?.toString(),
      );
}

class OrderShippingAddress {
  final String? line1;
  final String? city;
  final String? pincode;

  OrderShippingAddress({this.line1, this.city, this.pincode});

  factory OrderShippingAddress.fromJson(Map<String, dynamic> j) => OrderShippingAddress(
        line1: j['line1']?.toString(),
        city: j['city']?.toString(),
        pincode: j['pincode']?.toString(),
      );

  String get oneLine => [line1, city, pincode]
      .where((e) => e != null && e.isNotEmpty)
      .join(', ');
}

class DeliveryStatusEvent {
  final String status;
  final String? at;
  DeliveryStatusEvent({required this.status, this.at});
  factory DeliveryStatusEvent.fromJson(Map<String, dynamic> j) =>
      DeliveryStatusEvent(status: (j['status'] ?? '').toString(), at: j['at']?.toString());
}

class DeliveryRider {
  final String name;
  final String? vehicleType;
  final double? lastKnownLat;
  final double? lastKnownLng;

  DeliveryRider({required this.name, this.vehicleType, this.lastKnownLat, this.lastKnownLng});

  factory DeliveryRider.fromJson(Map<String, dynamic> j) {
    final loc = (j['lastKnownLocation'] as Map?)?.cast<String, dynamic>();
    return DeliveryRider(
      name: (j['name'] ?? '').toString(),
      vehicleType: j['vehicleType']?.toString(),
      lastKnownLat: (loc?['lat'] as num?)?.toDouble(),
      lastKnownLng: (loc?['lng'] as num?)?.toDouble(),
    );
  }
}

/// Per-store fulfillment + delivery leg — one order can have more than one of these
/// when items come from different vendors. Backed by `GET /orders/:id`'s
/// `deliveryTasks[]`, which only exists once the order is a real commitment (paid or
/// COD-confirmed) — a still-`pending` order has none yet.
class DeliveryTaskInfo {
  final String id;
  final String storeId;
  /// pending | accepted | preparing | ready | pickup_started | pickup_arrived |
  /// picked_up | delivery_started | delivery_arrived | delivered | cancelled | refunded
  final String status;
  final List<DeliveryStatusEvent> statusHistory;
  final String fulfillmentSource; // own_fleet | third_party
  final String? trackingUrl;
  final DeliveryRider? rider;
  /// Delivery destination — feeds the live rider→destination polyline on the tracking map.
  final double? dropLat;
  final double? dropLng;

  DeliveryTaskInfo({
    required this.id,
    required this.storeId,
    required this.status,
    required this.statusHistory,
    required this.fulfillmentSource,
    this.trackingUrl,
    this.rider,
    this.dropLat,
    this.dropLng,
  });

  /// True while the rider is actively on the move (not just assigned-and-waiting,
  /// not yet handed off) — this is when the live map is worth showing.
  bool get isOutForDelivery => const {
        'pickup_started',
        'pickup_arrived',
        'picked_up',
        'delivery_started',
        'delivery_arrived',
      }.contains(status);

  factory DeliveryTaskInfo.fromJson(Map<String, dynamic> j) {
    final history = j['statusHistory'] is List
        ? (j['statusHistory'] as List)
            .whereType<Map>()
            .map((e) => DeliveryStatusEvent.fromJson(e.cast<String, dynamic>()))
            .toList()
        : <DeliveryStatusEvent>[];
    final riderJson = (j['rider'] as Map?)?.cast<String, dynamic>();
    return DeliveryTaskInfo(
      id: (j['_id'] ?? '').toString(),
      storeId: (j['storeId'] ?? '').toString(),
      status: (j['status'] ?? 'pending').toString(),
      statusHistory: history,
      fulfillmentSource: (j['fulfillmentSource'] ?? 'own_fleet').toString(),
      trackingUrl: j['trackingUrl']?.toString(),
      rider: riderJson != null ? DeliveryRider.fromJson(riderJson) : null,
      dropLat: (j['dropLat'] as num?)?.toDouble(),
      dropLng: (j['dropLng'] as num?)?.toDouble(),
    );
  }
}

class OrderModel {
  final String id;
  final String number;
  final String status;
  final int total; // paise
  final String? createdAt;
  final String? updatedAt;
  final int itemCount;
  /// razorpay | cod | mock | null (nothing started yet)
  final String? paymentMethod;
  /// unpaid | pending | paid | failed | refunded | partially_refunded
  final String paymentStatus;
  final int refundedAmount;
  final String? paidAt;
  final List<OrderItem> items;
  final OrderAmounts? amounts;
  final OrderContact? contact;
  final OrderShippingAddress? shippingAddress;
  final List<DeliveryTaskInfo> deliveryTasks;

  OrderModel({
    required this.id,
    required this.number,
    required this.status,
    required this.total,
    this.createdAt,
    this.updatedAt,
    required this.itemCount,
    this.paymentMethod,
    this.paymentStatus = 'unpaid',
    this.refundedAmount = 0,
    this.paidAt,
    this.items = const [],
    this.amounts,
    this.contact,
    this.shippingAddress,
    this.deliveryTasks = const [],
  });

  bool get isPaid => paymentStatus == 'paid';

  /// Still owes us money online: not paid, not COD, and the order is still open.
  bool get needsPayment =>
      !isPaid && paymentMethod != 'cod' && status != 'cancelled' && status != 'refunded';

  /// Will pay cash on delivery — nothing to collect in the app.
  bool get isCodPending => paymentMethod == 'cod' && !isPaid && status != 'cancelled';

  bool get canCancel => status == 'pending';

  factory OrderModel.fromJson(Map<String, dynamic> j) {
    // Totals live under `amounts` on the order; the flat keys are a fallback for
    // the leaner shapes some list endpoints return.
    int total = 0;
    final amountsJson = (j['amounts'] as Map?)?.cast<String, dynamic>();
    if (amountsJson != null && amountsJson['grandTotal'] is num) {
      total = (amountsJson['grandTotal'] as num).toInt();
    } else {
      for (final k in ['grandTotal', 'total', 'payable', 'amount', 'subtotal']) {
        if (j[k] is num) {
          total = (j[k] as num).toInt();
          break;
        }
      }
    }

    final items = j['items'] is List
        ? (j['items'] as List)
            .whereType<Map>()
            .map((e) => OrderItem.fromJson(e.cast<String, dynamic>()))
            .toList()
        : <OrderItem>[];

    int itemCount = 0;
    if (items.isNotEmpty) {
      itemCount = items.fold(0, (n, it) => n + it.qty);
    } else if (j['subOrders'] is List) {
      for (final so in (j['subOrders'] as List)) {
        if (so is Map && so['items'] is List) itemCount += (so['items'] as List).length;
      }
    }

    final payment = (j['payment'] as Map?)?.cast<String, dynamic>();
    final contactJson = (j['contact'] as Map?)?.cast<String, dynamic>();
    final addressJson = (j['shippingAddress'] as Map?)?.cast<String, dynamic>();
    return OrderModel(
      id: (j['_id'] ?? '').toString(),
      number: (j['orderNumber'] ?? j['number'] ?? '').toString(),
      status: (j['status'] ?? 'pending').toString(),
      total: total,
      createdAt: j['createdAt']?.toString(),
      updatedAt: j['updatedAt']?.toString(),
      itemCount: itemCount,
      paymentMethod: payment?['method']?.toString(),
      paymentStatus: (payment?['status'] ?? 'unpaid').toString(),
      refundedAmount: (payment?['refundedAmount'] as num?)?.toInt() ?? 0,
      paidAt: payment?['paidAt']?.toString(),
      items: items,
      amounts: amountsJson != null ? OrderAmounts.fromJson(amountsJson) : null,
      contact: contactJson != null ? OrderContact.fromJson(contactJson) : null,
      shippingAddress: addressJson != null ? OrderShippingAddress.fromJson(addressJson) : null,
      deliveryTasks: j['deliveryTasks'] is List
          ? (j['deliveryTasks'] as List)
              .whereType<Map>()
              .map((e) => DeliveryTaskInfo.fromJson(e.cast<String, dynamic>()))
              .toList()
          : const [],
    );
  }
}
