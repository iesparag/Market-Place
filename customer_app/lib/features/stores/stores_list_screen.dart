import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/store.dart';
import '../../shared/widgets/cart_button.dart';
import '../../shared/widgets/wishlist_button.dart';
import '../../shared/widgets/search_bar_pill.dart';

/// The "Stores" tab — every approved vendor, tap to open the storefront.
class StoresListScreen extends ConsumerWidget {
  const StoresListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vendorsProvider);
    return Scaffold(
      appBar: AppBar(
          titleSpacing: 12,
          title: const SearchBarPill(hint: 'Search stores & products…'),
          actions: const [WishlistButton(), CartButton()]),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
            child: Text('$e',
                style: const TextStyle(color: BrandColors.textMuted))),
        data: (vendors) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(vendorsProvider),
          child: ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: vendors.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _StoreRow(vendor: vendors[i]),
          ),
        ),
      ),
    );
  }
}

class _StoreRow extends StatelessWidget {
  final Vendor vendor;
  const _StoreRow({required this.vendor});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/store/${vendor.slug}'),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: BrandColors.border)),
        child: Row(children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
                gradient: context.brand.gradient, shape: BoxShape.circle),
            clipBehavior: Clip.antiAlias,
            alignment: Alignment.center,
            child: vendor.logo != null
                ? CachedNetworkImage(
                    imageUrl: vendor.logo!,
                    fit: BoxFit.cover,
                    width: 56,
                    height: 56)
                : Text(vendor.name.isNotEmpty ? vendor.name[0] : '?',
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 22)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(vendor.name,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 2),
                Text('${vendor.productCount} products · ${vendor.vendorType}',
                    style: const TextStyle(
                        color: BrandColors.textMuted, fontSize: 13)),
                if (vendor.ratingCount > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(children: [
                      const Icon(Icons.star_rounded,
                          size: 15, color: BrandColors.star),
                      Text(
                          ' ${vendor.ratingAvg.toStringAsFixed(1)} (${vendor.ratingCount})',
                          style: const TextStyle(fontSize: 12)),
                    ]),
                  ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: BrandColors.textMuted),
        ]),
      ),
    );
  }
}
