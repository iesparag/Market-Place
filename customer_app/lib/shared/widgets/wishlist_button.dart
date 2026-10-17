import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../features/wishlist/wishlist_controller.dart';

/// Heart icon with a saved-count badge → opens /wishlist. Use next to the cart in app bars.
class WishlistButton extends ConsumerWidget {
  /// Null → resolves to context.colors.ink at build time (can't be a const default
  /// param value since that needs a BuildContext, unavailable at that point).
  final Color? color;
  final bool filled;
  const WishlistButton({super.key, this.color, this.filled = false});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final color = this.color ?? context.colors.ink;
    final count = ref.watch(wishlistProvider).length;
    return Container(
      width: filled ? 40 : null,
      height: filled ? 40 : null,
      decoration: filled
          ? BoxDecoration(
              color: context.colors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.colors.border),
            )
          : null,
      child: IconButton(
        visualDensity: VisualDensity.compact,
        padding: EdgeInsets.zero,
        icon: Badge(
          isLabelVisible: count > 0,
          label: Text('$count'),
          child: Icon(Icons.favorite_border_rounded, color: color, size: 23),
        ),
        onPressed: () => context.push('/wishlist'),
      ),
    );
  }
}
