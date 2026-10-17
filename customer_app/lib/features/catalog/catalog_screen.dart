import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/product.dart';
import '../../models/category.dart';
import '../../shared/widgets/product_card.dart';
import '../../shared/widgets/shimmer.dart';
import '../../shared/widgets/cart_button.dart';
import '../../shared/widgets/wishlist_button.dart';
import '../../shared/widgets/search_bar_pill.dart';
import '../../shared/category_emoji.dart';
import '../../shared/widgets/edge_handle.dart';
import '../../shared/widgets/safe_pop_scope.dart';
import '../shell/app_shell.dart';

class PriceBand {
  final String label;
  final int? min, max;
  const PriceBand(this.label, {this.min, this.max});
}

const _bands = [
  PriceBand('Under ₹200', max: 20000),
  PriceBand('₹200 – ₹500', min: 20000, max: 50000),
  PriceBand('₹500 – ₹1000', min: 50000, max: 100000),
  PriceBand('Over ₹1000', min: 100000),
];

class CatalogScreen extends ConsumerStatefulWidget {
  final String? category;
  final String? dept; // department slug → BigBasket-style left category rail
  final String? sort;
  final String? q;
  final String? title;
  final bool searchable; // Products tab → show a search bar instead of a title
  /// Comma-separated product IDs — set when this screen is opened from a push
  /// notification's "product showcase" layout (see notifications.module.ts's notify())
  /// so the exact attached products show, pinned in that order, ignoring every other
  /// filter — the closest a single-image native notification can get to "the carousel
  /// I attached is what you see when you tap."
  final String? products;
  const CatalogScreen(
      {super.key,
      this.category,
      this.dept,
      this.sort,
      this.q,
      this.title,
      this.searchable = false,
      this.products});

  @override
  ConsumerState<CatalogScreen> createState() => _CatalogScreenState();
}

/// A leaf category shown in the left rail.
class _RailItem {
  final String name;
  final String slug;
  final String allSlugs; // this leaf + descendants, comma-joined
  const _RailItem(this.name, this.slug, this.allSlugs);
}

class _CatalogScreenState extends ConsumerState<CatalogScreen> {
  final _scroll = ScrollController();
  final _items = <Product>[];
  // Left category rail (leaf categories) — department browse AND the Products tab.
  final _rail = <_RailItem>[];
  String? _railSlug; // null = "All"
  String _deptAll = '';
  int _page = 1;
  bool _loading = false;
  bool _hasMore = true;
  late String _sort = widget.sort ?? 'popularity';
  bool _veg = false;
  int _bandIndex = -1;
  int _ratingMin = 0;

  bool get _deptMode => widget.dept != null;
  bool get _showRail =>
      widget.q == null && _rail.isNotEmpty; // no rail on search results

