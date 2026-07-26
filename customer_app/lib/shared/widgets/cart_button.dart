import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/cart/cart_controller.dart';

/// Cart icon with a live item-count badge → opens /cart. Use in app bars / headers.
class CartButton extends ConsumerWidget {
  final Color color;
  const CartButton({super.key, this.color = Colors.white});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(cartProvider).fold<int>(0, (n, l) => n + l.qty);
    return IconButton(
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text('$count'),
        child: Icon(Icons.shopping_cart_outlined, color: color),
      ),
      onPressed: () => context.push('/cart'),
    );
  }
}
