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
    return data.map((e) => Address.fromJson(e as Map<String, dynamic>)).toList();
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
      'label': label, 'line1': line1, 'city': city,
      if (recipientName != null && recipientName.isNotEmpty) 'recipientName': recipientName,
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

  Future<OrderModel> placeOrder({
    required List<CartLine> lines,
    Address? address,
    Map<String, String>? storeInstructions,
  }) async {
    final items = lines.map((l) => {'productId': l.productId, 'variantSku': l.variantSku, 'qty': l.qty}).toList();
    final data = await api.post('/orders', body: {
      'items': items,
      if (storeInstructions != null && storeInstructions.isNotEmpty) 'storeInstructions': storeInstructions,
      if (address != null)
        'shippingAddress': {
          'line1': address.line1, 'city': address.city,
          if (address.line2 != null && address.line2!.isNotEmpty) 'line2': address.line2,
          if (address.landmark != null && address.landmark!.isNotEmpty) 'landmark': address.landmark,
          if (address.state != null && address.state!.isNotEmpty) 'state': address.state,
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
    return data.map((e) => OrderModel.fromJson(e as Map<String, dynamic>)).toList();
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
