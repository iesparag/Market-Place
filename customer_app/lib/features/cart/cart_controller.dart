import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CartLine {
  final String productId;
  final String variantSku;
  final String title;
  final String? image;
  final String storeId;
  final String? storeName;
  final int price; // paise (unit)
  final int qty;

  CartLine({
    required this.productId,
    required this.variantSku,
    required this.title,
    this.image,
    required this.storeId,
    this.storeName,
    required this.price,
    required this.qty,
  });

  String get key => '$productId|$variantSku';
  int get lineTotal => price * qty;

  CartLine copyWith({int? qty}) => CartLine(
        productId: productId, variantSku: variantSku, title: title, image: image,
        storeId: storeId, storeName: storeName, price: price, qty: qty ?? this.qty,
      );

  Map<String, dynamic> toJson() => {
        'productId': productId, 'variantSku': variantSku, 'title': title, 'image': image,
        'storeId': storeId, 'storeName': storeName, 'price': price, 'qty': qty,
      };
  factory CartLine.fromJson(Map<String, dynamic> j) => CartLine(
        productId: j['productId'].toString(),
        variantSku: j['variantSku'].toString(),
        title: j['title'].toString(),
        image: j['image']?.toString(),
        storeId: j['storeId'].toString(),
        storeName: j['storeName']?.toString(),
        price: (j['price'] as num).toInt(),
        qty: (j['qty'] as num).toInt(),
      );
}

class CartController extends StateNotifier<List<CartLine>> {
  CartController() : super([]) {
    _load();
  }
  static const _key = 'cart_v1';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return;
    final list = (jsonDecode(raw) as List).map((e) => CartLine.fromJson(e as Map<String, dynamic>)).toList();
    state = list;
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(state.map((e) => e.toJson()).toList()));
  }

  void add(CartLine line) {
    final i = state.indexWhere((l) => l.key == line.key);
    if (i >= 0) {
      final updated = [...state];
      updated[i] = updated[i].copyWith(qty: updated[i].qty + line.qty);
      state = updated;
    } else {
      state = [...state, line];
    }
    _save();
  }

  void setQty(String key, int qty) {
    if (qty <= 0) {
      state = state.where((l) => l.key != key).toList();
    } else {
      state = state.map((l) => l.key == key ? l.copyWith(qty: qty) : l).toList();
    }
    _save();
  }

  int qtyOf(String productId, String sku) {
    final i = state.indexWhere((l) => l.key == '$productId|$sku');
    return i >= 0 ? state[i].qty : 0;
  }

  void clear() {
    state = [];
    _save();
  }

  int get count => state.fold(0, (n, l) => n + l.qty);
  int get subtotal => state.fold(0, (n, l) => n + l.lineTotal);
}

final cartProvider = StateNotifierProvider<CartController, List<CartLine>>((ref) => CartController());
