import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lottie/lottie.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../core/auth/auth_controller.dart';
import '../../data/providers.dart';
import '../cart/cart_controller.dart';
import '../favourites/store_favourite_controller.dart';
import '../../models/home.dart';
import '../../models/store.dart';
import '../../models/product.dart';
import '../../shared/widgets/store_favourite_card.dart';
import '../../models/festival.dart';
import '../../shared/widgets/product_card.dart';
import '../../shared/widgets/section_header.dart';
import '../../shared/widgets/cart_button.dart';
import '../../shared/widgets/wishlist_button.dart';
import '../../shared/widgets/notification_bell.dart';
import '../../shared/widgets/search_bar_pill.dart';
import '../../shared/category_emoji.dart';
import 'festival_greeting_overlay.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sectionsAsync = ref.watch(homeSectionsProvider);
    final festival = ref.watch(festivalProvider);

    // Fires once when active festival arrives
    ref.listen(festivalProvider, (_, next) {
      final f = next.valueOrNull;
      if (f != null) maybeShowFestivalGreeting(context, ref, f);
    });

    return Scaffold(
      backgroundColor: context.brand.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const _Header(),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(homeSectionsProvider);
                  ref.invalidate(bannersProvider);
                  ref.invalidate(categoryTreeProvider);
                  ref.invalidate(vendorsProvider);
                },
                child: sectionsAsync.when(
                  loading: () => const _LoadingFeed(),
                  error: (e, _) => _err(context, ref, e.toString()),
                  data: (sections) {
                    return ListView(
                      padding: const EdgeInsets.only(bottom: 28),
                      children: [
                        festival.maybeWhen(
                          data: (f) => f == null
                              ? const SizedBox.shrink()
                              : _FestivalBanner(festival: f),
                          orElse: () => const SizedBox.shrink(),
                        ),
                        // Quick-reorder row: previously-ordered products + favourite stores, always
                        // near the top (not buried in the wishlist screen / account menu) so a
                        // returning customer can order again in one tap. Hidden entirely when a
                        // guest or when there's nothing to show — no empty placeholder clutter.
                        const _OrderAgainSection(),
                        const _RecentlyViewedSection(),
                        const _FavouriteStoresSection(),
                        // Every section is rendered dynamically in the EXACT order defined by the portal.
                        // If a section is disabled in the portal, the backend excludes it, so it will not appear here.
                        for (final s in sections)
                          _renderSection(context, ref, s),
                        const _SellCta(),
                      ],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _renderSection(BuildContext context, WidgetRef ref, HomeSection s) {
    switch (s.type) {
      case 'banners':
        final banners = s.banners.isNotEmpty
            ? s.banners
            : (ref.watch(bannersProvider).valueOrNull ?? []);
        if (banners.isEmpty) return const SizedBox.shrink();
        return _BannerCarousel(banners: banners);

      case 'categories':
        return _CategoryGridSection(section: s);

      case 'vendors':
        // "Near you" used to be a home-feed rail; it's now the dedicated "Now" tab
        // (bottom nav) — open-right-now vendors within instant-delivery range, not just
        // sorted-by-distance. Hiding this section rather than rendering it as a generic
        // row avoids showing the same "near you" idea twice in two different places.
        if (s.sort == 'nearby' || s.title.toLowerCase().contains('near')) {
          return const SizedBox.shrink();
        }
        if (s.sort == 'rating' ||
            s.title.toLowerCase().contains('popular') ||
            s.title.toLowerCase().contains('top')) {
          return _PopularStoresSection(section: s);
        }
        return _VendorsRowSection(section: s);

      case 'products':
      default:
        if (s.sort == 'discount' || s.title.toLowerCase().contains('deal')) {
          return _DealsOfTheDaySection(section: s);
        }
        if (s.sort == 'popularity' ||
            s.title.toLowerCase().contains('trending')) {
          return _TrendingSection(section: s);
        }
        return _ProductsRowSection(section: s);
    }
  }

  Widget _err(BuildContext context, WidgetRef ref, String msg) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          Text(msg,
              textAlign: TextAlign.center,
              style: TextStyle(color: context.colors.textMuted)),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: () => ref.invalidate(homeSectionsProvider),
            child: const Text('Retry'),
          ),
        ]),
      );
}

