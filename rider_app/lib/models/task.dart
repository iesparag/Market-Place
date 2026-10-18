import 'package:geolocator/geolocator.dart';

class TaskItem {
  final String title;
  final int qty;
  final String? image;
  TaskItem({required this.title, required this.qty, this.image});
  factory TaskItem.fromJson(Map<String, dynamic> j) => TaskItem(
        title: (j['title'] ?? 'Item').toString(),
        qty: (j['qty'] as num?)?.toInt() ?? 1,
        image: (j['image'] as String?)?.trim().isEmpty == true ? null : j['image']?.toString(),
      );
}

class TaskAddress {
  final String? line1;
  final String? line2;
  final String? landmark;
  final String? city;
  final String? state;
  final String? pincode;
  final double? lat;
  final double? lng;
  TaskAddress({this.line1, this.line2, this.landmark, this.city, this.state, this.pincode, this.lat, this.lng});
  factory TaskAddress.fromJson(Map<String, dynamic>? j) => TaskAddress(
        line1: j?['line1']?.toString(),
        line2: (j?['line2'] as String?)?.trim().isEmpty == true ? null : j?['line2']?.toString(),
        landmark: (j?['landmark'] as String?)?.trim().isEmpty == true ? null : j?['landmark']?.toString(),
        city: j?['city']?.toString(),
        state: j?['state']?.toString(),
        pincode: j?['pincode']?.toString(),
        lat: (j?['lat'] as num?)?.toDouble(),
        lng: (j?['lng'] as num?)?.toDouble(),
      );

  bool get hasLocation => lat != null && lng != null;
  String get oneLine =>
      [line2, line1, if (landmark != null) 'near $landmark', city, state, pincode]
          .where((e) => e != null && e.isNotEmpty)
          .join(', ');
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
  final String? storeName;
  final String? storePhone;
  final String? customerName;
  final String? customerPhone;
  /// Cash to collect on delivery — null for a prepaid order (nothing to collect).
  final int? codAmount;
  /// The customer's note to THIS vendor (cart screen — "Instructions for [store]").
  final String? instructions;
  final DateTime? updatedAt;
  /// What this delivery paid — OSRM pickup→drop route distance × the drop city's
  /// configured ₹/km rate (set by an admin on the Rider Rates page). Null until the
  /// task is delivered, AND if no rate is configured yet for that city.
  final int? payoutAmount;
  final int? payoutDistanceMeters;
  final double? pickupDropDistanceKm;
  final int? ratePerKm;
  final int? estimatedPayout;

  TaskModel({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.items,
    required this.pickup,
    required this.drop,
    this.offer,
    this.storeName,
    this.storePhone,
    this.customerName,
    this.customerPhone,
    this.codAmount,
    this.instructions,
    this.updatedAt,
    this.payoutAmount,
    this.payoutDistanceMeters,
    this.pickupDropDistanceKm,
    this.ratePerKm,
    this.estimatedPayout,
  });

  bool get isCod => codAmount != null;

  bool get isReadyForPickup => status == 'ready';
  bool get isDelivered => status == 'delivered';

  /// Best available payout amount in paise.
  int get finalOrEstimatedPayout => payoutAmount ?? estimatedPayout ?? 0;

  /// Effective rate in ₹/km.
  double get rateRupeesPerKm => (ratePerKm ?? 800) / 100.0;

  /// Pickup-to-drop distance in km.
  double? get deliveryLegKm {
    if (pickupDropDistanceKm != null && pickupDropDistanceKm! > 0) {
      return pickupDropDistanceKm;
    }
    if (payoutDistanceMeters != null && payoutDistanceMeters! > 0) {
      return (payoutDistanceMeters! / 1000.0 * 10).round() / 10.0;
    }
    if (pickup.hasLocation && drop.hasLocation) {
      final meters = Geolocator.distanceBetween(
        pickup.lat!,
        pickup.lng!,
        drop.lat!,
        drop.lng!,
      );
      return (meters / 1000.0 * 10).round() / 10.0;
    }
    return null;
  }

  /// Rider-to-pickup distance in km.
  double? riderToPickupKm(double? riderLat, double? riderLng) {
    if (riderLat == null || riderLng == null || !pickup.hasLocation) return null;
    final meters = Geolocator.distanceBetween(
      riderLat,
      riderLng,
      pickup.lat!,
      pickup.lng!,
    );
    return (meters / 1000.0 * 10).round() / 10.0;
  }

  /// Total trip distance: (Rider -> Pickup) + (Pickup -> Drop).
  double? totalTripKm(double? riderLat, double? riderLng) {
    final leg1 = riderToPickupKm(riderLat, riderLng);
    final leg2 = deliveryLegKm;
    if (leg1 != null && leg2 != null) {
      return ((leg1 + leg2) * 10).round() / 10.0;
    }
    return leg2 ?? leg1;
  }

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
      storeName: j['storeName']?.toString(),
      storePhone: (j['storePhone'] as String?)?.trim().isEmpty == true ? null : j['storePhone']?.toString(),
      customerName: j['customerName']?.toString(),
      customerPhone: (j['customerPhone'] as String?)?.trim().isEmpty == true ? null : j['customerPhone']?.toString(),
      codAmount: (j['codAmount'] as num?)?.toInt(),
      instructions: (j['instructions'] as String?)?.trim().isEmpty == true ? null : j['instructions']?.toString(),
      updatedAt: DateTime.tryParse(j['updatedAt']?.toString() ?? ''),
      payoutAmount: (j['payoutAmount'] as num?)?.toInt(),
      payoutDistanceMeters: (j['payoutDistanceMeters'] as num?)?.toInt(),
      pickupDropDistanceKm: (j['pickupDropDistanceKm'] as num?)?.toDouble(),
      ratePerKm: (j['ratePerKm'] as num?)?.toInt(),
      estimatedPayout: (j['estimatedPayout'] as num?)?.toInt(),
    );
  }
}