  String? get _effectiveCategory {
    if (_railSlug == null) {
      return (_deptMode && _deptAll.isNotEmpty) ? _deptAll : null;
    }
    final m = _rail.where((r) => r.slug == _railSlug);
    return m.isNotEmpty
        ? m.first.allSlugs
        : ((_deptMode && _deptAll.isNotEmpty) ? _deptAll : null);
  }

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 1200) {
        _loadMore();
      }
    });
    // A department screen must wait for the category tree before loading, so the
    // filter (_deptAll = this dept + all its sub-categories) is known. Loading
    // early would fire an UNFILTERED query first and show products from every
    // department (e.g. clothing under "Food"), and the `if (_loading) return`
    // guard would then drop the correctly-filtered reload. Non-dept screens
    // (Products tab, search) have no such dependency → load immediately.
    if (!_deptMode) _load(reset: true);
    // Build the left rail from leaf categories. Department → its leaves; else → all leaves.
    ref.read(catalogRepoProvider).categoryTree().then((tree) {
      if (!mounted) return;
      setState(() {
        _rail.clear();
        if (_deptMode) {
          final node = _findNode(tree, widget.dept!);
          if (node != null) {
            _deptAll = node.allSlugs.join(',');
            _rail.addAll(_leaves([node])
                .map((n) => _RailItem(n.name, n.slug, n.allSlugs.join(','))));
          }
        } else {
          _rail.addAll(_leaves(tree)
              .map((n) => _RailItem(n.name, n.slug, n.allSlugs.join(','))));
        }
      });
      if (_deptMode) {
        _load(
            reset:
                true); // now that _deptAll is set, load the filtered products
      }
    }).catchError((Object _) {
      if (_deptMode && mounted) _load(reset: true); // fallback: don't get stuck
    });
  }

  CatNode? _findNode(List<CatNode> nodes, String slug) {
    for (final n in nodes) {
      if (n.slug == slug) return n;
      final f = _findNode(n.children, slug);
      if (f != null) return f;
    }
    return null;
  }

  /// Flatten to leaf categories (nodes with no children).
  List<CatNode> _leaves(List<CatNode> nodes) {
    final out = <CatNode>[];
    void walk(CatNode n) =>
        n.children.isEmpty ? out.add(n) : n.children.forEach(walk);
    nodes.forEach(walk);
    return out;
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({required bool reset}) async {
    if (_loading) return;
    setState(() => _loading = true);
    if (reset) {
      _page = 1;
      _hasMore = true;
    }
    final band = _bandIndex >= 0 ? _bands[_bandIndex] : null;
    try {
      final pinnedIds = widget.products
          ?.split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      final rows = await ref.read(catalogRepoProvider).products(
            q: widget.q,
            category: _effectiveCategory,
            sort: _sort,
            priceMin: band?.min,
            priceMax: band?.max,
            ratingMin: _ratingMin,
            veg: _veg,
            page: _page,
            limit: Config.pageSize,
            ids: (pinnedIds != null && pinnedIds.isNotEmpty) ? pinnedIds : null,
          );
      setState(() {
        if (reset) _items.clear();
        _items.addAll(rows);
        _hasMore = rows.length == Config.pageSize;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _loadMore() {
    if (_loading || !_hasMore) return;
    _page++;
    _load(reset: false);
  }

  String get _heading =>
      widget.title ??
      (widget.q != null ? 'Results for "${widget.q}"' : 'All products');

  @override
  Widget build(BuildContext context) {
    final showSkeleton = _loading && _items.isNotEmpty;
    final count = _items.length + (showSkeleton ? 4 : 0);
    final scaffold = Scaffold(
      appBar: AppBar(
        leading: widget.searchable ? null : const AppBackButton(),
        titleSpacing: widget.searchable ? 12 : null,
        title: widget.searchable
            ? const SearchBarPill()
            : Text(_heading, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
              icon: const Icon(Icons.tune_rounded), onPressed: _openFilters),
          const WishlistButton(),
          const CartButton(),
        ],
      ),
      body: _showRail
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _leftRail(),
                Expanded(child: _body(count)),
              ],
            )
          : _body(count),
      bottomNavigationBar:
          widget.searchable ? null : const AppBottomNav(activeTab: 'Products'),
    );

    if (widget.searchable) return scaffold;
    return SafePopScope(child: scaffold);
  }

  Widget _body(int count) {
    // In dept mode we hold off the first load until the tree resolves; show a
    // skeleton meanwhile instead of a flash of "No products here yet".
    final bootstrapping = _deptMode && _deptAll.isEmpty;
    if ((_loading || bootstrapping) && _items.isEmpty) {
      return GridView.builder(
        padding: const EdgeInsets.all(8),
        gridDelegate: _grid,
        itemCount: 6,
        itemBuilder: (_, __) => const ProductCardSkeleton(),
      );
    }
    if (_items.isEmpty) {
      return Center(
          child: Text('No products here yet.',
              style: TextStyle(color: context.colors.textMuted)));
    }
    return RefreshIndicator(
      onRefresh: () => _load(reset: true),
      child: GridView.builder(
        controller: _scroll,
        padding: const EdgeInsets.all(8),
        gridDelegate: _grid,
        itemCount: count,
        itemBuilder: (_, i) => i >= _items.length
            ? const ProductCardSkeleton()
            : ProductCard(product: _items[i]),
      ),
    );
  }

  // ── BigBasket-style left category rail (department mode + Products tab) ──────
  // Collapsible: on smaller screens the rail eats a lot of width that the product
  // grid could use — toggle it down to a thin strip without losing category access.
  bool _railCollapsed = false;

  Widget _leftRail() {
    if (_railCollapsed) {
      return GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => setState(() => _railCollapsed = false),
        onHorizontalDragUpdate: (d) {
          if (d.delta.dx > 3) setState(() => _railCollapsed = false);
        },
        onHorizontalDragEnd: (d) {
          if ((d.primaryVelocity ?? 0) > 50)
            setState(() => _railCollapsed = false);
        },
        child: Container(
          width: 16,
          color: context.colors.bg,
          alignment: Alignment.center,
          child: const EdgeHandle(collapsed: true),
        ),
      );
    }
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragUpdate: (d) {
        if (d.delta.dx < -3) setState(() => _railCollapsed = true);
      },
      onHorizontalDragEnd: (d) {
        if ((d.primaryVelocity ?? 0) < -50)
          setState(() => _railCollapsed = true);
      },
      child: SizedBox(
        width: 86,
        child: Stack(
          children: [
            Container(
              margin: const EdgeInsets.only(right: 14),
              color: context.colors.bg,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(0, 12, 0, 12),
                children: [
                  _railTile('All', null, _railSlug == null),
                  for (final r in _rail)
                    _railTile(r.name, r.slug, _railSlug == r.slug),
                ],
              ),
            ),
            // Edge handle — tap OR swipe to collapse, styled like Samsung Edge pull tab
            Positioned(
              right: 0,
              top: 0,
              bottom: 0,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => setState(() => _railCollapsed = true),
                onHorizontalDragUpdate: (d) {
                  if (d.delta.dx < -3) setState(() => _railCollapsed = true);
                },
                onHorizontalDragEnd: (d) {
                  if ((d.primaryVelocity ?? 0) < -50)
                    setState(() => _railCollapsed = true);
                },
                child: Container(
                  width: 22,
                  color: Colors.transparent,
                  alignment: Alignment.center,
                  child: const EdgeHandle(collapsed: false),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _railTile(String name, String? slug, bool selected) {
    final b = context.brand;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        if (_railSlug != slug) {
          setState(() => _railSlug = slug);
          _scroll.hasClients ? _scroll.jumpTo(0) : null;
          _load(reset: true);
        }
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 4),
        decoration: BoxDecoration(
          color: selected ? context.colors.surface : Colors.transparent,
          border: Border(
              left: BorderSide(
                  color: selected ? b.primary : Colors.transparent, width: 3)),
        ),
        child: Column(
          children: [
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: selected ? b.soft : context.colors.surface,
                shape: BoxShape.circle,
                border: Border.all(
                    color: selected
                        ? Color.lerp(b.soft, b.primary, 0.35)!
                        : context.colors.border),
              ),
              alignment: Alignment.center,
              child: Text(categoryEmoji(slug),
                  style: const TextStyle(fontSize: 21)),
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
                    color: selected ? b.primaryDark : context.colors.ink)),
          ],
        ),
      ),
    );
  }

  static const _grid = SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: 2,
    childAspectRatio: 0.62,
    crossAxisSpacing: 8,
    mainAxisSpacing: 8,
  );

  void _openFilters() {
    showModalBottomSheet(
      context: context,
      backgroundColor: context.colors.surface,
      isScrollControlled: true, // lets the sheet grow + scroll (no overflow)
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => StatefulBuilder(
        builder: (context, setSheet) {
          void refresh(VoidCallback fn) => setSheet(fn);
          return DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.7,
            maxChildSize: 0.92,
            minChildSize: 0.4,
            builder: (context, controller) => SingleChildScrollView(
              controller: controller,
              padding: EdgeInsets.fromLTRB(
                  20, 16, 20, 20 + MediaQuery.of(context).padding.bottom),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                      child: Container(
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                              color: context.colors.border,
                              borderRadius: BorderRadius.circular(2)))),
                  const SizedBox(height: 14),
                  Text('Filters & sort',
                      style: TextStyle(
                          color: context.colors.ink,
                          fontWeight: FontWeight.w800,
                          fontSize: 18)),
                  const SizedBox(height: 14),
                  Text('Sort by',
                      style: TextStyle(
                          color: context.colors.ink,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, children: [
                    for (final s in const [
                      ['Popular', 'popularity'],
                      ['Top rated', 'rating'],
                      ['Newest', 'newest'],
                      ['Price ↑', 'price_asc'],
                      ['Price ↓', 'price_desc']
                    ])
                      ChoiceChip(
                          label: Text(s[0]),
                          selected: _sort == s[1],
                          onSelected: (_) => refresh(() => _sort = s[1])),
                  ]),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Veg only',
                        style: TextStyle(
                            color: context.colors.ink,
                            fontWeight: FontWeight.w700)),
                    value: _veg,
                    activeThumbColor: context.colors.success,
                    onChanged: (v) => refresh(() => _veg = v),
                  ),
                  Text('Price',
                      style: TextStyle(
                          color: context.colors.ink,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, children: [
                    ChoiceChip(
                        label: const Text('Any'),
                        selected: _bandIndex == -1,
                        onSelected: (_) => refresh(() => _bandIndex = -1)),
                    for (var i = 0; i < _bands.length; i++)
                      ChoiceChip(
                          label: Text(_bands[i].label),
                          selected: _bandIndex == i,
                          onSelected: (_) => refresh(() => _bandIndex = i)),
                  ]),
                  const SizedBox(height: 12),
                  Text('Rating',
                      style: TextStyle(
                          color: context.colors.ink,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, children: [
                    ChoiceChip(
                        label: const Text('Any'),
                        selected: _ratingMin == 0,
                        onSelected: (_) => refresh(() => _ratingMin = 0)),
                    ChoiceChip(
                        label: const Text('4★ & up'),
                        selected: _ratingMin == 4,
                        onSelected: (_) => refresh(() => _ratingMin = 4)),
                    ChoiceChip(
                        label: const Text('3★ & up'),
                        selected: _ratingMin == 3,
                        onSelected: (_) => refresh(() => _ratingMin = 3)),
                  ]),
                  const SizedBox(height: 18),
                  Row(children: [
                    SizedBox(
                      height: 48,
                      child: OutlinedButton(
                        onPressed: () => refresh(() {
                          _sort = 'popularity';
                          _veg = false;
                          _bandIndex = -1;
                          _ratingMin = 0;
                          _railSlug = null;
                        }),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          side: BorderSide(color: context.colors.border),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(13)),
                        ),
                        child: const Text('Reset'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: SizedBox(
                        height: 48,
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.pop(context);
                            _load(reset: true);
                          },
                          icon: const Icon(Icons.check_rounded, size: 19),
                          label: const Text('Apply filters'),
                        ),
                      ),
                    ),
                  ]),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