// ── 1. Top Bar & 2. Search Bar ──────────────────────────────────────────────
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
              const Expanded(child: _LocationBar()),
              const SizedBox(width: 6),
              const NotificationBell(filled: true),
              const SizedBox(width: 6),
              const WishlistButton(filled: true),
              const SizedBox(width: 6),
              const CartButton(filled: true, color: Colors.white),
              const SizedBox(width: 6),
              _AccountButton(
                user: user,
                onAccount: () => context.push('/account'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const SearchBarPill(hint: 'Search products, stores & brands…'),
        ],
      ),
    );
  }
}

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
    final initial = user!.name.trim().isNotEmpty
        ? user!.name.trim()[0].toUpperCase()
        : '👤';
    return GestureDetector(
      onTap: onAccount,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          gradient: context.brand.gradient,
          borderRadius: BorderRadius.circular(12),
        ),
        alignment: Alignment.center,
        child: Text(initial,
            style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 16)),
      ),
    );
  }
}

class _LocationBar extends ConsumerWidget {
  const _LocationBar();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    final addresses = user == null ? null : ref.watch(addressesProvider);
    final list = addresses?.asData?.value ?? const [];

    String title = 'Deliver to';
    String subtitle =
        'Ghatlodiya, Ahmedabad'; // final fallback when neither a saved address nor GPS is available
    if (list.isNotEmpty) {
      final a = list.firstWhere((x) => x.isDefault, orElse: () => list.first);
      title = a.label.isNotEmpty ? a.label : 'Deliver to';
      subtitle = [a.line1, a.city].where((s) => s.isNotEmpty).join(', ');
    } else {
      // No saved address — show the live device-GPS label instead of a static string.
      final liveLabel = ref.watch(liveLocationLabelProvider).asData?.value;
      if (liveLabel != null && liveLabel.isNotEmpty) {
        title = 'Current location';
        subtitle = liveLabel;
      }
    }

    return GestureDetector(
      onTap: () => context.push(user == null ? '/login' : '/addresses'),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              gradient: context.brand.gradient,
              borderRadius: BorderRadius.circular(12),
              boxShadow: const [
                BoxShadow(
                    color: Color(0x22000000),
                    blurRadius: 8,
                    offset: Offset(0, 3)),
              ],
            ),
            child: const Icon(Icons.location_on_rounded,
                color: Colors.white, size: 19),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title,
                        style: TextStyle(
                            fontSize: 11,
                            color: context.colors.textMuted,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(width: 4),
                    Icon(Icons.keyboard_arrow_down_rounded,
                        size: 16, color: context.colors.ink),
                  ],
                ),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: context.colors.ink,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderIcon extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _HeaderIcon({required this.icon, required this.onTap});
  @override
  Widget build(BuildContext context) {
    // Theme-aware, matching the other header pills (NotificationBell/WishlistButton
    // `filled: true`) — hardcoded white here was invisible-on-white in light mode's
    // intent but left a stark white circle in dark mode.
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.colors.border),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Icon(icon, color: context.colors.ink, size: 21),
        ),
      ),
    );
  }
}

// ── 2.5 Order Again + Your Favourite Stores (quick reorder, always near top) ─
class _OrderAgainSection extends ConsumerWidget {
  const _OrderAgainSection();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    if (user == null) return const SizedBox.shrink();
    final products = ref.watch(recentProductsProvider).valueOrNull ?? [];
    if (products.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
            title: 'Order Again',
            subtitle: 'Your previous picks, one tap away'),
        SizedBox(
          height: 240,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) =>
                SizedBox(width: 150, child: ProductCard(product: products[i])),
          ),
        ),
      ],
    );
  }
}

// ── "Recently viewed" — Amazon/Flipkart-style browsing-history nudge: products the
// customer opened but hasn't bought, shown back to them to encourage a purchase.
class _RecentlyViewedSection extends ConsumerWidget {
  const _RecentlyViewedSection();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    if (user == null) return const SizedBox.shrink();
    final products = ref.watch(recentlyViewedProvider).valueOrNull ?? [];
    if (products.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
            title: 'Recently Viewed',
            subtitle: 'Pick up where you left off'),
        SizedBox(
          height: 240,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) =>
                SizedBox(width: 150, child: ProductCard(product: products[i])),
          ),
        ),
      ],
    );
  }
}

