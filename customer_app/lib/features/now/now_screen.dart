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

  static const _filters = ['All', 'Grocery', 'Fashion', 'Food', 'Tech', 'Pharmacy'];

  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    final loc = ref.watch(effectiveLocationProvider);
    final async = ref.watch(nowStoresProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
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
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('⚡', style: TextStyle(fontSize: 14)),
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
            child: const SearchBarPill(hint: 'Search instant stores & products…'),
          ),

          // Quick perks ticker
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: const BoxDecoration(
              color: Color(0xFFFEF3C7),
              border: Border(bottom: BorderSide(color: Color(0xFFFDE68A))),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('⚡', style: TextStyle(fontSize: 12)),
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
            color: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: _filters.map((cat) {
                  final selected = _selectedCategory == cat;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(cat),
                      selected: selected,
                      onSelected: (_) => setState(() => _selectedCategory = cat),
                      labelStyle: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: selected ? Colors.white : const Color(0xFF475569),
                      ),
                      selectedColor: b.primary,
                      backgroundColor: const Color(0xFFF1F5F9),
                      side: BorderSide(
                        color: selected ? b.primary : const Color(0xFFE2E8F0),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => ErrorView(error: e),
                  data: (vendors) {
                    final filtered = _selectedCategory == 'All'
                        ? vendors
                        : vendors
                            .where((v) =>
                                v.vendorType.toLowerCase().contains(_selectedCategory.toLowerCase()))
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
                                style: const TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 15,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFDCFCE7),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.circle, size: 7, color: Color(0xFF16A34A)),
                                    SizedBox(width: 4),
                                    Text('Live',
                                        style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w800,
                                            color: Color(0xFF16A34A))),
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
                                  style: const TextStyle(
                                      color: BrandColors.textMuted, fontSize: 13),
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
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
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
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    clipBehavior: Clip.antiAlias,
                    padding: const EdgeInsets.all(4),
                    child: vendor.logo != null
                        ? CachedNetworkImage(
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
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEF3C7),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: const Color(0xFFFDE68A)),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text('⚡', style: TextStyle(fontSize: 10)),
                                  SizedBox(width: 3),
                                  Text('15–25 MINS',
                                      style: TextStyle(
                                          fontSize: 9.5,
                                          fontWeight: FontWeight.w900,
                                          color: Color(0xFF92400E))),
                                ],
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: const Color(0xFFDCFCE7),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text('OPEN',
                                  style: TextStyle(
                                      fontSize: 9.5,
                                      fontWeight: FontWeight.w900,
                                      color: Color(0xFF16A34A))),
                            ),
                          ],
                        ),
                        const SizedBox(height: 5),
                        Text(
                          vendor.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFF0F172A),
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
                          style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                        ),
                        if (vendor.ratingCount > 0) ...[
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              const Icon(Icons.star_rounded, size: 14, color: BrandColors.star),
                              Text(
                                ' ${vendor.ratingAvg.toStringAsFixed(1)} (${vendor.ratingCount})',
                                style: const TextStyle(
                                    color: Color(0xFF334155),
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
                    decoration: const BoxDecoration(
                      color: Color(0xFFF1F5F9),
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
              decoration: const BoxDecoration(
                color: Color(0xFFF8FAFC),
                border: Border(top: BorderSide(color: Color(0xFFF1F5F9))),
              ),
              child: const Row(
                children: [
                  Icon(Icons.local_shipping_outlined, size: 14, color: Color(0xFF16A34A)),
                  SizedBox(width: 6),
                  Text('Instant delivery available right now',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF16A34A))),
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
class _NowCategoriesGrid extends StatelessWidget {
  const _NowCategoriesGrid();

  static const _cats = [
    {'name': 'Grocery', 'icon': '🛒', 'color': Color(0xFFFEF3C7)},
    {'name': 'Snacks', 'icon': '🍿', 'color': Color(0xFFFFEDD5)},
    {'name': 'Fresh Sabji', 'icon': '🥦', 'color': Color(0xFFD1FAE5)},
    {'name': 'Fashion', 'icon': '👗', 'color': Color(0xFFFCE7F3)},
    {'name': 'Tech', 'icon': '📱', 'color': Color(0xFFE0F2FE)},
    {'name': 'Pharma', 'icon': '💊', 'color': Color(0xFFEDE9FE)},
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '⚡ Popular Instant Categories',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w900,
            color: Color(0xFF0F172A),
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
          itemCount: _cats.length,
          itemBuilder: (context, i) {
            final c = _cats[i];
            return GestureDetector(
              onTap: () => context.push('/categories'),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: c['color'] as Color,
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: Text(c['icon'] as String, style: const TextStyle(fontSize: 20)),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      c['name'] as String,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF334155),
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
      child: const Row(
        children: [
          Text('⚡', style: TextStyle(fontSize: 28)),
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
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('📍', style: TextStyle(fontSize: 48)),
            SizedBox(height: 12),
            Text('Turn on location to see what\'s open now',
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            SizedBox(height: 6),
            Text('"Now" needs to know where you are to find instant-delivery stores nearby.',
                textAlign: TextAlign.center,
                style: TextStyle(color: BrandColors.textMuted, fontSize: 12.5)),
          ]),
        ),
      );
}

class _NothingOpenNow extends StatelessWidget {
  const _NothingOpenNow();
  @override
  Widget build(BuildContext context) => const OutOfServiceArea();
}
