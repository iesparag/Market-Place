import 'package:flutter/material.dart';
import '../../shared/widgets/error_view.dart';
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
import '../../shared/category_emoji.dart';

/// Bottom-nav "Now" tab — instant delivery in minutes from local stores.
/// Features high-energy Quick-Commerce UI/UX with delivery badges, quick category
/// shortcuts, and refined store cards that prevent image clipping.
class NowScreen extends ConsumerStatefulWidget {
  const NowScreen({super.key});

  @override
  ConsumerState<NowScreen> createState() => _NowScreenState();
}

class _NowScreenState extends ConsumerState<NowScreen> {
  String _selectedCategory = 'All';

  /// Real vendor categories present among stores open right now — not a guessed
  /// static list (previously included 'Tech'/'Pharmacy' even when no such vendors
  /// existed in this marketplace's seed data).
  List<String> _filtersFor(List<Vendor> vendors) {
    final types = <String>{};
    for (final v in vendors) {
      final t = v.vendorType.trim();
      if (t.isNotEmpty) types.add('${t[0].toUpperCase()}${t.substring(1)}');
    }
    final sorted = types.toList()..sort();
    return ['All', ...sorted];
  }

  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    final loc = ref.watch(effectiveLocationProvider);
    final async = ref.watch(nowStoresProvider);
    final filters = _filtersFor(async.valueOrNull ?? const []);

    return Scaffold(
      backgroundColor: b.canvas,
      appBar: AppBar(
        // Deliberately always-dark (Blinkit "Now"-tab style accent bar), not
        // theme-driven — intentional brand choice, not a missed dark-mode spot.
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        elevation: 0,
        titleSpacing: 14,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFF59E0B), Color(0xFFEA580C)],
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('⚡',
                      style:
                          TextStyle(color: context.colors.ink, fontSize: 14)),
                  SizedBox(width: 4),
                  Text('NOW',
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                          fontSize: 12,
                          letterSpacing: 0.5)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Instant Delivery',
                    style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 15,
                        color: Colors.white)),
                Text('Get orders in 15–30 mins',
                    style: TextStyle(
                        fontSize: 10.5,
                        color: Color(0xFF94A3B8),
                        fontWeight: FontWeight.w600)),
              ],
            ),
          ],
        ),
        actions: const [
          WishlistButton(color: Colors.white),
          CartButton(color: Colors.white),
          SizedBox(width: 6),
        ],
      ),
      body: Column(
        children: [
          // Header search bar with dark theme matching AppBar
          Container(
            width: double.infinity,
            color: const Color(0xFF0F172A),
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
            child:
                const SearchBarPill(hint: 'Search instant stores & products…'),
          ),

          // Quick perks ticker
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: const BoxDecoration(
              color: Color(0xFFFEF3C7),
              border: Border(bottom: BorderSide(color: Color(0xFFFDE68A))),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('⚡',
                    style: TextStyle(color: context.colors.ink, fontSize: 12)),
                SizedBox(width: 5),
                Text(
                  '15–30 Mins Delivery  •  🛵 Live Tracking  •  🛡️ Zero Extra Fee',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF92400E),
                  ),
                ),
              ],
            ),
          ),

          // Horizontal category filters
          Container(
            color: context.colors.surface,
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: filters.map((cat) {
                  final selected = _selectedCategory == cat;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(cat),
                      selected: selected,
                      onSelected: (_) =>
                          setState(() => _selectedCategory = cat),
                      labelStyle: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: selected ? Colors.white : context.colors.ink2,
                      ),
                      selectedColor: b.primary,
                      backgroundColor: context.colors.bg,
                      side: BorderSide(
                        color: selected ? b.primary : context.colors.border,
                      ),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),

          // Body content
          Expanded(
            child: loc.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const _NoLocation(),
              data: (pos) {
                if (pos == null) return const _NoLocation();
                return async.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, _) => ErrorView(error: e),
                  data: (vendors) {
                    final filtered = _selectedCategory == 'All'
                        ? vendors
                        : vendors
                            .where((v) => v.vendorType
                                .toLowerCase()
                                .contains(_selectedCategory.toLowerCase()))
                            .toList();

                    if (vendors.isEmpty) return const _NothingOpenNow();

                    return RefreshIndicator(
                      onRefresh: () async => ref.invalidate(nowStoresProvider),
                      child: ListView(
                        padding: const EdgeInsets.all(14),
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '${filtered.length} Store${filtered.length == 1 ? '' : 's'} Open Now',
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 15,
                                  color: context.colors.ink,
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: context.colors.success
                                      .withValues(alpha: 0.16),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.circle,
                                        size: 7, color: context.colors.success),
                                    const SizedBox(width: 4),
                                    Text('Live',
                                        style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w800,
                                            color: context.colors.success)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),

                          // Open store cards
                          for (final v in filtered) ...[
                            _NowTile(vendor: v),
                            const SizedBox(height: 12),
                          ],

                          if (filtered.isEmpty)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 30),
                              child: Center(
                                child: Text(
                                  'No $_selectedCategory stores open right now.',
                                  style: TextStyle(
                                      color: context.colors.textMuted,
                                      fontSize: 13),
                                ),
                              ),
                            ),

                          const SizedBox(height: 14),

                          // Instant categories shortcut section so page is never empty
                          const _NowCategoriesGrid(),

                          const SizedBox(height: 16),

                          // Trust perks
                          const _NowPerksCard(),
                          const SizedBox(height: 24),
                        ],
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

