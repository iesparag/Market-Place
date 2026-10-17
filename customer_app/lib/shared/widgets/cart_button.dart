import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../features/cart/cart_controller.dart';

/// Cart icon with a live item-count badge → opens /cart. Use in app bars / headers.
class CartButton extends ConsumerWidget {
  /// Null → resolves to context.colors.ink at build time (can't be a const default
  /// param value since that needs a BuildContext, unavailable at that point).
  final Color? color;
  final bool filled;
  const CartButton({super.key, this.color, this.filled = false});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final color = this.color ?? context.colors.ink;
    final count = ref.watch(cartProvider).fold<int>(0, (n, l) => n + l.qty);
    return Container(
      width: filled ? 40 : null,
      height: filled ? 40 : null,
      decoration: filled
          ? BoxDecoration(
              color: context.brand.primary,
              borderRadius: BorderRadius.circular(14),
              boxShadow: const [
                BoxShadow(
                    color: Color(0x22000000),
                    blurRadius: 10,
                    offset: Offset(0, 4))
              ],
            )
          : null,
      child: IconButton(
        visualDensity: VisualDensity.compact,
        padding: EdgeInsets.zero,
        icon: Badge(
          isLabelVisible: count > 0,
          label: Text('$count'),
          child: Icon(Icons.shopping_bag_outlined, color: color, size: 23),
        ),
        onPressed: () => context.push('/cart'),
      ),
    );
  }
}
