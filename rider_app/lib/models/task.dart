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

/// One step in the rider-controlled pickup/delivery leg, in order. Mirrors
/// backend/src/modules/delivery/delivery-tasks.service.ts's RIDER_STATUSES.
class TaskStep {
  final String status;
  final String buttonLabel;
  final String currentLabel;
  const TaskStep(this.status, this.buttonLabel, this.currentLabel);
}

const List<TaskStep> kTaskSteps = [
  TaskStep('pickup_started', 'Start heading to pickup', 'Heading to pickup'),
  TaskStep('pickup_arrived', 'Arrived at pickup', 'At the pickup point'),
  TaskStep('picked_up', 'Mark picked up', 'Picked up — heading out'),
  TaskStep('delivery_started', 'Start delivery', 'Out for delivery'),
  TaskStep('delivery_arrived', 'Arrived at customer', 'At the customer\'s location'),
  TaskStep('delivered', 'Mark delivered', 'Delivered'),
];

/// A delivery task as the assigned (or offered-to) rider sees it — one per (order,
/// store), same entity the admin portal's Delivery/Fulfillment pages manage.
class TaskModel {
  final String id;
  final String orderNumber;
  /// pending | accepted | preparing | ready | pickup_started | pickup_arrived |
  /// picked_up | delivery_started | delivery_arrived | delivered | cancelled | refunded
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
  bool get isDelivered => status == 'delivered';

  /// The step the rider should take next, or null once delivered (nothing left to do)
  /// or if the task is still 'ready' (use [isReadyForPickup] — the first step, index 0,
  /// applies there).
  TaskStep? get nextStep {
    if (status == 'ready') return kTaskSteps.first;
    final i = kTaskSteps.indexWhere((s) => s.status == status);
    if (i == -1 || i + 1 >= kTaskSteps.length) return null;
    return kTaskSteps[i + 1];
  }

  /// Human label for the task's current stage (for the status badge).
  String get stageLabel {
    if (status == 'ready') return 'Ready for pickup';
    final step = kTaskSteps.firstWhere((s) => s.status == status, orElse: () => kTaskSteps.first);
    return step.currentLabel;
  }

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