/// Refined modern Quick-Commerce store tile with delivery promise and clean layout
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
    final b = context.brand;
    return GestureDetector(
      onTap: () => context.push('/store/${vendor.slug}'),
      child: Container(
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.colors.border),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0C000000),
              blurRadius: 10,
              offset: Offset(0, 4),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  // Store logo container with BoxFit.contain so logos never clip
                  Container(
                    width: 70,
                    height: 70,
                    decoration: BoxDecoration(
                      color: context.colors.bg,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: context.colors.border),
                    ),
                    clipBehavior: Clip.antiAlias,
                    padding: const EdgeInsets.all(4),
                    child: vendor.logo != null
                        ? CachedNetworkImage(
                            placeholder: (_, __) =>
                                Container(color: context.colors.bg),
                            errorWidget: (_, __, ___) => Container(
                                color: context.colors.bg,
                                child: Icon(Icons.image_not_supported_outlined,
                                    color: context.colors.textMuted, size: 20)),
                            imageUrl: vendor.logo!,
                            fit: BoxFit.contain,
                          )
                        : Center(
                            child: Text(
                              vendor.name.isNotEmpty ? vendor.name[0] : '🏬',
                              style: TextStyle(
                                color: b.primary,
                                fontSize: 26,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                  ),
                  const SizedBox(width: 12),

                  // Store details
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(
                                color:
                                    context.colors.star.withValues(alpha: 0.18),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                    color: context.colors.star
                                        .withValues(alpha: 0.4)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text('⚡',
                                      style: TextStyle(fontSize: 10)),
                                  const SizedBox(width: 3),
                                  Text('15–25 MINS',
                                      style: TextStyle(
                                          fontSize: 9.5,
                                          fontWeight: FontWeight.w900,
                                          color: context.colors.star)),
                                ],
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: context.colors.success
                                    .withValues(alpha: 0.16),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text('OPEN',
                                  style: TextStyle(
                                      fontSize: 9.5,
                                      fontWeight: FontWeight.w900,
                                      color: context.colors.success)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 5),
                        Text(
                          vendor.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: context.colors.ink,
                            fontWeight: FontWeight.w900,
                            fontSize: 15.5,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          [
                            vendor.vendorType,
                            if (_distanceLabel.isNotEmpty) _distanceLabel,
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: context.colors.textMuted, fontSize: 12),
                        ),
                        if (vendor.ratingCount > 0) ...[
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              Icon(Icons.star_rounded,
                                  size: 14, color: context.colors.star),
                              Text(
                                ' ${vendor.ratingAvg.toStringAsFixed(1)} (${vendor.ratingCount})',
                                style: TextStyle(
                                    color: context.colors.ink2,
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),

                  // Action arrow
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: context.colors.bg,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.chevron_right_rounded, color: b.primary),
                  ),
                ],
              ),
            ),

            // Store bottom offer bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: context.colors.bg,
                border: Border(top: BorderSide(color: context.colors.border)),
              ),
              child: Row(
                children: [
                  Icon(Icons.local_shipping_outlined,
                      size: 14, color: context.colors.success),
                  const SizedBox(width: 6),
                  Text('Instant delivery available right now',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: context.colors.success)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Instant delivery category grid to explore categories
/// Real category tree (same source + emoji/color palette as home_screen.dart's
/// "Shop by Category") — this used to be a fixed guess-list that included "Pharma",
/// a vertical that doesn't exist in this marketplace's actual seeded departments.
class _NowCategoriesGrid extends ConsumerWidget {
  const _NowCategoriesGrid();

  static const _colors = [
    Color(0xFFFEF3C7),
    Color(0xFFFFEDD5),
    Color(0xFFD1FAE5),
    Color(0xFFFCE7F3),
    Color(0xFFE0F2FE),
    Color(0xFFEDE9FE),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tree = ref.watch(categoryTreeProvider);
    return tree.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (depts) {
        if (depts.isEmpty) return const SizedBox.shrink();
        final shown = depts.take(6).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '⚡ Popular Instant Categories',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w900,
                color: context.colors.ink,
              ),
            ),
            const SizedBox(height: 10),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.15,
              ),
              itemCount: shown.length,
              itemBuilder: (context, i) {
                final dept = shown[i];
                return GestureDetector(
                  onTap: () => context.push(
                      '/catalog?dept=${dept.slug}&title=${Uri.encodeComponent(dept.name)}'),
                  child: Container(
                    decoration: BoxDecoration(
                      color: context.colors.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: context.colors.border),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: _colors[i % _colors.length],
                            shape: BoxShape.circle,
                          ),
                          alignment: Alignment.center,
                          child: Text(categoryEmoji(dept.slug),
                              style: const TextStyle(fontSize: 20)),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          dept.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: context.colors.ink2,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ],
        );
      },
    );
  }
}

/// Instant delivery reassurance card
class _NowPerksCard extends StatelessWidget {
  const _NowPerksCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Text('⚡', style: TextStyle(color: context.colors.ink, fontSize: 28)),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Marketplace Now Promise',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 13.5,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Directly picked and delivered from verified stores in your area with live GPS tracking.',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NoLocation extends StatelessWidget {
  const _NoLocation();
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('📍',
                style: TextStyle(color: context.colors.ink, fontSize: 48)),
            SizedBox(height: 12),
            Text('Turn on location to see what\'s open now',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: context.colors.ink,
                    fontWeight: FontWeight.w800,
                    fontSize: 15)),
            SizedBox(height: 6),
            Text(
                '"Now" needs to know where you are to find instant-delivery stores nearby.',
                textAlign: TextAlign.center,
                style:
                    TextStyle(color: context.colors.textMuted, fontSize: 12.5)),
          ]),
        ),
      );
}

class _NothingOpenNow extends StatelessWidget {
  const _NothingOpenNow();
  @override
  Widget build(BuildContext context) => const OutOfServiceArea();
}
