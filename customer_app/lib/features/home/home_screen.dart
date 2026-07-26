import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/theme/theme.dart';
import '../../core/auth/auth_controller.dart';
import '../../data/providers.dart';
import '../shell/app_shell.dart';
import '../../models/category.dart';
import '../../models/home.dart';
import '../../models/store.dart';
import '../../shared/widgets/product_card.dart';
import '../../shared/widgets/section_header.dart';
import '../../shared/widgets/shimmer.dart';
import '../../shared/widgets/cart_button.dart';
import '../../shared/widgets/wishlist_button.dart';
import '../../shared/widgets/search_bar_pill.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final banners = ref.watch(bannersProvider);
    final tree = ref.watch(categoryTreeProvider);
    final sections = ref.watch(homeSectionsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF3F6F4),
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
                      data: (b) => b.isEmpty
                          ? const SizedBox.shrink()
                          : _BannerCarousel(banners: b),
                      orElse: () => const SizedBox.shrink(),
                    ),
                    // Shop by department
                    SectionHeader(
                        title: 'Shop by department',
                        actionLabel: 'See all',
                        onAction: () => context.push('/categories')),
                    tree.when(
                      loading: () => const SizedBox(
                          height: 96,
                          child: Center(child: CircularProgressIndicator())),
                      error: (e, _) => _err(context, ref, e.toString()),
                      data: (nodes) => _DepartmentStrip(nodes: nodes),
                    ),
                    // Admin-composed sections
                    sections.when(
                      loading: () => const _RowSkeleton(),
                      error: (e, _) => _err(context, ref, e.toString()),
                      data: (list) => Column(
                          children:
                              list.map((s) => _Section(section: s)).toList()),
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
          Text(msg,
              textAlign: TextAlign.center,
              style: const TextStyle(color: BrandColors.textMuted)),
          const SizedBox(height: 10),
          OutlinedButton(
              onPressed: () {
                ref.invalidate(homeSectionsProvider);
                ref.invalidate(categoryTreeProvider);
              },
              child: const Text('Retry')),
        ]),
      );
}

// ── Header (brand + actions + search) ───────────────────────────────────────
class _Header extends ConsumerWidget {
  const _Header();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    return Container(
      decoration: BoxDecoration(gradient: context.brand.headerWash),
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
      child: Column(
        children: [
          Row(
            children: [
              const _MarketplaceMark(),
              const Spacer(),
              const WishlistButton(filled: true),
              const SizedBox(width: 6),
              const CartButton(filled: true, color: Colors.white),
              const SizedBox(width: 6),
              _AccountButton(
                  user: user,
                  onAccount: () =>
                      ref.read(shellTabProvider.notifier).state = 3),
            ],
          ),
          const SizedBox(height: 10),
          const SearchBarPill(),
        ],
      ),
    );
  }
}

/// Auth-aware: signed in → avatar with initial → Account tab; else → /login.
class _AccountButton extends StatelessWidget {
  final AuthUser? user;
  final VoidCallback onAccount;
  const _AccountButton({required this.user, required this.onAccount});
  @override
  Widget build(BuildContext context) {
    if (user == null) {
      return _HeaderIcon(
          icon: Icons.person_outline_rounded,
          onTap: () => context.push('/login'));
    }
    final initial =
        user!.name.trim().isNotEmpty ? user!.name.trim()[0].toUpperCase() : '👤';
    return GestureDetector(
      onTap: onAccount,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          gradient: context.brand.gradient,
          borderRadius: BorderRadius.circular(14),
        ),
        alignment: Alignment.center,
        child: Text(initial,
            style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 17)),
      ),
    );
  }
}

class _MarketplaceMark extends StatelessWidget {
  const _MarketplaceMark();
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            gradient: context.brand.gradient,
            borderRadius: BorderRadius.circular(12),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x22000000),
                  blurRadius: 10,
                  offset: Offset(0, 4))
            ],
          ),
          child: const Icon(Icons.storefront_rounded,
              color: Colors.white, size: 22),
        ),
        const SizedBox(width: 8),
        const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Marketplace',
                style: TextStyle(
                    color: BrandColors.ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                    height: 1)),
            SizedBox(height: 2),
            Text('Local stores, fast',
                style: TextStyle(
                    color: BrandColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    height: 1)),
          ],
        ),
      ],
    );
  }
}

