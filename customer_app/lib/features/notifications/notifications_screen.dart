import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/app_notification.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          list.maybeWhen(
            data: (items) => items.any((n) => !n.read)
                ? TextButton(
                    onPressed: () async {
                      await ref.read(notificationsRepoProvider).markAllRead();
                      ref.invalidate(notificationsProvider);
                      ref.invalidate(unreadCountProvider);
                    },
                    child: const Text('Mark all read'),
                  )
                : const SizedBox.shrink(),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: list.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
            child: Text('$e', style: const TextStyle(color: BrandColors.textMuted))),
        data: (items) {
          if (items.isEmpty) return const _Empty();
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(notificationsProvider);
              ref.invalidate(unreadCountProvider);
            },
            child: ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _NotificationTile(n: items[i]),
            ),
          );
        },
      ),
    );
  }
}

class _NotificationTile extends ConsumerWidget {
  final AppNotification n;
  const _NotificationTile({required this.n});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final b = context.brand;
    return Material(
      color: n.read ? Colors.white : b.soft,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          if (!n.read) {
            await ref.read(notificationsRepoProvider).markRead(n.id);
            ref.invalidate(notificationsProvider);
            ref.invalidate(unreadCountProvider);
          }
          if (n.link != null && n.link!.startsWith('/') && context.mounted) {
            context.push(n.link!);
          }
        },
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: BrandColors.border)),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38,
                height: 38,
                margin: const EdgeInsets.only(top: 2),
                decoration:
                    BoxDecoration(color: b.soft, shape: BoxShape.circle),
                alignment: Alignment.center,
                child: Icon(_iconFor(n.type), color: b.primaryDark, size: 19),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(n.title,
                        style: TextStyle(
                            fontWeight:
                                n.read ? FontWeight.w600 : FontWeight.w800,
                            fontSize: 14)),
                    if (n.body.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(n.body,
                          style: const TextStyle(
                              color: BrandColors.textMuted, fontSize: 12.5)),
                    ],
                    const SizedBox(height: 6),
                    Text(DateFormat('d MMM, h:mm a').format(n.createdAt),
                        style: const TextStyle(
                            color: BrandColors.textMuted, fontSize: 11)),
                  ],
                ),
              ),
              if (!n.read)
                Container(
                  width: 8,
                  height: 8,
                  margin: const EdgeInsets.only(top: 4),
                  decoration: BoxDecoration(color: b.primary, shape: BoxShape.circle),
                ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _iconFor(String type) => switch (type) {
        'order' => Icons.local_shipping_outlined,
        'payment' => Icons.payments_outlined,
        'promo' => Icons.local_offer_outlined,
        _ => Icons.notifications_outlined,
      };
}

class _Empty extends StatelessWidget {
  const _Empty();
  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 112,
            height: 112,
            decoration: BoxDecoration(color: b.soft, shape: BoxShape.circle),
            alignment: Alignment.center,
            child: const Icon(Icons.notifications_none_rounded,
                size: 48, color: BrandColors.textMuted),
          ),
          const SizedBox(height: 18),
          const Text('No notifications yet',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
          const SizedBox(height: 6),
          const Text("We'll let you know when something happens",
              style: TextStyle(color: BrandColors.textMuted, fontSize: 13)),
        ],
      ),
    );
  }
}
