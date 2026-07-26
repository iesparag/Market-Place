import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../data/catalog_repository.dart';
import '../../shared/widgets/product_card.dart';

class StoreScreen extends ConsumerWidget {
  final String slug;
  const StoreScreen({super.key, required this.slug});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(storeProvider(slug));
    return Scaffold(
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Scaffold(appBar: AppBar(), body: Center(child: Text('$e'))),
        data: (data) => _content(context, data),
      ),
    );
  }

  Widget _content(BuildContext context, StorePageData data) {
    final s = data.profile;
    final cover = s.coverImages.isNotEmpty ? s.coverImages.first : null;
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          expandedHeight: 180,
          pinned: true,
          backgroundColor: BrandColors.ink,
          flexibleSpace: FlexibleSpaceBar(
            background: cover != null
                ? CachedNetworkImage(imageUrl: cover, fit: BoxFit.cover)
                : Container(decoration: const BoxDecoration(gradient: BrandColors.brandGradient)),
          ),
        ),
        SliverToBoxAdapter(
          child: Transform.translate(
            offset: const Offset(0, -30),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        width: 76, height: 76,
                        decoration: BoxDecoration(
                          color: Colors.white, borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: Colors.white, width: 3), boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 12)],
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: s.logo != null
                            ? CachedNetworkImage(imageUrl: s.logo!, fit: BoxFit.cover)
                            : Container(alignment: Alignment.center, decoration: const BoxDecoration(gradient: BrandColors.brandGradient), child: Text(s.name.isNotEmpty ? s.name[0] : '?', style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w900))),
                      ),
                      const SizedBox(width: 12),
                      const Padding(
                        padding: EdgeInsets.only(bottom: 6),
                        child: Chip(
                          label: Text('Verified seller', style: TextStyle(color: BrandColors.success, fontSize: 12, fontWeight: FontWeight.w700)),
                          backgroundColor: Color(0xFFE7F8EE), side: BorderSide(color: Color(0xFF86EFAC)),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(s.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                  if (s.vendorType != null)
                    Text(s.vendorType!, style: const TextStyle(color: BrandColors.textMuted)),
                  if (s.description != null && s.description!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(s.description!, style: const TextStyle(color: BrandColors.textMuted, height: 1.4)),
                  ],
                  if (s.address != null && (s.address!['city'] != null))
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Row(children: [
                        const Icon(Icons.location_on_outlined, size: 16, color: BrandColors.textMuted),
                        const SizedBox(width: 4),
                        Text('${s.address!['city']}, ${s.address!['state'] ?? ''}', style: const TextStyle(color: BrandColors.textMuted, fontSize: 13)),
                      ]),
                    ),
                  const SizedBox(height: 16),
                  Text('${data.products.length} products', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                ],
              ),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2, childAspectRatio: 0.58, crossAxisSpacing: 12, mainAxisSpacing: 12),
            delegate: SliverChildBuilderDelegate(
              (_, i) => ProductCard(product: data.products[i]),
              childCount: data.products.length,
            ),
          ),
        ),
      ],
    );
  }
}
