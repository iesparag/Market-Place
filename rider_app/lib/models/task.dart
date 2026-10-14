class TaskItem {
  final String title;
  final int qty;
  TaskItem({required this.title, required this.qty});
  factory TaskItem.fromJson(Map<String, dynamic> j) =>
      TaskItem(title: (j['title'] ?? 'Item').toString(), qty: (j['qty'] as num?)?.toInt() ?? 1);
}

class TaskAddress {
  final String? line1;
  final String? city;
  final String? pincode;
  TaskAddress({this.line1, this.city, this.pincode});
  factory TaskAddress.fromJson(Map<String, dynamic>? j) =>
      TaskAddress(line1: j?['line1']?.toString(), city: j?['city']?.toString(), pincode: j?['pincode']?.toString());

  String get oneLine => [line1, city, pincode].where((e) => e != null && e.isNotEmpty).join(', ');
}

/// An offer currently open on a task — only present while it's being auto-assignment-
/// offered to this rider (see backend auto-assign.service.ts).
class TaskOffer {
  final DateTime expiresAt;
  final int attempt;
  TaskOffer({required this.expiresAt, required this.attempt});
  factory TaskOffer.fromJson(Map<String, dynamic> j) => TaskOffer(
        expiresAt: DateTime.tryParse(j['expiresAt']?.toString() ?? '') ?? DateTime.now(),
        attempt: (j['attempt'] as num?)?.toInt() ?? 1,
      );

  Duration get remaining {
    final d = expiresAt.difference(DateTime.now());
    return d.isNegative ? Duration.zero : d;
  }
}

/// A delivery task as the assigned (or offered-to) rider sees it — one per (order,
/// store), same entity the admin portal's Delivery/Fulfillment pages manage.
class TaskModel {
  final String id;
  final String orderNumber;
  /// pending | accepted | preparing | ready | shipped | delivered | cancelled | refunded
  final String status;
  final List<TaskItem> items;
  final TaskAddress pickup;
  final TaskAddress drop;
  final TaskOffer? offer;

  TaskModel({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.items,
    required this.pickup,
    required this.drop,
    this.offer,
  });

  bool get isReadyForPickup => status == 'ready';
  bool get isOutForDelivery => status == 'shipped';

  factory TaskModel.fromJson(Map<String, dynamic> j) {
    final items = j['items'] is List
        ? (j['items'] as List).whereType<Map>().map((e) => TaskItem.fromJson(e.cast<String, dynamic>())).toList()
        : <TaskItem>[];
    final offerJson = (j['offer'] as Map?)?.cast<String, dynamic>();
    return TaskModel(
      id: (j['_id'] ?? '').toString(),
      orderNumber: (j['orderNumber'] ?? '').toString(),
      status: (j['status'] ?? 'pending').toString(),
      items: items,
      pickup: TaskAddress.fromJson((j['pickupAddress'] as Map?)?.cast<String, dynamic>()),
      drop: TaskAddress.fromJson((j['dropAddress'] as Map?)?.cast<String, dynamic>()),
      offer: offerJson != null ? TaskOffer.fromJson(offerJson) : null,
    );
  }
}