class _HeaderIcon extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _HeaderIcon({required this.icon, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, color: BrandColors.ink, size: 23),
        ),
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
        _ctrl.animateToPage(next,
            duration: const Duration(milliseconds: 450),
            curve: Curves.easeInOut);
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
    if (hex == null || hex.isEmpty) return context.brand.primary;
    final h = hex.replaceAll('#', '');
    return Color(int.parse('FF$h', radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    final banners = widget.banners;
    return Column(
      children: [
        Container(
          height: 164,
          margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(18)),
          child: PageView.builder(
            controller: _ctrl,
            onPageChanged: (i) => setState(() => _page = i),
            itemCount: banners.length,
            itemBuilder: (_, i) {
              final b = banners[i];
              final base = _bg(b.bg);
              return GestureDetector(
                onTap: () {
                  if (b.link != null && b.link!.startsWith('/')) {
                    context.push(b.link!);
                  }
                },
                child: Container(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [base, Color.lerp(base, Colors.black, 0.22)!],
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(b.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              height: 1.1)),
                      const SizedBox(height: 6),
                      Text(b.subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 12.5)),
                      if (b.ctaText != null && b.ctaText!.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 7),
                          decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(999)),
                          child: Text(b.ctaText!,
                              style: TextStyle(
                                  color: base,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12.5)),
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
          const SizedBox(height: 7),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
                banners.length,
                (i) => AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: i == _page ? 20 : 6,
                      height: 6,
                      decoration: BoxDecoration(
                          color: i == _page
                              ? context.brand.primary
                              : BrandColors.border,
                          borderRadius: BorderRadius.circular(3)),
                    )),
          ),
        ],
      ],
    );
  }
}

// ── Departments ─────────────────────────────────────────────────────────────
const _emoji = {
  'food-beverages': '🍔',
  'food': '🍔',
  'grocery-dept': '🛒',
  'kirana-grocery': '🛒',
  'fashion': '👗',
  'electronics': '📱',
  'home-kitchen': '🍳',
  'beauty': '💄',
  'pharmacy': '💊',
  'watches': '⌚',
};

class _DepartmentStrip extends StatelessWidget {
  final List<CatNode> nodes;
  const _DepartmentStrip({required this.nodes});
  @override
  Widget build(BuildContext context) {
    if (nodes.isEmpty) return const SizedBox.shrink();
    final b = context.brand;
    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(14, 2, 14, 4),
        itemCount: nodes.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final d = nodes[i];
          return GestureDetector(
            onTap: () => context.push(
                '/catalog?dept=${d.slug}&title=${Uri.encodeComponent(d.name)}'),
            child: SizedBox(
              width: 64,
              child: Column(
                children: [
                  Container(
                    width: 62,
                    height: 62,
                    decoration: BoxDecoration(
                      color: b.soft,
                      shape: BoxShape.circle,
                      border:
                          Border.all(color: Color.lerp(b.soft, b.primary, 0.2)!),
                    ),
                    alignment: Alignment.center,
                    child: Text(_emoji[d.slug] ?? '🛍️',
                        style: const TextStyle(fontSize: 27)),
                  ),
                  const SizedBox(height: 5),
                  Text(d.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w700)),
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
        SectionHeader(
            title: section.title,
            subtitle: section.subtitle,
            actionLabel: 'All shops',
            onAction: () => context.push('/catalog')),
        SizedBox(
          height: 82,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: section.vendors.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => _VendorCard(vendor: section.vendors[i]),
          ),
        ),
      ]);
    }
    if (section.products.isEmpty) return const SizedBox.shrink();
    final params = <String>[];
    if (section.category != null && section.category!.isNotEmpty) {
      params.add('category=${Uri.encodeComponent(section.category!)}');
    }
    if (section.sort != null && section.sort!.isNotEmpty) {
      params.add('sort=${section.sort}');
    }
    final viewAll = '/catalog${params.isEmpty ? '' : '?${params.join('&')}'}';
    return Column(children: [
      SectionHeader(
          title: section.title,
          subtitle: section.subtitle,
          actionLabel: 'View all',
          onAction: () => context.push(viewAll)),
      SizedBox(
        height: 246,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          itemCount: section.products.length,
          separatorBuilder: (_, __) => const SizedBox(width: 10),
          itemBuilder: (_, i) => SizedBox(
              width: 142, child: ProductCard(product: section.products[i])),
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
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: BrandColors.border)),
        child: Row(children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
                gradient: context.brand.gradient, shape: BoxShape.circle),
            clipBehavior: Clip.antiAlias,
            alignment: Alignment.center,
            child: vendor.logo != null
                ? CachedNetworkImage(
                    imageUrl: vendor.logo!,
                    fit: BoxFit.cover,
                    width: 48,
                    height: 48)
                : Text(vendor.name.isNotEmpty ? vendor.name[0] : '?',
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 20)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(vendor.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('${vendor.productCount} products · ${vendor.vendorType}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: BrandColors.textMuted, fontSize: 12)),
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
        height: 246,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          itemCount: 4,
          separatorBuilder: (_, __) => const SizedBox(width: 10),
          itemBuilder: (_, __) =>
              const SizedBox(width: 142, child: ProductCardSkeleton()),
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
      decoration: BoxDecoration(
          color: BrandColors.ink, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Sell on Marketplace',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text(
              'Reach thousands of customers. List your products, manage orders, get paid.',
              style: TextStyle(color: Colors.white70, fontSize: 13)),
          const SizedBox(height: 14),
          ElevatedButton(
            onPressed: () => context.push('/become-vendor'),
            style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: BrandColors.ink,
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 12)),
            child: const Text('Become a vendor'),
          ),
        ],
      ),
    );
  }
}