class _FavouriteStoresSection extends ConsumerWidget {
  const _FavouriteStoresSection();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    if (user == null) return const SizedBox.shrink();
    final ids = ref.watch(favouriteStoresProvider);
    if (ids.isEmpty) return const SizedBox.shrink();
    final stores = (ref.watch(favouriteStoreVendorsProvider).valueOrNull ?? [])
        .where((s) => ids.contains(s.id))
        .toList();
    if (stores.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: 'Your Favourite Stores',
          subtitle: 'Shops you\'ve saved for quick reordering',
          actionLabel: 'View All ›',
          onAction: () => context.push('/favourite-stores'),
        ),
        SizedBox(
          height: 150,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: stores.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => SizedBox(
                width: 150, child: StoreFavouriteCard(vendor: stores[i])),
          ),
        ),
      ],
    );
  }
}

// ── 3. Promotional Banner ───────────────────────────────────────────────────
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
    if (hex == null || hex.isEmpty) return const Color(0xFF10B981);
    final h = hex.replaceAll('#', '');
    try {
      return Color(int.parse('FF$h', radix: 16));
    } catch (_) {
      return const Color(0xFF10B981);
    }
  }

  @override
  Widget build(BuildContext context) {
    final banners = widget.banners;
    return Column(
      children: [
        Container(
          height: 164,
          margin: const EdgeInsets.fromLTRB(14, 10, 14, 0),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x14000000),
                  blurRadius: 10,
                  offset: Offset(0, 4)),
            ],
          ),
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
                  padding: const EdgeInsets.fromLTRB(20, 16, 16, 16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [base, Color.lerp(base, Colors.black, 0.35)!],
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: Colors.redAccent,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text('UP TO 50% OFF',
                                  style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w900)),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              b.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 21,
                                fontWeight: FontWeight.w900,
                                height: 1.1,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              b.subtitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 12),
                            ),
                            const SizedBox(height: 10),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 6),
                              decoration: BoxDecoration(
                                color: context.colors.surface,
                                borderRadius: BorderRadius.circular(99),
                              ),
                              child: Text(
                                b.ctaText ?? 'Shop Now',
                                style: TextStyle(
                                    color: base,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Decorative graphic / icon
                      SizedBox(
                        width: 90,
                        height: 90,
                        child: Center(
                          child: Text('🥗',
                              style: TextStyle(
                                  color: context.colors.ink, fontSize: 64)),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        if (banners.length > 1) ...[
          const SizedBox(height: 8),
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
                      : context.colors.border,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// ── 4. Shop by Category — driven by the real category tree (same source as the
// "View All" /categories screen and the backend), not a fixed guess-list. The old
// hardcoded tiles (grocery/fruits-veg/beauty/home-kitchen/...) didn't match any
// actual seeded department slug except fashion/electronics by coincidence, so tapping
// most of them opened a department page with nothing in it, and this grid never
// agreed with what "View All" showed. One tile background rotates through a small
// fixed palette since the backend doesn't supply per-category colors.
const _categoryTileColors = [
  Color(0xFFDCFCE7),
  Color(0xFFFCE7F3),
  Color(0xFFEDE9FE),
  Color(0xFFFEF9C3),
  Color(0xFFFFEDD5),
  Color(0xFFE0F2FE),
  Color(0xFFF3E8FF),
  Color(0xFFE0E7FF),
];

class _CategoryGridSection extends ConsumerWidget {
  final HomeSection section;
  const _CategoryGridSection({required this.section});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tree = ref.watch(categoryTreeProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: section.title.isNotEmpty ? section.title : 'Shop by Category',
          subtitle: section.subtitle.isNotEmpty
              ? section.subtitle
              : 'Main categories with icons for quick navigation',
          actionLabel: 'View All ›',
          onAction: () => context.push('/categories'),
        ),
        SizedBox(
          height: 184,
          child: tree.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (depts) => GridView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              scrollDirection: Axis.horizontal,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 10,
                childAspectRatio: 0.95,
              ),
              itemCount: depts.length,
              itemBuilder: (context, i) {
                final dept = depts[i];
                return GestureDetector(
                  onTap: () {
                    context.push(
                        '/catalog?dept=${dept.slug}&title=${Uri.encodeComponent(dept.name)}');
                  },
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 54,
                        height: 54,
                        decoration: BoxDecoration(
                          color: _categoryTileColors[
                              i % _categoryTileColors.length],
                          shape: BoxShape.circle,
                          boxShadow: const [
                            BoxShadow(
                                color: Color(0x0C000000),
                                blurRadius: 4,
                                offset: Offset(0, 2)),
                          ],
                        ),
                        alignment: Alignment.center,
                        child: Text(categoryEmoji(dept.slug),
                            style: const TextStyle(fontSize: 24)),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        dept.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

/// Blinkit-style "outside serviceable area" state — same visual language as
/// cart_screen.dart's _EmptyCart. Also reused by the "Now" tab (now_screen.dart)
/// for its own empty state, same wording fits both.
class OutOfServiceArea extends StatelessWidget {
  const OutOfServiceArea({super.key});
  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 16),
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.colors.border),
        ),
        child: Column(
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(color: b.soft, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Text('📍',
                  style: TextStyle(color: context.colors.ink, fontSize: 32)),
            ),
            const SizedBox(height: 14),
            Text('Delivery not available in your city',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: context.colors.ink,
                    fontWeight: FontWeight.w900,
                    fontSize: 15)),
            const SizedBox(height: 4),
            Text('We\'ll be available soon. Thanks for your patience!',
                textAlign: TextAlign.center,
                style:
                    TextStyle(color: context.colors.textMuted, fontSize: 12.5)),
          ],
        ),
      ),
    );
  }
}

