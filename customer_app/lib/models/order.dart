class OrderModel {
  final String id;
  final String number;
  final String status;
  final int total; // paise (best-effort)
  final String? createdAt;
  final int itemCount;

  OrderModel({
    required this.id,
    required this.number,
    required this.status,
    required this.total,
    this.createdAt,
    required this.itemCount,
  });

  factory OrderModel.fromJson(Map<String, dynamic> j) {
    int total = 0;
    for (final k in ['grandTotal', 'total', 'payable', 'amount', 'subtotal']) {
      if (j[k] is num) { total = (j[k] as num).toInt(); break; }
    }
    int items = 0;
    if (j['items'] is List) {
      items = (j['items'] as List).fold(0, (n, e) => n + ((e is Map && e['qty'] is num) ? (e['qty'] as num).toInt() : 1));
    } else if (j['subOrders'] is List) {
      for (final so in (j['subOrders'] as List)) {
        if (so is Map && so['items'] is List) items += (so['items'] as List).length;
      }
    }
    return OrderModel(
      id: (j['_id'] ?? '').toString(),
      number: (j['orderNumber'] ?? j['number'] ?? '').toString(),
      status: (j['status'] ?? 'pending').toString(),
      total: total,
      createdAt: j['createdAt']?.toString(),
      itemCount: items,
    );
  }
}
