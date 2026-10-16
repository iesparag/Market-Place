import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/store.dart';
import '../../shared/widgets/cart_button.dart';
import '../../shared/widgets/wishlist_button.dart';
import '../../shared/widgets/search_bar_pill.dart';
import '../home/home_screen.dart' show OutOfServiceArea;

/// Bottom-nav "Now" tab — vendors open right this minute within instant-delivery range
/// (backend: catalog.service.ts#listNowStores, env.NOW_RADIUS_KM). Deliberately a
/// distinct tile design from every other store list in the app (StoresListScreen,
/// StoreFavouriteCard, home's vendor rows) — "Now" is a different promise ("get it in
/// minutes", not "browse and maybe order later"), so it should not look like just
/// another store row.
class NowScreen extends ConsumerWidget {
  const NowScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = ref.watch(deviceLocationProvider);
    final async = ref.watch(nowStoresProvider);
    return Scaffold(
      backgroundColor: const Color(0xFFFFFBF2),
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        titleSpacing: 12,
        title: const Row(children: [
          Text('⚡', style: TextStyle(fontSize: 20)),
          SizedBox(width: 6),
          Text('Now', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 19)),
        ]),
        actions: const [
          WishlistButton(color: Colors.white),
          CartButton(color: Colors.white),
          SizedBox(width: 4),
        ],
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            color: Colors.black,
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            child: const SearchBarPill(hint: 'Search for instant delivery…'),
          ),
          Expanded(
            child: loc.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const _NoLocation(),
              data: (pos) {
                if (pos == null) return const _NoLocation();
                return async.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: BrandColors.textMuted))),
                  data: (vendors) {
                    if (vendors.isEmpty) return const _NothingOpenNow();
                    return RefreshIndicator(
                      onRefresh: () async => ref.invalidate(nowStoresProvider),
                      child: ListView.separated(
                        padding: const EdgeInsets.all(14),
                        itemCount: vendors.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (_, i) => _NowTile(vendor: vendors[i]),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _NowTile extends StatelessWidget {
  final Vendor vendor;
  const _NowTile({required this.vendor});

  String get _distanceLabel {
    final m = vendor.distanceMeters;
    if (m == null) return '';
    if (m < 1000) return '${m.round()} m away';
    return '${(m / 1000).toStringAsFixed(1)} km away';
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/store/${vendor.slug}'),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(18),
          boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 10, offset: Offset(0, 4))],
        ),
        clipBehavior: Clip.antiAlias,
        child: Row(
          children: [
            // Accent stripe — the "alag tile" signal at a glance, same idea across every card.
            Container(width: 6, color: const Color(0xFFFFB020)),
            Container(
              width: 68,
              height: 68,
              margin: const EdgeInsets.all(10),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), color: const Color(0xFF1F1F1F)),
              clipBehavior: Clip.antiAlias,
              child: vendor.logo != null
                  ? CachedNetworkImage(imageUrl: vendor.logo!, fit: BoxFit.cover)
                  : Center(
                      child: Text(vendor.name.isNotEmpty ? vendor.name[0] : '🏬',
                          style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(color: const Color(0xFFFFB020), borderRadius: BorderRadius.circular(5)),
                      child: const Text('OPEN NOW', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w900, color: Colors.black)),
                    ),
                    const SizedBox(height: 5),
                    Text(vendor.name,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15.5)),
                    const SizedBox(height: 2),
                    Text(
                        [vendor.vendorType, if (_distanceLabel.isNotEmpty) _distanceLabel, if (vendor.deliveryTime != null) vendor.deliveryTime]
                            .whereType<String>()
                            .join(' · '),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white60, fontSize: 12)),
                    if (vendor.ratingCount > 0) ...[
                      const SizedBox(height: 4),
                      Row(children: [
                        const Icon(Icons.star_rounded, size: 14, color: BrandColors.star),
                        Text(' ${vendor.ratingAvg.toStringAsFixed(1)} (${vendor.ratingCount})',
                            style: const TextStyle(color: Colors.white70, fontSize: 11.5)),
                      ]),
                    ],
                  ],
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.only(right: 14),
              child: Icon(Icons.chevron_right_rounded, color: Colors.white54),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoLocation extends StatelessWidget {
  const _NoLocation();
  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('📍', style: TextStyle(fontSize: 48)),
            SizedBox(height: 12),
            Text('Turn on location to see what\'s open now',
                textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            SizedBox(height: 6),
            Text('"Now" needs to know where you are to find instant-delivery stores nearby.',
                textAlign: TextAlign.center, style: TextStyle(color: BrandColors.textMuted, fontSize: 12.5)),
          ]),
        ),
      );
}

class _NothingOpenNow extends StatelessWidget {
  const _NothingOpenNow();
  @override
  Widget build(BuildContext context) => const OutOfServiceArea();
}