class _NearbyStoreCard extends ConsumerWidget {
  final Vendor vendor;
  const _NearbyStoreCard({required this.vendor});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final b = context.brand;
    final delivery = vendor.deliveryTime ?? '15–20 min';
    final isFav = ref.watch(favouriteStoresProvider).contains(vendor.id);

    return GestureDetector(
      onTap: () => context.push('/store/${vendor.slug}'),
      child: Container(
        width: 180,
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.colors.border),
          boxShadow: const [
            BoxShadow(
                color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 3)),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Store cover / header
            Container(
              height: 72,
              color: const Color(0xFFF1F5F9),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  vendor.logo != null
                      ? Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          child: Center(
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
                                fit: BoxFit.contain),
                          ),
                        )
                      : Container(
                          decoration: BoxDecoration(gradient: b.gradient),
                          child: Center(
                            child: Text(
                              vendor.name.isNotEmpty ? vendor.name[0] : '🏬',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 26,
                                  fontWeight: FontWeight.w900),
                            ),
                          ),
                        ),
                  Positioned(
                    top: 6,
                    left: 6,
                    child: GestureDetector(
                      onTap: () async {
                        final ok = await ref
                            .read(favouriteStoresProvider.notifier)
                            .toggle(vendor.id);
                        if (!ok && context.mounted) context.push('/login');
                      },
                      child: Container(
                        width: 26,
                        height: 26,
                        decoration: const BoxDecoration(
                            color: Colors.white, shape: BoxShape.circle),
                        child: Icon(
                            isFav
                                ? Icons.favorite
                                : Icons.favorite_border_rounded,
                            size: 15,
                            color: isFav
                                ? const Color(0xFFE11D48)
                                : context.colors.textMuted),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 6,
                    right: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFF15803D),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.star_rounded,
                              size: 12, color: Colors.white),
                          const SizedBox(width: 2),
                          Text(
                            vendor.ratingAvg > 0
                                ? vendor.ratingAvg.toStringAsFixed(1)
                                : '4.5',
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10.5,
                                fontWeight: FontWeight.w800),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Store details
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    vendor.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 13),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${vendor.vendorType} · $delivery',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: context.colors.textMuted, fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── 6. Deals of the Day (Live Countdown Timer + Discount Cards) ─────────────
class _DealsOfTheDaySection extends StatelessWidget {
  final HomeSection section;
  const _DealsOfTheDaySection({required this.section});

