import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/product.dart';
import '../../shared/widgets/product_card.dart';
import '../../shared/widgets/shimmer.dart';

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
  const CatalogScreen({super.key, this.category, this.sort, this.q, this.title});

  @override
  ConsumerState<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends ConsumerState<CatalogScreen> {
  final _scroll = ScrollController();
  final _items = <Product>[];
  int _page = 1;
  bool _loading = false;
  bool _hasMore = true;
  late String _sort = widget.sort ?? 'popularity';
  bool _veg = false;
  int _bandIndex = -1;
  int _ratingMin = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 1200) _loadMore();
    });
    _load(reset: true);
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
            category: widget.category,
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
        title: Text(_heading, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(icon: const Icon(Icons.tune_rounded), onPressed: _openFilters),
        ],
      ),
      body: _loading && _items.isEmpty
          ? GridView.builder(
              padding: const EdgeInsets.all(12),
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
                    padding: const EdgeInsets.all(12),
                    gridDelegate: _grid,
                    itemCount: count,
                    itemBuilder: (_, i) => i >= _items.length
                        ? const ProductCardSkeleton()
                        : ProductCard(product: _items[i]),
                  ),
                ),
    );
  }

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
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => StatefulBuilder(
        builder: (context, setSheet) {
          void refresh(VoidCallback fn) { setSheet(fn); }
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Filters & sort', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                const SizedBox(height: 14),
                const Text('Sort by', style: TextStyle(fontWeight: FontWeight.w700)),
                Wrap(spacing: 8, children: [
                  for (final s in const [['Popular', 'popularity'], ['Top rated', 'rating'], ['Newest', 'newest'], ['Price ↑', 'price_asc'], ['Price ↓', 'price_desc']])
                    ChoiceChip(label: Text(s[0]), selected: _sort == s[1], onSelected: (_) => refresh(() => _sort = s[1])),
                ]),
                const SizedBox(height: 12),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Veg only', style: TextStyle(fontWeight: FontWeight.w700)),
                  value: _veg,
                  activeThumbColor: BrandColors.success,
                  onChanged: (v) => refresh(() => _veg = v),
                ),
                const Text('Price', style: TextStyle(fontWeight: FontWeight.w700)),
                Wrap(spacing: 8, children: [
                  ChoiceChip(label: const Text('Any'), selected: _bandIndex == -1, onSelected: (_) => refresh(() => _bandIndex = -1)),
                  for (var i = 0; i < _bands.length; i++)
                    ChoiceChip(label: Text(_bands[i].label), selected: _bandIndex == i, onSelected: (_) => refresh(() => _bandIndex = i)),
                ]),
                const SizedBox(height: 12),
                const Text('Rating', style: TextStyle(fontWeight: FontWeight.w700)),
                Wrap(spacing: 8, children: [
                  ChoiceChip(label: const Text('Any'), selected: _ratingMin == 0, onSelected: (_) => refresh(() => _ratingMin = 0)),
                  ChoiceChip(label: const Text('4★ & up'), selected: _ratingMin == 4, onSelected: (_) => refresh(() => _ratingMin = 4)),
                  ChoiceChip(label: const Text('3★ & up'), selected: _ratingMin == 3, onSelected: (_) => refresh(() => _ratingMin = 3)),
                ]),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () { Navigator.pop(context); _load(reset: true); },
                    child: const Text('Apply'),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
