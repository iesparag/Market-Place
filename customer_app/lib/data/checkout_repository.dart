import '../core/api/api_client.dart';
import '../models/address.dart';
import '../models/order.dart';
import '../features/cart/cart_controller.dart';

/// Authenticated: addresses + placing/listing orders.
/// Paying is handled by `PaymentRepository` + `PaymentController`.
class CheckoutRepository {
  final ApiClient api;
  CheckoutRepository(this.api);

  Future<List<Address>> addresses() async {
    final data = await api.get('/addresses') as List;
    return data
        .map((e) => Address.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Address> addAddress({
    required String label,
    String? recipientName,
    required String line1,
    String? line2,
    String? landmark,
    required String city,
    String? state,
    String? pincode,
    String? phone,
    bool isDefault = false,
    double? lat,
    double? lng,
  }) async {
    final data = await api.post('/addresses', body: {
      'label': label,
      'line1': line1,
      'city': city,
      if (recipientName != null && recipientName.isNotEmpty)
        'recipientName': recipientName,
      if (line2 != null && line2.isNotEmpty) 'line2': line2,
      if (landmark != null && landmark.isNotEmpty) 'landmark': landmark,
      if (state != null && state.isNotEmpty) 'state': state,
      if (pincode != null && pincode.isNotEmpty) 'pincode': pincode,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
      'isDefault': isDefault,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
    }) as Map<String, dynamic>;
    return Address.fromJson(data);
  }

  Future<Address> updateAddress({
    required String id,
    required String label,
    String? recipientName,
    required String line1,
    String? line2,
    String? landmark,
    required String city,
    String? state,
    String? pincode,
    String? phone,
    bool isDefault = false,
    double? lat,
    double? lng,
  }) async {
    final data = await api.put('/addresses/$id', body: {
      'label': label,
      'line1': line1,
      'city': city,
      if (recipientName != null && recipientName.isNotEmpty)
        'recipientName': recipientName,
      if (line2 != null && line2.isNotEmpty) 'line2': line2,
      if (landmark != null && landmark.isNotEmpty) 'landmark': landmark,
      if (state != null && state.isNotEmpty) 'state': state,
      if (pincode != null && pincode.isNotEmpty) 'pincode': pincode,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
      'isDefault': isDefault,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
    }) as Map<String, dynamic>;
    return Address.fromJson(data);
  }

  Future<void> deleteAddress(String id) => api.delete('/addresses/$id');

  /// Switches the active delivery address — re-centers home/nearby/Now on this address
  /// (see effectiveLocationProvider in providers.dart), not just a label change.
  Future<Address> setDefaultAddress(String id) async {
    final data =
        await api.patch('/addresses/$id/default') as Map<String, dynamic>;
    return Address.fromJson(data);
  }

  /// Preview a coupon's discount against the current subtotal without applying it —
  /// same `computeDiscount` the backend runs again (authoritatively) at order creation.
  Future<int> validateCoupon(String code, int itemsTotal) async {
    final data = await api.post('/coupons/validate', body: {
      'code': code,
      'itemsTotal': itemsTotal,
    }) as Map<String, dynamic>;
    return (data['discount'] as num).toInt();
  }

  /// Current loyalty points balance + what it's worth right now.
  Future<({int points, int valuePaise})> loyaltyBalance() async {
    final data = await api.get('/loyalty/balance') as Map<String, dynamic>;
    return (
      points: (data['points'] as num).toInt(),
      valuePaise: (data['valuePaise'] as num).toInt(),
    );
  }

  /// This user's referral code + how many invites have paid off.
  Future<({String code, int rewardPoints, int referredCount, int rewardedCount})>
      referralInfo() async {
    final data = await api.get('/referral/me') as Map<String, dynamic>;
    return (
      code: data['code'] as String,
      rewardPoints: (data['rewardPoints'] as num).toInt(),
      referredCount: (data['referredCount'] as num).toInt(),
      rewardedCount: (data['rewardedCount'] as num).toInt(),
    );
  }

  /// Preview how many of the requested points can actually be redeemed (capped at 50%
  /// of the subtotal server-side) before placing the order.
  Future<({int points, int discount})> previewRedeemPoints(
      int points, int itemsTotal) async {
    final data = await api.post('/loyalty/redeem-preview', body: {
      'points': points,
      'itemsTotal': itemsTotal,
    }) as Map<String, dynamic>;
    return (
      points: (data['points'] as num).toInt(),
      discount: (data['discount'] as num).toInt(),
    );
  }

  Future<OrderModel> placeOrder({
    required List<CartLine> lines,
    Address? address,
    Map<String, String>? storeInstructions,
    Map<String, VendorDeliverySlot>? deliverySlots,
    String? couponCode,
    int? redeemPoints,
  }) async {
    final items = lines
        .map((l) => {
              'productId': l.productId,
              'variantSku': l.variantSku,
              'qty': l.qty
            })
        .toList();
    final data = await api.post('/orders', body: {
      'items': items,
      if (couponCode != null && couponCode.isNotEmpty)
        'couponCode': couponCode,
      if (redeemPoints != null && redeemPoints > 0) 'redeemPoints': redeemPoints,
      if (storeInstructions != null && storeInstructions.isNotEmpty)
        'storeInstructions': storeInstructions,
      if (deliverySlots != null && deliverySlots.isNotEmpty)
        'deliverySlots': deliverySlots.map((k, v) => MapEntry(k, v.toJson())),
      if (address != null)
        'shippingAddress': {
          'line1': address.line1, 'city': address.city,
          if (address.line2 != null && address.line2!.isNotEmpty)
            'line2': address.line2,
          if (address.landmark != null && address.landmark!.isNotEmpty)
            'landmark': address.landmark,
          if (address.state != null && address.state!.isNotEmpty)
            'state': address.state,
          if (address.pincode != null) 'pincode': address.pincode,
          // Feeds DeliveryTask.dropAddress → the live rider→destination polyline.
          if (address.lat != null) 'lat': address.lat,
          if (address.lng != null) 'lng': address.lng,
        },
      if (address?.phone != null) 'contact': {'phone': address!.phone},
    }) as Map<String, dynamic>;
    return OrderModel.fromJson(data);
  }

  Future<List<OrderModel>> myOrders() async {
    final data = await api.get('/orders') as List;
    return data
        .map((e) => OrderModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<OrderModel> order(String id) async {
    final data = await api.get('/orders/$id') as Map<String, dynamic>;
    return OrderModel.fromJson(data);
  }

  Future<OrderModel> cancelOrder(String id) async {
    final data = await api.post('/orders/$id/cancel') as Map<String, dynamic>;
    return OrderModel.fromJson(data);
  }
}
