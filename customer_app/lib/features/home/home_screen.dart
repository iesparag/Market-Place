import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/category.dart';
import '../../models/home.dart';
import '../../models/store.dart';
import '../../shared/widgets/product_card.dart';
import '../../shared/widgets/section_header.dart';
import '../../shared/widgets/shimmer.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final banners = ref.watch(bannersProvider);
    final tree = ref.watch(categoryTreeProvider);
    final sections = ref.watch(homeSectionsProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const _Header(),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(bannersProvider);
                  ref.invalidate(homeSectionsProvider);
                  ref.invalidate(categoryTreeProvider);
                },
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 24),
                  children: [
                    banners.maybeWhen(
                      data: (b) => b.isEmpty ? const SizedBox.shrink() : _BannerCarousel(banners: b),
                      orElse: () => const SizedBox.shrink(),
                    ),
                    // Shop by department
                    const SectionHeader(title: 'Shop by department'),
                    tree.when(
                      loading: () => const SizedBox(height: 96, child: Center(child: CircularProgressIndicator())),
                      error: (e, _) => _err(context, ref, e.toString()),
                      data: (nodes) => _DepartmentStrip(nodes: nodes),
                    ),
                    // Admin-composed sections
                    sections.when(
                      loading: () => const _RowSkeleton(),
                      error: (e, _) => _err(context, ref, e.toString()),
                      data: (list) => Column(children: list.map((s) => _Section(section: s)).toList()),
                    ),
                    const _SellCta(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _err(BuildContext context, WidgetRef ref, String msg) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          Text(msg, textAlign: TextAlign.center, style: const TextStyle(color: BrandColors.textMuted)),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: () { ref.invalidate(homeSectionsProvider); ref.invalidate(categoryTreeProvider); }, child: const Text('Retry')),
        ]),
      );
}