  @override
  Widget build(BuildContext context) {
    if (section.products.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 14, 12, 14),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF1F2), // Soft coral/peach wash from reference
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFFFE4E6)),
        boxShadow: const [
          BoxShadow(
              color: Color(0x0C000000), blurRadius: 10, offset: Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'Deals of the Day',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFF881337)),
              ),
              const SizedBox(width: 8),
              if (section.dealsTimer?.endsAt != null)
                _CountdownTimer(endsAt: section.dealsTimer!.endsAt!),
              const Spacer(),
              GestureDetector(
                onTap: () => context.push('/catalog?sort=discount'),
                child: const Text('View All ›',
                    style: TextStyle(
                        color: Color(0xFFE11D48),
                        fontWeight: FontWeight.w800,
                        fontSize: 12.5)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 220,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: section.products.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, i) =>
                  _DealProductCard(product: section.products[i]),
            ),
          ),
        ],
      ),
    );
  }
}

class _CountdownTimer extends StatefulWidget {
  /// Real epoch-ms expiry of the soonest-ending active deal (see home.module.ts's
  /// `secondsUntil`). Deriving remaining time from wall-clock `endsAt` on every tick —
  /// rather than a client-seeded initial h/m/s that just decrements — keeps the
  /// countdown correct even if the app was backgrounded for a while.
  final int endsAt;
  const _CountdownTimer({required this.endsAt});

  @override
  State<_CountdownTimer> createState() => _CountdownTimerState();
}

class _CountdownTimerState extends State<_CountdownTimer> {
  late int _totalSec;
  Timer? _timer;

  int _remaining() =>
      (widget.endsAt - DateTime.now().millisecondsSinceEpoch) ~/ 1000;

  @override
  void initState() {
    super.initState();
    _totalSec = _remaining().clamp(0, 1 << 31);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _totalSec = _remaining().clamp(0, 1 << 31));
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final h = (_totalSec ~/ 3600).toString().padLeft(2, '0');
    final m = ((_totalSec % 3600) ~/ 60).toString().padLeft(2, '0');
    final s = (_totalSec % 60).toString().padLeft(2, '0');

    Widget badge(String txt) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          decoration: BoxDecoration(
            color: const Color(0xFFE11D48),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(txt,
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 11)),
        );

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        badge(h),
        const Text(' : ',
            style: TextStyle(
                fontWeight: FontWeight.w900, color: Color(0xFFE11D48))),
        badge(m),
        const Text(' : ',
            style: TextStyle(
                fontWeight: FontWeight.w900, color: Color(0xFFE11D48))),
        badge(s),
      ],
    );
  }
}

class _DealProductCard extends ConsumerWidget {
  final Product product;
  const _DealProductCard({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final discount = product.discountPercent ?? 23;
    final price = product.minPrice;
    final mrp = product.originalPrice ?? (price * 1.3).round();
    final cart = ref.read(cartProvider.notifier);

    return GestureDetector(
      onTap: () => context.push('/p/${product.slug}'),
      child: Container(
        width: 136,
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFFECDD3)),
          boxShadow: const [
            BoxShadow(
                color: Color(0x08000000), blurRadius: 4, offset: Offset(0, 2)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Discount Tag
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFFFFE4E6),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '$discount% OFF',
                style: const TextStyle(
                    color: Color(0xFFE11D48),
                    fontSize: 9.5,
                    fontWeight: FontWeight.w900),
              ),
            ),
            const SizedBox(height: 4),
            // Image
            Expanded(
              child: Center(
                child: product.firstImage != null
                    ? CachedNetworkImage(
                        imageUrl: product.firstImage!,
                        fit: BoxFit.contain,
                        placeholder: (_, __) =>
                            Container(color: const Color(0xFFF1F1F4)),
                        errorWidget: (_, __, ___) => Text('🛍️',
                            style: TextStyle(
                                color: context.colors.ink, fontSize: 32)),
                      )
                    : Text('🛍️',
                        style:
                            TextStyle(color: context.colors.ink, fontSize: 32)),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              product.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
            ),
            Text(
              product.brand ?? (product.store?.name ?? 'Store'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: context.colors.textMuted, fontSize: 10),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(rupees(price),
                        style: const TextStyle(
                            fontWeight: FontWeight.w900, fontSize: 13.5)),
                    Text(
                      rupees(mrp),
                      style: TextStyle(
                        decoration: TextDecoration.lineThrough,
                        color: context.colors.textMuted,
                        fontSize: 10.5,
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () {
                    final v = product.variants.isNotEmpty
                        ? product.variants.first
                        : null;
                    if (v != null) {
                      cart.add(CartLine(
                        productId: product.id,
                        variantSku: v.sku,
                        title: product.title,
                        image: product.firstImage,
                        storeId: product.storeId,
                        storeName: product.store?.name,
                        price: v.price,
                        qty: 1,
                      ));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('Added to cart'),
                            duration: Duration(milliseconds: 700)),
                      );
                    } else {
                      context.push('/p/${product.slug}');
                    }
                  },
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.add, color: Colors.white, size: 18),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── 7. Trending Now Section ─────────────────────────────────────────────────
class _TrendingSection extends StatelessWidget {
  final HomeSection section;
  const _TrendingSection({required this.section});

  @override
  Widget build(BuildContext context) {
    if (section.products.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: section.title.isNotEmpty ? section.title : 'Trending Now',
          subtitle: section.subtitle.isNotEmpty
              ? section.subtitle
              : 'Popular picks from local stores',
          actionLabel: 'View All ›',
          onAction: () => context.push('/catalog?sort=popularity'),
        ),
        SizedBox(
          height: 240,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: section.products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => SizedBox(
              width: 144,
              child: ProductCard(product: section.products[i]),
            ),
          ),
        ),
      ],
    );
  }
}

