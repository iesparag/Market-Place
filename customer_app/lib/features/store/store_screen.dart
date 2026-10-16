import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../data/catalog_repository.dart';
import '../../models/category.dart';
import '../../models/product.dart';
import '../../models/store.dart';
import '../../shared/category_emoji.dart';
import '../../shared/widgets/product_card.dart';
import '../../shared/widgets/shimmer.dart';
import '../../shared/widgets/cart_button.dart';
import '../../shared/widgets/wishlist_button.dart';
import '../favourites/store_favourite_controller.dart';

const double _kHeroHeight = 220;

class StoreScreen extends ConsumerStatefulWidget {
  final String slug;
  const StoreScreen({super.key, required this.slug});
  @override
  ConsumerState<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends ConsumerState<StoreScreen> {
  String? _catId; // null = All
  bool _descExpanded = false;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(storeProvider(widget.slug));
    return Scaffold(
      backgroundColor: Colors.white,
      body: async.when(
        loading: () => const _StoreSkeleton(),
        error: (e, _) => Scaffold(
          appBar: AppBar(),
          body: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.error_outline_rounded, size: 40, color: BrandColors.textMuted),
              const SizedBox(height: 10),
              Text('$e', style: const TextStyle(color: BrandColors.textMuted)),
            ]),
          ),
        ),
        data: (data) => _content(context, data),
      ),
    );
  }

  /// Flatten the store's category tree to its leaf categories (where products live).
  List<CatNode> _leaves(List<CatNode> nodes) {
    final out = <CatNode>[];
    void walk(CatNode n) =>
        n.children.isEmpty ? out.add(n) : n.children.forEach(walk);
    nodes.forEach(walk);
    return out;
  }

  Widget _content(BuildContext context, StorePageData data) {
    final s = data.profile;
    final leaves = _leaves(data.categoryTree);
    final products = _catId == null
        ? data.products
        : data.products.where((p) => p.categoryId == _catId).toList();

    return NestedScrollView(
      headerSliverBuilder: (context, _) => [
        SliverAppBar(
          pinned: true,
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.white,
          elevation: 0.5,
          expandedHeight: _kHeroHeight,
          leading: _CircleIconButton(
            icon: Icons.arrow_back_rounded,
            onTap: () => Navigator.of(context).maybePop(),
          ),
          title: Text(s.name, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: BrandColors.ink)),
          actions: [
            _StoreFavouriteButton(storeId: s.id),
            const WishlistButton(color: BrandColors.ink),
            const CartButton(color: BrandColors.ink),
            const SizedBox(width: 4),
          ],
          flexibleSpace: FlexibleSpaceBar(
            collapseMode: CollapseMode.pin,
            background: _CoverCarousel(images: s.coverImages),
          ),
        ),
        SliverToBoxAdapter(child: _InfoCard(s: s, productCount: data.products.length, expanded: _descExpanded,
            onToggleDesc: () => setState(() => _descExpanded = !_descExpanded))),
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(16, 18, 16, 8),
            child: Text('Menu', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          ),
        ),
      ],
      body: leaves.isEmpty
          ? _grid(products)
          : Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _rail(leaves),
                Expanded(child: _grid(products)),
              ],
            ),
    );
  }

  Widget _grid(List<Product> products) {
    if (products.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('🧺', style: TextStyle(fontSize: 44)),
            SizedBox(height: 10),
            Text('No products in this category', style: TextStyle(color: BrandColors.textMuted, fontWeight: FontWeight.w600)),
          ]),
        ),
      );
    }
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 20),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.62,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10),
      itemCount: products.length,
      itemBuilder: (_, i) => ProductCard(product: products[i]),
    );
  }

  Widget _rail(List<CatNode> leaves) {
    return Container(
      width: 86,
      color: const Color(0xFFF6F9F7),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(0, 10, 0, 20),
        children: [
          _railTile('All', null, null, _catId == null),
          for (final n in leaves)
            _railTile(n.name, n.slug, n.id, _catId == n.id),
        ],
      ),
    );
  }

  Widget _railTile(String name, String? slug, String? id, bool selected) {
    final b = context.brand;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => setState(() => _catId = id),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.transparent,
          border: Border(
              left: BorderSide(
                  color: selected ? b.primary : Colors.transparent, width: 3)),
        ),
        child: Column(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: selected ? b.soft : Colors.white,
                shape: BoxShape.circle,
                border: Border.all(
                    color: selected
                        ? Color.lerp(b.soft, b.primary, 0.35)!
                        : const Color(0xFFE4EFE8)),
                boxShadow: selected
                    ? [const BoxShadow(color: Color(0x14000000), blurRadius: 6, offset: Offset(0, 2))]
                    : null,
              ),
              alignment: Alignment.center,
              child: Text(
                  name == 'All' && slug == null ? '🛍️' : categoryEmoji(slug),
                  style: const TextStyle(fontSize: 22)),
            ),
            const SizedBox(height: 6),
            Text(name,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 10.5,
                    height: 1.12,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
                    color: selected ? b.primaryDark : BrandColors.ink)),
          ],
        ),
      ),
    );
  }
}

