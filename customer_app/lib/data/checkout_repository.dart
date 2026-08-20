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
    required String line1,
    required String city,
    String? pincode,
    String? phone,
    bool isDefault = false,
  }) async {
    final data = await api.post('/addresses', body: {
      'label': label, 'line1': line1, 'city': city,
      if (pincode != null && pincode.isNotEmpty) 'pincode': pincode,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
      'isDefault': isDefault,
    }) as Map<String, dynamic>;
    return Address.fromJson(data);
  }

  Future<void> deleteAddress(String id) => api.delete('/addresses/$id');

  Future<OrderModel> placeOrder({required List<CartLine> lines, Address? address}) async {
    final items = lines.map((l) => {'productId': l.productId, 'variantSku': l.variantSku, 'qty': l.qty}).toList();
    final data = await api.post('/orders', body: {
      'items': items,
      if (address != null)
        'shippingAddress': {'line1': address.line1, 'city': address.city, if (address.pincode != null) 'pincode': address.pincode},
      if (address?.phone != null) 'contact': {'phone': address!.phone},
    }) as Map<String, dynamic>;
    return OrderModel.fromJson(data);
  }

  Future<List<OrderModel>> myOrders() async {
    final data = await api.get('/orders') as List;
    return data.map((e) => OrderModel.fromJson(e as Map<String, dynamic>)).toList();
  }
}
