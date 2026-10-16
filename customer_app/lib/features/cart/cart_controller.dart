import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../data/providers.dart';

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
  final Ref ref;
  CartController(this.ref) : super([]) {
    _load();
  }
  static const _key = 'cart_v1';
  Timer? _syncDebounce;

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
    _scheduleSync();
  }

  /// Mirrors the cart to the backend (debounced) so the abandoned-cart reminder
  /// sweeper has something to read — the cart's state of record stays this local
  /// store; the server copy is best-effort and silently dropped if it fails or the
  /// user is signed out (sync requires auth, unlike the rest of the cart feature).
  void _scheduleSync() {
    _syncDebounce?.cancel();
    _syncDebounce = Timer(const Duration(seconds: 2), () async {
      try {
        await ref.read(apiClientProvider).put('/cart/sync', body: {
          'items': state.map((e) => e.toJson()).toList(),
        });
      } catch (_) {/* best-effort — local cart already saved either way */}
    });
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
    ref.read(cartInstructionsProvider.notifier).clear();
  }

  int get count => state.fold(0, (n, l) => n + l.qty);
  int get subtotal => state.fold(0, (n, l) => n + l.lineTotal);

  @override
  void dispose() {
    _syncDebounce?.cancel();
    super.dispose();
  }
}

final cartProvider = StateNotifierProvider<CartController, List<CartLine>>((ref) => CartController(ref));

/// Per-vendor "Instructions for <store>" notes from the cart screen — keyed by storeId
/// since a multi-vendor cart needs one note per store, not one note smeared across all
/// of them. Persisted locally like the cart itself; sent to the backend as
/// `storeInstructions` on placeOrder() (checkout_repository.dart) and copied onto each
/// vendor's own DeliveryTask server-side (delivery-tasks.service.ts), so only the
/// relevant vendor ever sees their own note.
class CartInstructionsController extends StateNotifier<Map<String, String>> {
  CartInstructionsController() : super({}) {
    _load();
  }
  static const _key = 'cart_instructions_v1';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return;
    state = (jsonDecode(raw) as Map).map((k, v) => MapEntry(k.toString(), v.toString()));
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(state));
  }

  void set(String storeId, String text) {
    final next = {...state};
    if (text.trim().isEmpty) {
      next.remove(storeId);
    } else {
      next[storeId] = text;
    }
    state = next;
    _save();
  }

  void clear() {
    state = {};
    _save();
  }
}

final cartInstructionsProvider =
    StateNotifierProvider<CartInstructionsController, Map<String, String>>((ref) => CartInstructionsController());
