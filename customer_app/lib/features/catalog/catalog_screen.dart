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
import '../../shared/widgets/search_bar_pill.dart';

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
  final String? sort;
  final String? q;
  final String? title;
  final bool searchable; // Products tab → show a search bar instead of a title
  const CatalogScreen({super.key, this.category, this.sort, this.q, this.title, this.searchable = false});

  @override
  ConsumerState<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends ConsumerState<CatalogScreen> {
  final _scroll = ScrollController();
  final _items = <Product>[];
  final _cats = <CategoryLite>[];
  // Seeded from the route so a department's category arrives pre-selected in the filter.
  late final List<String> _selectedCats =
      widget.category?.split(',').where((s) => s.trim().isNotEmpty).toList() ?? [];
  int _page = 1;
  bool _loading = false;
  bool _hasMore = true;
  late String _sort = widget.sort ?? 'popularity';
  bool _veg = false;
  int _bandIndex = -1;
  int _ratingMin = 0;

  String? get _effectiveCategory => _selectedCats.isEmpty ? null : _selectedCats.join(',');

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 1200) _loadMore();
    });
    _load(reset: true);
    ref.read(catalogRepoProvider).categories().then((c) {
      if (mounted) setState(() => _cats..clear()..addAll(c));
    }).catchError((Object _) {});
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

  String get _heading => widget.title ?? (widget.q != null ? 'Results for "${widget.q}"' : 'All products');

  @override
  Widget build(BuildContext context) {
    final showSkeleton = _loading && _items.isNotEmpty;
    final count = _items.length + (showSkeleton ? 4 : 0);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: widget.searchable ? 12 : null,
        title: widget.searchable
            ? const SearchBarPill()
            : Text(_heading, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(icon: const Icon(Icons.tune_rounded), onPressed: _openFilters),
          const CartButton(),
        ],
      ),
      body: Column(
        children: [
          if (_cats.isNotEmpty) _categoryBar(),
          Expanded(
            child: _loading && _items.isEmpty
                ? GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate: _grid,
                    itemCount: 6,
                    itemBuilder: (_, __) => const ProductCardSkeleton(),
                  )
                : _items.isEmpty
                    ? const Center(child: Text('No products match these filters.', style: TextStyle(color: BrandColors.textMuted)))
                    : RefreshIndicator(
                        onRefresh: () => _load(reset: true),
                        child: GridView.builder(
                          controller: _scroll,
                          padding: const EdgeInsets.all(16),
                          gridDelegate: _grid,
                          itemCount: count,
                          itemBuilder: (_, i) => i >= _items.length
                              ? const ProductCardSkeleton()
                              : ProductCard(product: _items[i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  /// Horizontal category filter shown ON the products screen (easy to reach, not buried in filters).
  Widget _categoryBar() {
    return Container(
      decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: BrandColors.border))),
      child: SizedBox(
        height: 48,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          itemCount: _cats.length + 1,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, i) {
            if (i == 0) {
              final all = _selectedCats.isEmpty;
              return _chip('All', all, () { setState(() => _selectedCats.clear()); _load(reset: true); });
            }
            final c = _cats[i - 1];
            final sel = _selectedCats.contains(c.slug);
            return _chip(c.name, sel, () {
              setState(() => sel ? _selectedCats.remove(c.slug) : _selectedCats.add(c.slug));
              _load(reset: true);
            });
          },
        ),
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 15),
          decoration: BoxDecoration(
            color: selected ? BrandColors.brand600 : BrandColors.bg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? BrandColors.brand600 : BrandColors.border),
          ),
          child: Text(label, style: TextStyle(color: selected ? Colors.white : BrandColors.ink, fontWeight: FontWeight.w600, fontSize: 13)),
        ),
      );

  static const _grid = SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: 2,
    childAspectRatio: 0.58,
    crossAxisSpacing: 12,
    mainAxisSpacing: 12,
  );

  void _openFilters() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true, // lets the sheet grow + scroll (no overflow)
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
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
              padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.of(context).padding.bottom),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: BrandColors.border, borderRadius: BorderRadius.circular(2)))),
                  const SizedBox(height: 14),
                  const Text('Filters & sort', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                  const SizedBox(height: 14),
                  const Text('Sort by', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, children: [
                    for (final s in const [['Popular', 'popularity'], ['Top rated', 'rating'], ['Newest', 'newest'], ['Price ↑', 'price_asc'], ['Price ↓', 'price_desc']])
                      ChoiceChip(label: Text(s[0]), selected: _sort == s[1], onSelected: (_) => refresh(() => _sort = s[1])),
                  ]),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Veg only', style: TextStyle(fontWeight: FontWeight.w700)),
                    value: _veg,
                    activeThumbColor: BrandColors.success,
                    onChanged: (v) => refresh(() => _veg = v),
                  ),
                  const Text('Price', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, children: [
                    ChoiceChip(label: const Text('Any'), selected: _bandIndex == -1, onSelected: (_) => refresh(() => _bandIndex = -1)),
                    for (var i = 0; i < _bands.length; i++)
                      ChoiceChip(label: Text(_bands[i].label), selected: _bandIndex == i, onSelected: (_) => refresh(() => _bandIndex = i)),
                  ]),
                  const SizedBox(height: 12),
                  const Text('Rating', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, children: [
                    ChoiceChip(label: const Text('Any'), selected: _ratingMin == 0, onSelected: (_) => refresh(() => _ratingMin = 0)),
                    ChoiceChip(label: const Text('4★ & up'), selected: _ratingMin == 4, onSelected: (_) => refresh(() => _ratingMin = 4)),
                    ChoiceChip(label: const Text('3★ & up'), selected: _ratingMin == 3, onSelected: (_) => refresh(() => _ratingMin = 3)),
                  ]),
                  const SizedBox(height: 18),
                  Row(children: [
                    TextButton(
                      onPressed: () => refresh(() { _sort = 'popularity'; _veg = false; _bandIndex = -1; _ratingMin = 0; _selectedCats.clear(); }),
                      child: const Text('Reset'),
                    ),
                    const Spacer(),
                    ElevatedButton(
                      onPressed: () { Navigator.pop(context); _load(reset: true); },
                      child: const Text('Apply filters'),
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