// ── Header (brand + location + search) ──────────────────────────────────────
class _Header extends StatelessWidget {
  const _Header();
  @override
  Widget build(BuildContext context) {
    return Container(
      color: BrandColors.ink,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 30, height: 30,
                decoration: BoxDecoration(gradient: BrandColors.brandGradient, borderRadius: BorderRadius.circular(8)),
                alignment: Alignment.center,
                child: const Text('M', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Deliver to', style: TextStyle(color: Colors.white70, fontSize: 11)),
                    Row(children: [
                      Text('Home · Mumbai', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
                      Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white, size: 18),
                    ]),
                  ],
                ),
              ),
              const Icon(Icons.notifications_none_rounded, color: Colors.white),
            ],
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => context.push('/search'),
            child: Container(
              height: 46,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: const Row(children: [
                Icon(Icons.search_rounded, color: BrandColors.textMuted),
                SizedBox(width: 10),
                Text('Search products, brands, stores…', style: TextStyle(color: BrandColors.textMuted, fontSize: 14)),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Banners ─────────────────────────────────────────────────────────────────
class _BannerCarousel extends StatelessWidget {
  final List<Banner> banners;
  const _BannerCarousel({required this.banners});
  Color _bg(String? hex) {
    if (hex == null) return BrandColors.brand600;
    final h = hex.replaceAll('#', '');
    return Color(int.parse('FF$h', radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 150,
      child: PageView.builder(
        controller: PageController(viewportFraction: 0.92),
        itemCount: banners.length,
        itemBuilder: (_, i) {
          final b = banners[i];
          return Container(
            margin: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: _bg(b.bg), borderRadius: BorderRadius.circular(16)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(b.title, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text(b.subtitle, style: const TextStyle(color: Colors.white70, fontSize: 13)),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ── Departments ─────────────────────────────────────────────────────────────
const _emoji = {
  'food-beverages': '🍔', 'food': '🍔', 'grocery-dept': '🛒', 'kirana-grocery': '🛒',
  'fashion': '👗', 'electronics': '📱', 'home-kitchen': '🍳', 'beauty': '💄',
  'pharmacy': '💊', 'watches': '⌚',
};

class _DepartmentStrip extends StatelessWidget {
  final List<CatNode> nodes;
  const _DepartmentStrip({required this.nodes});
  @override
  Widget build(BuildContext context) {
    if (nodes.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 104,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: nodes.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (_, i) {
          final d = nodes[i];
          return GestureDetector(
            onTap: () => context.push('/catalog?category=${Uri.encodeComponent(d.allSlugs.join(","))}&title=${Uri.encodeComponent(d.name)}'),
            child: SizedBox(
              width: 72,
              child: Column(
                children: [
                  Container(
                    width: 64, height: 64,
                    decoration: BoxDecoration(color: const Color(0xFFFFF1E9), borderRadius: BorderRadius.circular(18)),
                    alignment: Alignment.center,
                    child: Text(_emoji[d.slug] ?? '🛍️', style: const TextStyle(fontSize: 28)),
                  ),
                  const SizedBox(height: 6),
                  Text(d.name, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ── A landing section (products row OR vendors row) ─────────────────────────
class _Section extends StatelessWidget {
  final HomeSection section;
  const _Section({required this.section});
  @override
  Widget build(BuildContext context) {
    if (section.type == 'vendors') {
      if (section.vendors.isEmpty) return const SizedBox.shrink();
      return Column(children: [
        SectionHeader(title: section.title, subtitle: section.subtitle, actionLabel: 'All shops', onAction: () => context.push('/catalog')),
        SizedBox(
          height: 92,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: section.vendors.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => _VendorCard(vendor: section.vendors[i]),
          ),
        ),
      ]);
    }
    if (section.products.isEmpty) return const SizedBox.shrink();
    final params = <String>[];
    if (section.category != null && section.category!.isNotEmpty) params.add('category=${Uri.encodeComponent(section.category!)}');
    if (section.sort != null && section.sort!.isNotEmpty) params.add('sort=${section.sort}');
    final viewAll = '/catalog${params.isEmpty ? '' : '?${params.join('&')}'}';
    return Column(children: [
      SectionHeader(title: section.title, subtitle: section.subtitle, actionLabel: 'View all', onAction: () => context.push(viewAll)),
      SizedBox(
        height: 296,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: section.products.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (_, i) => SizedBox(width: 165, child: ProductCard(product: section.products[i])),
        ),
      ),
    ]);
  }
}

class _VendorCard extends StatelessWidget {
  final Vendor vendor;
  const _VendorCard({required this.vendor});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/store/${vendor.slug}'),
      child: Container(
        width: 240,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: BrandColors.border)),
        child: Row(children: [
          Container(
            width: 48, height: 48,
            decoration: const BoxDecoration(gradient: BrandColors.brandGradient, shape: BoxShape.circle),
            clipBehavior: Clip.antiAlias,
            alignment: Alignment.center,
            child: vendor.logo != null
                ? CachedNetworkImage(imageUrl: vendor.logo!, fit: BoxFit.cover, width: 48, height: 48)
                : Text(vendor.name.isNotEmpty ? vendor.name[0] : '?', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(vendor.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('${vendor.productCount} products · ${vendor.vendorType}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: BrandColors.textMuted, fontSize: 12)),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}

class _RowSkeleton extends StatelessWidget {
  const _RowSkeleton();
  @override
  Widget build(BuildContext context) {
    return Column(children: [
      const SectionHeader(title: 'Loading…'),
      SizedBox(
        height: 296,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: 4,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (_, __) => const SizedBox(width: 165, child: ProductCardSkeleton()),
        ),
      ),
    ]);
  }
}

class _SellCta extends StatelessWidget {
  const _SellCta();
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 26, 16, 8),
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(color: BrandColors.ink, borderRadius: BorderRadius.circular(16)),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Sell on Marketplace', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
          SizedBox(height: 6),
          Text('Reach thousands of customers. List your products, manage orders, get paid.',
              style: TextStyle(color: Colors.white70, fontSize: 13)),
        ],
      ),
    );
  }
}
