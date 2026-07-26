import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../data/catalog_repository.dart';
import '../../models/category.dart';
import '../../models/product.dart';
import '../../shared/widgets/product_card.dart';
import '../../shared/widgets/cart_button.dart';
import '../../shared/widgets/wishlist_button.dart';

class StoreScreen extends ConsumerStatefulWidget {
  final String slug;
  const StoreScreen({super.key, required this.slug});
  @override
  ConsumerState<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends ConsumerState<StoreScreen> {
  String? _catId; // null = All

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(storeProvider(widget.slug));
    return Scaffold(
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            Scaffold(appBar: AppBar(), body: Center(child: Text('$e'))),
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

    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          // Top bar
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 6, 0),
            child: Row(children: [
              IconButton(
                  icon: const Icon(Icons.arrow_back_rounded),
                  onPressed: () => Navigator.of(context).maybePop()),
              Expanded(
                  child: Text(s.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 18))),
              const WishlistButton(color: BrandColors.ink),
              const CartButton(color: BrandColors.ink),
            ]),
          ),
          // Cover carousel (compact, rounded)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 2, 12, 0),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(
                  height: 118, child: _CoverCarousel(images: s.coverImages)),
            ),
          ),
          // Info strip: logo + verified + count
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
            child: Row(children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(color: BrandColors.border)),
                clipBehavior: Clip.antiAlias,
                child: s.logo != null
                    ? CachedNetworkImage(imageUrl: s.logo!, fit: BoxFit.cover)
                    : Container(
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                            gradient: BrandColors.brandGradient),
                        child: Text(s.name.isNotEmpty ? s.name[0] : '?',
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900))),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      const Icon(Icons.verified_rounded,
                          size: 15, color: BrandColors.success),
                      const SizedBox(width: 3),
                      const Text('Verified',
                          style: TextStyle(
                              color: BrandColors.success,
                              fontSize: 12,
                              fontWeight: FontWeight.w700)),
                      const SizedBox(width: 8),
                      Text('${data.products.length} products',
                          style: const TextStyle(
                              color: BrandColors.textMuted, fontSize: 12)),
                    ]),
                    Text(
                        [
                          if (s.vendorType != null) s.vendorType,
                          if (s.address?['city'] != null) s.address!['city']
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: BrandColors.textMuted, fontSize: 12)),
                  ],
                ),
              ),
            ]),
          ),
          const Divider(height: 1),
          // Left category rail + product grid
          Expanded(
            child: leaves.isEmpty
                ? _grid(products)
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _rail(leaves),
                      Expanded(child: _grid(products)),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _grid(List<Product> products) {
    if (products.isEmpty) {
      return const Center(
          child: Text('No products here',
              style: TextStyle(color: BrandColors.textMuted)));
    }
    return GridView.builder(
      padding: const EdgeInsets.all(8),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.62,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8),
      itemCount: products.length,
      itemBuilder: (_, i) => ProductCard(product: products[i]),
    );
  }

  Widget _rail(List<CatNode> leaves) {
    return Container(
      width: 76,
      color: const Color(0xFFF0F7F2),
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: 5),
        children: [
          _railTile('All', null, _catId == null),
          for (final n in leaves) _railTile(n.name, n.id, _catId == n.id),
        ],
      ),
    );
  }

  Widget _railTile(String name, String? id, bool selected) {
    final b = context.brand;
    return GestureDetector(
      onTap: () => setState(() => _catId = id),
      child: Container(
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.transparent,
          border: Border(
              left: BorderSide(
                  color: selected ? b.primary : Colors.transparent, width: 3)),
        ),
        padding: const EdgeInsets.fromLTRB(5, 9, 5, 9),
        child: Text(name,
            maxLines: 3,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                fontSize: 10.5,
                height: 1.15,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? b.primaryDark : BrandColors.ink)),
      ),
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
          decoration: const BoxDecoration(gradient: BrandColors.brandGradient));
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        PageView.builder(
          controller: _ctrl,
          onPageChanged: (i) => setState(() => _page = i),
          itemCount: widget.images.length,
          itemBuilder: (_, i) =>
              CachedNetworkImage(imageUrl: widget.images[i], fit: BoxFit.cover),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Colors.black38]),
          ),
        ),
        if (widget.images.length > 1)
          Positioned(
            bottom: 8,
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