// ── 8. Popular Stores Section ───────────────────────────────────────────────
class _PopularStoresSection extends StatelessWidget {
  final HomeSection section;
  const _PopularStoresSection({required this.section});

  @override
  Widget build(BuildContext context) {
    if (section.vendors.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: section.title.isNotEmpty ? section.title : 'Popular Stores',
          subtitle: section.subtitle.isNotEmpty
              ? section.subtitle
              : 'Top rated stores loved by customers',
          actionLabel: 'View All ›',
          onAction: () => context.push('/stores'),
        ),
        SizedBox(
          height: 140,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: section.vendors.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) =>
                _PopularStoreCard(vendor: section.vendors[i]),
          ),
        ),
      ],
    );
  }
}

class _StoreLogoFallback extends StatelessWidget {
  final Vendor vendor;
  final BrandTokens b;
  const _StoreLogoFallback({required this.vendor, required this.b});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(gradient: b.gradient),
      child: Center(
        child: Text(
          vendor.name.isNotEmpty ? vendor.name[0].toUpperCase() : '🏪',
          style: const TextStyle(
              color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900),
        ),
      ),
    );
  }
}

class _PopularStoreCard extends StatelessWidget {
  final Vendor vendor;
  const _PopularStoreCard({required this.vendor});

  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return GestureDetector(
      onTap: () => context.push('/store/${vendor.slug}'),
      child: Container(
        width: 160,
        decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.colors.border),
          boxShadow: const [
            BoxShadow(
                color: Color(0x08000000), blurRadius: 6, offset: Offset(0, 2)),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 64,
              color: context.colors.bg,
              child: vendor.logo != null
                  ? Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 3),
                      child: Center(
                        child: CachedNetworkImage(
                          imageUrl: vendor.logo!,
                          fit: BoxFit.contain,
                          errorWidget: (_, __, ___) =>
                              _StoreLogoFallback(vendor: vendor, b: b),
                        ),
                      ),
                    )
                  : _StoreLogoFallback(vendor: vendor, b: b),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    vendor.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: context.colors.ink,
                        fontWeight: FontWeight.w800,
                        fontSize: 12.5),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(vendor.vendorType,
                          style: TextStyle(
                              color: context.colors.textMuted, fontSize: 11)),
                      const Spacer(),
                      Icon(Icons.star_rounded,
                          size: 14, color: context.colors.star),
                      Text(
                        ' ${vendor.ratingAvg.toStringAsFixed(1)}',
                        style: TextStyle(
                            color: context.colors.ink,
                            fontWeight: FontWeight.w800,
                            fontSize: 11),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Generic Fallback Rows for Custom Admin Sections ─────────────────────────
class _ProductsRowSection extends StatelessWidget {
  final HomeSection section;
  const _ProductsRowSection({required this.section});

  @override
  Widget build(BuildContext context) {
    if (section.products.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        SectionHeader(
          title: section.title,
          subtitle: section.subtitle,
          actionLabel: 'View All ›',
          onAction: () => context.push('/catalog'),
        ),
        SizedBox(
          height: 240,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: section.products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => SizedBox(
                width: 144, child: ProductCard(product: section.products[i])),
          ),
        ),
      ],
    );
  }
}