/// Floating circular icon button used over the hero image (back / favourite / cart).
class _CircleIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final Color? iconColor;
  const _CircleIconButton({required this.icon, required this.onTap, this.iconColor});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(6),
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(),
        elevation: 1,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Icon(icon, size: 20, color: iconColor ?? BrandColors.ink),
          ),
        ),
      ),
    );
  }
}

/// The storefront identity card — logo, name, verified badge, rating, delivery/
/// location, and an expandable description. Sits directly under the hero image,
/// everything a customer needs to decide "is this the right shop" before scrolling
/// into the menu.
class _InfoCard extends StatelessWidget {
  final StoreProfile s;
  final int productCount;
  final bool expanded;
  final VoidCallback onToggleDesc;
  const _InfoCard({required this.s, required this.productCount, required this.expanded, required this.onToggleDesc});

  @override
  Widget build(BuildContext context) {
    final city = s.address?['city']?.toString();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(color: BrandColors.border),
                    boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 6, offset: Offset(0, 2))]),
                clipBehavior: Clip.antiAlias,
                child: s.logo != null
                    ? CachedNetworkImage(imageUrl: s.logo!, fit: BoxFit.cover)
                    : Container(
                        alignment: Alignment.center,
                        decoration: BoxDecoration(gradient: context.brand.gradient),
                        child: Text(s.name.isNotEmpty ? s.name[0] : '?',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20))),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 19)),
                    const SizedBox(height: 4),
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        const _VerifiedBadge(),
                        _OpenStatusBadge(isOpenNow: s.isOpenNow),
                        if (s.ratingCount > 0) _RatingPill(avg: s.ratingAvg, count: s.ratingCount),
                        Text('$productCount products',
                            style: const TextStyle(color: BrandColors.textMuted, fontSize: 12.5)),
                      ],
                    ),
                    if (s.vendorType != null || city != null) ...[
                      const SizedBox(height: 4),
                      Row(children: [
                        const Icon(Icons.storefront_outlined, size: 13, color: BrandColors.textMuted),
                        const SizedBox(width: 3),
                        Expanded(
                          child: Text(
                              [if (s.vendorType != null) s.vendorType, if (city != null) city].join(' · '),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: BrandColors.textMuted, fontSize: 12.5)),
                        ),
                      ]),
                    ],
                  ],
                ),
              ),
              if (s.contactPhone != null) _CircleIconButton(
                icon: Icons.call_rounded,
                iconColor: context.brand.primary,
                onTap: () => launchUrl(Uri.parse('tel:${s.contactPhone}')),
              ),
            ],
          ),
          if (s.description != null && s.description!.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            GestureDetector(
              onTap: onToggleDesc,
              child: Text(
                s.description!,
                maxLines: expanded ? null : 2,
                overflow: expanded ? null : TextOverflow.ellipsis,
                style: const TextStyle(color: BrandColors.textMuted, fontSize: 13, height: 1.35),
              ),
            ),
          ],
          const SizedBox(height: 12),
          const Divider(height: 1),
        ],
      ),
    );
  }
}

class _OpenStatusBadge extends StatelessWidget {
  final bool isOpenNow;
  const _OpenStatusBadge({required this.isOpenNow});
  @override
  Widget build(BuildContext context) {
    final color = isOpenNow ? BrandColors.success : BrandColors.danger;
    final bg = isOpenNow ? const Color(0xFFE7F6EC) : const Color(0xFFFCE8E8);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(isOpenNow ? Icons.bolt_rounded : Icons.schedule_rounded, size: 13, color: color),
        const SizedBox(width: 3),
        Text(isOpenNow ? 'Open now' : 'Closed',
            style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w800)),
      ]),
    );
  }
}

