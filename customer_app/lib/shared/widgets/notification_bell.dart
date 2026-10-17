import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';

/// Bell icon with a live unread-count badge → opens /notifications.
class NotificationBell extends ConsumerWidget {
  /// Null → resolves to context.colors.ink at build time (can't be a const default
  /// param value since that needs a BuildContext, unavailable at that point).
  final Color? color;
  final bool filled;
  const NotificationBell({super.key, this.color, this.filled = false});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final color = this.color ?? context.colors.ink;
    final count = ref.watch(unreadCountProvider).asData?.value ?? 0;
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
          child: Icon(Icons.notifications_outlined, color: color, size: 23),
        ),
        onPressed: () => context.push('/notifications'),
      ),
    );
  }
}