class _VendorsRowSection extends StatelessWidget {
  final HomeSection section;
  const _VendorsRowSection({required this.section});

  @override
  Widget build(BuildContext context) {
    if (section.vendors.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        SectionHeader(
          title: section.title,
          subtitle: section.subtitle,
          actionLabel: 'View All ›',
          onAction: () => context.push('/stores'),
        ),
        SizedBox(
          height: 140,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: section.vendors.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => _NearbyStoreCard(vendor: section.vendors[i]),
          ),
        ),
      ],
    );
  }
}

// ── Live Festival Banner ────────────────────────────────────────────────────
class _FestivalBanner extends StatelessWidget {
  final FestivalModel festival;
  const _FestivalBanner({required this.festival});

  Color get _base {
    final hex = festival.themeColor;
    if (hex == null || hex.isEmpty) return BrandColors.brand600;
    final h = hex.replaceAll('#', '');
    try {
      return Color(int.parse('FF$h', radix: 16));
    } catch (_) {
      return BrandColors.brand600;
    }
  }

  @override
  Widget build(BuildContext context) {
    final base = _base;
    return Container(
      margin: const EdgeInsets.fromLTRB(14, 10, 14, 4),
      padding: const EdgeInsets.fromLTRB(18, 16, 8, 16),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [base, Color.lerp(base, Colors.black, 0.25)!],
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(festival.greetingTitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        height: 1.15)),
                const SizedBox(height: 6),
                Text(festival.greetingMessage,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style:
                        const TextStyle(color: Colors.white, fontSize: 12.5)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 80,
            height: 80,
            child: festival.lottieUrl.isEmpty
                ? const Icon(Icons.celebration_rounded,
                    color: Colors.white, size: 44)
                : Lottie.network(festival.lottieUrl,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Icon(
                        Icons.celebration_rounded,
                        color: Colors.white,
                        size: 44)),
          ),
        ],
      ),
    );
  }
}

// ── Skeletons & Sell CTA ────────────────────────────────────────────────────
class _LoadingFeed extends StatelessWidget {
  const _LoadingFeed();
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Container(
          height: 160,
          decoration: BoxDecoration(
              color: Colors.black12, borderRadius: BorderRadius.circular(18)),
        ),
        const SizedBox(height: 16),
        Container(
          height: 90,
          decoration: BoxDecoration(
              color: Colors.black12, borderRadius: BorderRadius.circular(14)),
        ),
        const SizedBox(height: 16),
        Container(
          height: 180,
          decoration: BoxDecoration(
              color: Colors.black12, borderRadius: BorderRadius.circular(14)),
        ),
      ],
    );
  }
}

class _SellCta extends StatelessWidget {
  const _SellCta();
  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Container(
      margin: const EdgeInsets.fromLTRB(14, 24, 14, 8),
      padding: const EdgeInsets.all(20),
      // Brand gradient (gStart/gEnd) — not context.colors.ink (flips to near-white in
      // dark mode, which made this white-on-white/invisible) and not a flat black
      // either; gStart/gEnd stay mid-saturation accent tones in both themes, unlike
      // primaryDark which inverts between themes, so white text stays readable on both.
      decoration: BoxDecoration(
          gradient: b.gradient, borderRadius: BorderRadius.circular(16)),
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
            style: TextStyle(color: Colors.white70, fontSize: 13),
          ),
          const SizedBox(height: 14),
          ElevatedButton(
            onPressed: () => context.push('/become-vendor'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: BrandColors.ink,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            ),
            child: const Text('Become a vendor'),
          ),
        ],
      ),
    );
  }
}
