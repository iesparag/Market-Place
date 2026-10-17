import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../models/store.dart';
import '../../features/favourites/store_favourite_controller.dart';

/// Store card with a built-in heart toggle — used on the home screen's "Your
/// Favourites" row and the full /favourite-stores grid. Mirrors the visual language of
/// home_screen.dart's private `_NearbyStoreCard` without depending on it (that widget
/// is file-private), kept deliberately simple since this card appears in two places.
class StoreFavouriteCard extends ConsumerWidget {
  final Vendor vendor;
  const StoreFavouriteCard({super.key, required this.vendor});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final b = context.brand;
    final isFav = ref.watch(favouriteStoresProvider).contains(vendor.id);
    return GestureDetector(
      onTap: () => context.push('/store/${vendor.slug}'),
      child: Container(
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.colors.border),
          boxShadow: const [
            BoxShadow(
                color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 3))
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 76,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(
                    color: context.colors.bg,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    child: vendor.logo != null
                        ? Center(
                            child: CachedNetworkImage(
                              placeholder: (_, __) =>
                                  Container(color: context.colors.bg),
                              errorWidget: (_, __, ___) => Container(
                                  color: context.colors.bg,
                                  child: Icon(
                                      Icons.image_not_supported_outlined,
                                      color: context.colors.textMuted,
                                      size: 20)),
                              imageUrl: vendor.logo!,
                              fit: BoxFit.contain,
                            ),
                          )
                        : Container(
                            decoration: BoxDecoration(gradient: b.gradient),
                            child: Center(
                              child: Text(
                                  vendor.name.isNotEmpty
                                      ? vendor.name[0]
                                      : '🏬',
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 24,
                                      fontWeight: FontWeight.w900)),
                            ),
                          ),
                  ),
                  Positioned(
                    top: 4,
                    right: 4,
                    child: GestureDetector(
                      onTap: () async {
                        final ok = await ref
                            .read(favouriteStoresProvider.notifier)
                            .toggle(vendor.id);
                        if (!ok && context.mounted) context.push('/login');
                      },
                      child: Container(
                        width: 28,
                        height: 28,
                        decoration: const BoxDecoration(
                            color: Colors.white, shape: BoxShape.circle),
                        child: Icon(
                            isFav
                                ? Icons.favorite
                                : Icons.favorite_border_rounded,
                            size: 16,
                            color: isFav
                                ? context.colors.danger
                                : context.colors.textMuted),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(vendor.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: context.colors.ink,
                          fontWeight: FontWeight.w800,
                          fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(vendor.vendorType,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: context.colors.textMuted, fontSize: 11.5)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
