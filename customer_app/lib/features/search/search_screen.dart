import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/suggestion.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  Suggestion? _sugg;
  bool _loading = false;

  void _onType(String v) {
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() => _sugg = null);
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      try {
        final r = await ref.read(catalogRepoProvider).suggest(v.trim());
        if (mounted) setState(() { _sugg = r; _loading = false; });
      } catch (_) {
        if (mounted) setState(() => _loading = false);
      }
    });
  }

  void _seeAll() {
    final q = _ctrl.text.trim();
    if (q.isNotEmpty) context.push('/catalog?q=${Uri.encodeComponent(q)}');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = _sugg;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _ctrl,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onChanged: _onType,
          onSubmitted: (_) => _seeAll(),
          style: const TextStyle(color: Colors.white),
          cursorColor: Colors.white,
          decoration: const InputDecoration(
            hintText: 'Search products, brands, stores…',
            hintStyle: TextStyle(color: Colors.white54),
            border: InputBorder.none, enabledBorder: InputBorder.none, focusedBorder: InputBorder.none,
            filled: false,
          ),
        ),
        actions: [IconButton(icon: const Icon(Icons.search), onPressed: _seeAll)],
      ),
      body: _loading && s == null
          ? const Center(child: CircularProgressIndicator())
          : s == null
              ? const _Hint()
              : (s.isEmpty
                  ? const Center(child: Text('No matches', style: TextStyle(color: BrandColors.textMuted)))
                  : ListView(
                      children: [
                        if (s.stores.isNotEmpty) ...[
                          const _GroupLabel('Stores'),
                          ...s.stores.map((st) => _StoreTile(store: st)),
                        ],
                        if (s.products.isNotEmpty) ...[
                          const _GroupLabel('Products'),
                          ...s.products.map((p) => _ProductTile(product: p)),
                        ],
                        ListTile(
                          title: Text('See all results for "${_ctrl.text.trim()}"',
                              style: const TextStyle(color: BrandColors.brand700, fontWeight: FontWeight.w700)),
                          trailing: const Icon(Icons.arrow_forward_rounded, color: BrandColors.brand700),
                          onTap: _seeAll,
                        ),
                      ],
                    )),
    );
  }
}

class _GroupLabel extends StatelessWidget {
  final String label;
  const _GroupLabel(this.label);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
        child: Text(label.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: BrandColors.textMuted, letterSpacing: 0.6)),
      );
}

class _StoreTile extends StatelessWidget {
  final SuggestStore store;
  const _StoreTile({required this.store});
  @override
  Widget build(BuildContext context) => ListTile(
        leading: CircleAvatar(
          backgroundColor: BrandColors.brand600,
          backgroundImage: store.logo != null ? CachedNetworkImageProvider(store.logo!) : null,
          child: store.logo == null ? Text(store.name.isNotEmpty ? store.name[0] : '?', style: const TextStyle(color: Colors.white)) : null,
        ),
        title: Text(store.name, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: const Text('Visit store'),
        onTap: () => context.push('/store/${store.slug}'),
      );
}

class _ProductTile extends StatelessWidget {
  final SuggestProduct product;
  const _ProductTile({required this.product});
  @override
  Widget build(BuildContext context) => ListTile(
        leading: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            width: 44, height: 44,
            child: product.image != null
                ? CachedNetworkImage(imageUrl: product.image!, fit: BoxFit.cover)
                : Container(color: const Color(0xFFF1F1F4), child: const Icon(Icons.image_outlined, size: 18)),
          ),
        ),
        title: Text(product.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('${product.storeName ?? ''} · ${rupees(product.minPrice)}'),
        onTap: () => context.push('/p/${product.slug}'),
      );
}

class _Hint extends StatelessWidget {
  const _Hint();
  @override
  Widget build(BuildContext context) => const Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.search_rounded, size: 48, color: BrandColors.textMuted),
          SizedBox(height: 8),
          Text('Search across all vendors', style: TextStyle(color: BrandColors.textMuted)),
        ]),
      );
}
