import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/app_notification.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/safe_pop_scope.dart';
import '../shell/app_shell.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(notificationsProvider);
    return SafePopScope(
      child: Scaffold(
        appBar: AppBar(
          leading: const AppBackButton(),
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
          error: (e, _) => ErrorView(error: e),
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
        bottomNavigationBar: const AppBottomNav(),
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
      color: n.read ? context.colors.surface : b.soft.withValues(alpha: 0.65),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          if (!n.read) {
            await ref.read(notificationsRepoProvider).markRead(n.id);
            ref.invalidate(notificationsProvider);
            ref.invalidate(unreadCountProvider);
          }
          if (n.link != null && n.link!.trim().isNotEmpty && context.mounted) {
            var link = n.link!.trim();
            if (!link.startsWith('/')) link = '/$link';
            if (link == '/account/orders') {
              link = '/orders';
            } else if (link.startsWith('/account/orders/')) {
              link = '/order/${link.substring('/account/orders/'.length)}';
            } else if (link.startsWith('/orders/')) {
              link = '/order/${link.substring('/orders/'.length)}';
            } else if (link.startsWith('/product/')) {
              link = '/p/${link.substring('/product/'.length)}';
            }
            context.push(link);
          }
        },
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                  color: n.read
                      ? context.colors.border
                      : b.primary.withValues(alpha: 0.35),
                  width: n.read ? 1 : 1.4)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (n.image != null && n.layout != 'big_picture')
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: CachedNetworkImage(
                        imageUrl: n.image!,
                        width: 48,
                        height: 48,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) =>
                            _TypeIcon(type: n.type, brand: b),
                      ),
                    )
                  else
                    _TypeIcon(type: n.type, brand: b),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(n.title,
                            style: TextStyle(
                                color: context.colors.ink,
                                fontWeight:
                                    n.read ? FontWeight.w600 : FontWeight.w800,
                                fontSize: 14)),
                        if (n.body.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Text(n.body,
                              style: TextStyle(
                                  color: context.colors.textMuted,
                                  fontSize: 12.5)),
                        ],
                        const SizedBox(height: 6),
                        Text(DateFormat('d MMM, h:mm a').format(n.createdAt),
                            style: TextStyle(
                                color: context.colors.textMuted, fontSize: 11)),
                      ],
                    ),
                  ),
                  if (!n.read)
                    Container(
                      width: 8,
                      height: 8,
                      margin: const EdgeInsets.only(top: 4),
                      decoration: BoxDecoration(
                          color: b.primary, shape: BoxShape.circle),
                    ),
                ],
              ),

              // Multi-product Showcase Grid/Carousel (Flipkart Style)
              if (n.products.isNotEmpty) ...[
                const SizedBox(height: 12),
                SizedBox(
                  height: 145,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: n.products.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 10),
                    itemBuilder: (_, i) {
                      final p = n.products[i];
                      return GestureDetector(
                        onTap: () => context.push('/p/${p.slug}'),
                        child: Container(
                          width: 105,
                          decoration: BoxDecoration(
                            color: context.colors.bg,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: context.colors.border),
                          ),
                          padding: const EdgeInsets.all(6),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: p.image != null
                                      ? CachedNetworkImage(
                                          placeholder: (_, __) => Container(
                                              color: context.colors.surface),
                                          errorWidget: (_, __, ___) => Container(
                                              color: context.colors.surface,
                                              child: Icon(
                                                  Icons
                                                      .image_not_supported_outlined,
                                                  color:
                                                      context.colors.textMuted,
                                                  size: 20)),
                                          imageUrl: p.image!,
                                          fit: BoxFit.cover,
                                          width: double.infinity,
                                        )
                                      : Container(
                                          color: context.colors.surface),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(p.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: context.colors.ink)),
                              const SizedBox(height: 2),
                              Row(
                                children: [
                                  Text(rupees(p.price),
                                      style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w900,
                                          color: context.colors.ink)),
                                  if (p.originalPrice != null &&
                                      p.originalPrice! > p.price) ...[
                                    const SizedBox(width: 4),
                                    Text(rupees(p.originalPrice!),
                                        style: TextStyle(
                                            fontSize: 9.5,
                                            decoration:
                                                TextDecoration.lineThrough,
                                            color: context.colors.textMuted)),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],

              // Store Spotlight Chip
              if (n.layout == 'store_spotlight' && n.storeSlug != null) ...[
                const SizedBox(height: 10),
                GestureDetector(
                  onTap: () => context.push('/store/${n.storeSlug}'),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: b.soft,
                      borderRadius: BorderRadius.circular(8),
                      border:
                          Border.all(color: b.primary.withValues(alpha: 0.2)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.storefront_rounded,
                            size: 16, color: b.primaryDark),
                        const SizedBox(width: 6),
                        Text(n.storeName ?? 'Visit Store',
                            style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 12,
                                color: b.primaryDark)),
                        const SizedBox(width: 4),
                        Icon(Icons.arrow_forward_ios_rounded,
                            size: 10, color: b.primaryDark),
                      ],
                    ),
                  ),
                ),
              ],

              // Big Picture Banner
              if (n.layout == 'big_picture' && n.image != null) ...[
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: CachedNetworkImage(
                    placeholder: (_, __) => Container(color: context.colors.bg),
                    errorWidget: (_, __, ___) => Container(
                        color: context.colors.bg,
                        child: Icon(Icons.image_not_supported_outlined,
                            color: context.colors.textMuted, size: 20)),
                    imageUrl: n.image!,
                    height: 120,
                    width: double.infinity,
                    fit: BoxFit.cover,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeIcon extends StatelessWidget {
  final String type;
  final BrandTokens brand;
  const _TypeIcon({required this.type, required this.brand});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      margin: const EdgeInsets.only(top: 2),
      decoration: BoxDecoration(
        color: brand.soft,
        shape: BoxShape.circle,
        border: Border.all(color: brand.primary.withValues(alpha: 0.25)),
      ),
      alignment: Alignment.center,
      child: Icon(_iconFor(type), color: brand.primary, size: 20),
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
            child: Icon(Icons.notifications_none_rounded,
                size: 48, color: context.colors.textMuted),
          ),
          const SizedBox(height: 18),
          Text('No notifications yet',
              style: TextStyle(
                  color: context.colors.ink,
                  fontWeight: FontWeight.w800,
                  fontSize: 17)),
          const SizedBox(height: 6),
          Text("We'll let you know when something happens",
              style: TextStyle(color: context.colors.textMuted, fontSize: 13)),
        ],
      ),
    );
  }
}
