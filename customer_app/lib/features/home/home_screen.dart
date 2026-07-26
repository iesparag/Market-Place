import 'dart:async';
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
import '../../shared/widgets/cart_button.dart';

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
                    SectionHeader(title: 'Shop by department', actionLabel: 'See all', onAction: () => context.push('/categories')),
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
              const CartButton(),
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
class _BannerCarousel extends StatefulWidget {
  final List<PromoBanner> banners;
  const _BannerCarousel({required this.banners});
  @override
  State<_BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends State<_BannerCarousel> {
  final _ctrl = PageController();
  int _page = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.banners.length > 1) {
      _timer = Timer.periodic(const Duration(seconds: 4), (_) {
        if (!_ctrl.hasClients) return;
        final next = (_page + 1) % widget.banners.length;
        _ctrl.animateToPage(next, duration: const Duration(milliseconds: 450), curve: Curves.easeInOut);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  Color _bg(String? hex) {
    if (hex == null || hex.isEmpty) return BrandColors.brand600;
    final h = hex.replaceAll('#', '');
    return Color(int.parse('FF$h', radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    final banners = widget.banners;
    return Column(
      children: [
        SizedBox(
          height: 172,
          child: PageView.builder(
            controller: _ctrl,
            onPageChanged: (i) => setState(() => _page = i),
            itemCount: banners.length,
            itemBuilder: (_, i) {
              final b = banners[i];
              final base = _bg(b.bg);
              return GestureDetector(
                onTap: () { if (b.link != null && b.link!.startsWith('/')) context.push(b.link!); },
                child: Container(
                  padding: const EdgeInsets.fromLTRB(24, 22, 24, 22),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft, end: Alignment.bottomRight,
                      colors: [base, Color.lerp(base, Colors.black, 0.22)!],
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(b.title, maxLines: 2, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w900, height: 1.1)),
                      const SizedBox(height: 6),
                      Text(b.subtitle, maxLines: 2, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 13)),
                      if (b.ctaText != null && b.ctaText!.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                          child: Text(b.ctaText!, style: TextStyle(color: base, fontWeight: FontWeight.w800, fontSize: 12.5)),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        if (banners.length > 1) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(banners.length, (i) => AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == _page ? 20 : 6,
              height: 6,
              decoration: BoxDecoration(color: i == _page ? BrandColors.brand600 : BrandColors.border, borderRadius: BorderRadius.circular(3)),
            )),
          ),
        ],
      ],
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
      height: 90,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: nodes.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final d = nodes[i];
          return GestureDetector(
            onTap: () => context.push('/department/${d.slug}'),
            child: SizedBox(
              width: 62,
              child: Column(
                children: [
                  Container(
                    width: 56, height: 56,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF2F3F5),
                      shape: BoxShape.circle,
                      border: Border.all(color: const Color(0xFFE6E7EC)),
                    ),
                    alignment: Alignment.center,
                    child: Text(_emoji[d.slug] ?? '🛍️', style: const TextStyle(fontSize: 26)),
                  ),
                  const SizedBox(height: 5),
                  Text(d.name, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
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
        height: 272,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: section.products.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (_, i) => SizedBox(width: 156, child: ProductCard(product: section.products[i])),
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
        height: 272,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: 4,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (_, __) => const SizedBox(width: 156, child: ProductCardSkeleton()),
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Sell on Marketplace', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text('Reach thousands of customers. List your products, manage orders, get paid.',
              style: TextStyle(color: Colors.white70, fontSize: 13)),
          const SizedBox(height: 14),
          ElevatedButton(
            onPressed: () => context.push('/become-vendor'),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: BrandColors.ink, padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12)),
            child: const Text('Become a vendor'),
          ),
        ],
      ),
    );
  }
}
