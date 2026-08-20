class OrderModel {
  final String id;
  final String number;
  final String status;
  final int total; // paise
  final String? createdAt;
  final int itemCount;
  /// razorpay | cod | mock | null (nothing started yet)
  final String? paymentMethod;
  /// unpaid | pending | paid | failed | refunded | partially_refunded
  final String paymentStatus;
  final int refundedAmount;

  OrderModel({
    required this.id,
    required this.number,
    required this.status,
    required this.total,
    this.createdAt,
    required this.itemCount,
    this.paymentMethod,
    this.paymentStatus = 'unpaid',
    this.refundedAmount = 0,
  });

  bool get isPaid => paymentStatus == 'paid';

  /// Still owes us money online: not paid, not COD, and the order is still open.
  bool get needsPayment =>
      !isPaid && paymentMethod != 'cod' && status != 'cancelled' && status != 'refunded';

  /// Will pay cash on delivery — nothing to collect in the app.
  bool get isCodPending => paymentMethod == 'cod' && !isPaid && status != 'cancelled';

  factory OrderModel.fromJson(Map<String, dynamic> j) {
    // Totals live under `amounts` on the order; the flat keys are a fallback for
    // the leaner shapes some list endpoints return.
    int total = 0;
    final amounts = (j['amounts'] as Map?)?.cast<String, dynamic>();
    if (amounts != null && amounts['grandTotal'] is num) {
      total = (amounts['grandTotal'] as num).toInt();
    } else {
      for (final k in ['grandTotal', 'total', 'payable', 'amount', 'subtotal']) {
        if (j[k] is num) {
          total = (j[k] as num).toInt();
          break;
        }
      }
    }

    int items = 0;
    if (j['items'] is List) {
      items = (j['items'] as List)
          .fold(0, (n, e) => n + ((e is Map && e['qty'] is num) ? (e['qty'] as num).toInt() : 1));
    } else if (j['subOrders'] is List) {
      for (final so in (j['subOrders'] as List)) {
        if (so is Map && so['items'] is List) items += (so['items'] as List).length;
      }
    }

    final payment = (j['payment'] as Map?)?.cast<String, dynamic>();
    return OrderModel(
      id: (j['_id'] ?? '').toString(),
      number: (j['orderNumber'] ?? j['number'] ?? '').toString(),
      status: (j['status'] ?? 'pending').toString(),
      total: total,
      createdAt: j['createdAt']?.toString(),
      itemCount: items,
      paymentMethod: payment?['method']?.toString(),
      paymentStatus: (payment?['status'] ?? 'unpaid').toString(),
      refundedAmount: (payment?['refundedAmount'] as num?)?.toInt() ?? 0,
    );
  }
}