class _VerifiedBadge extends StatelessWidget {
  const _VerifiedBadge();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
          color: const Color(0xFFE7F6EC), borderRadius: BorderRadius.circular(6)),
      child: const Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.verified_rounded, size: 13, color: BrandColors.success),
        SizedBox(width: 3),
        Text('Verified', style: TextStyle(color: BrandColors.success, fontSize: 11.5, fontWeight: FontWeight.w800)),
      ]),
    );
  }
}

/// Star-rating chip — ★ avg (count), rounded to the nearest 0.5 star.
class _RatingPill extends StatelessWidget {
  final double avg;
  final int count;
  const _RatingPill({required this.avg, required this.count});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: const Color(0xFFFFF7E0), borderRadius: BorderRadius.circular(6)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.star_rounded, size: 14, color: BrandColors.star),
        const SizedBox(width: 2),
        Text('${avg.toStringAsFixed(1)} ($count)',
            style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Color(0xFF8A6D00))),
      ]),
    );
  }
}

/// Auto-rotating store cover images with dots.
class _CoverCarousel extends StatefulWidget {
  final List<String> images;
  const _CoverCarousel({required this.images});
  @override
  State<_CoverCarousel> createState() => _CoverCarouselState();
}

class _CoverCarouselState extends State<_CoverCarousel> {
  final _ctrl = PageController();
  Timer? _timer;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    if (widget.images.length > 1) {
      _timer = Timer.periodic(const Duration(seconds: 4), (_) {
        if (!_ctrl.hasClients) return;
        final next = (_page + 1) % widget.images.length;
        _ctrl.animateToPage(next,
            duration: const Duration(milliseconds: 500),
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

  @override
  Widget build(BuildContext context) {
    if (widget.images.isEmpty) {
      return Container(
          decoration: BoxDecoration(gradient: context.brand.gradient));
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        PageView.builder(
          controller: _ctrl,
          onPageChanged: (i) => setState(() => _page = i),
          itemCount: widget.images.length,
          itemBuilder: (_, i) => CachedNetworkImage(
            imageUrl: widget.images[i],
            fit: BoxFit.cover,
            placeholder: (_, __) => const Shimmer(radius: 0),
            errorWidget: (_, __, ___) => Container(decoration: BoxDecoration(gradient: context.brand.gradient)),
          ),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Colors.black45],
                stops: [0.5, 1]),
          ),
        ),
        if (widget.images.length > 1)
          Positioned(
            bottom: 10,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                  widget.images.length,
                  (i) => AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: i == _page ? 18 : 6,
                        height: 6,
                        decoration: BoxDecoration(
                            color: i == _page ? Colors.white : Colors.white54,
                            borderRadius: BorderRadius.circular(3)),
                      )),
            ),
          ),
      ],
    );
  }
}

/// Favourite toggle for a store, same provider/toggle call as the home screen's
/// nearby-store cards — this is the detail-page equivalent of that heart, since the
/// store list and store detail previously had no way to favourite a store at all.
class _StoreFavouriteButton extends ConsumerWidget {
  final String storeId;
  const _StoreFavouriteButton({required this.storeId});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isFav = ref.watch(favouriteStoresProvider).contains(storeId);
    return _CircleIconButton(
      icon: isFav ? Icons.favorite : Icons.favorite_border_rounded,
      iconColor: isFav ? const Color(0xFFE11D48) : BrandColors.ink,
      onTap: () async {
        final ok = await ref.read(favouriteStoresProvider.notifier).toggle(storeId);
        if (!ok && context.mounted) context.push('/login');
      },
    );
  }
}

/// Full-page skeleton shown while the store profile loads — matches the real
/// layout's proportions so there's no visible "jump" once data arrives.
class _StoreSkeleton extends StatelessWidget {
  const _StoreSkeleton();
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          const Shimmer(height: _kHeroHeight, radius: 0),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Shimmer(width: 56, height: 56, radius: 28),
              SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Shimmer(height: 18, width: 160),
                  SizedBox(height: 8),
                  Shimmer(height: 12, width: 120),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 18),
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.all(14),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 10, mainAxisSpacing: 10),
              itemCount: 6,
              itemBuilder: (_, __) => const ProductCardSkeleton(),
            ),
          ),
        ],
      ),
    );
  }
}
