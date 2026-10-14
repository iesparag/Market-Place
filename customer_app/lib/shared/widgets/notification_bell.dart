import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';

/// Bell icon with a live unread-count badge → opens /notifications.
class NotificationBell extends ConsumerWidget {
  final Color color;
  final bool filled;
  const NotificationBell({super.key, this.color = BrandColors.ink, this.filled = false});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(unreadCountProvider).asData?.value ?? 0;
    return Container(
      width: filled ? 40 : null,
      height: filled ? 40 : null,
      decoration: filled
          ? BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE6EDF4)),
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
