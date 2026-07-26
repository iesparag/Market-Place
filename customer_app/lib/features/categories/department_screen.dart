import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/category.dart';
import '../../shared/widgets/cart_button.dart';
import '../../shared/widgets/wishlist_button.dart';

const _emoji = {
  'shirts': '👔',
  'jeans': '👖',
  't-shirts': '👕',
  'kurtis': '🥻',
  'sarees': '🥻',
  'dresses': '👗',
  'boys-clothing': '👦',
  'girls-clothing': '👧',
  'toys': '🧸',
  'smartphones': '📱',
  'laptops': '💻',
  'audio': '🎧',
  'wrist-watches': '⌚',
  'medicines': '💊',
  'wellness-otc': '🌿',
  'pizza': '🍕',
  'burgers-wraps': '🍔',
  'biryani': '🍛',
  'dals-pulses': '🫘',
  'spices-masala': '🌶️',
  'atta-flour': '🌾',
  'edible-oil': '🛢️',
  'rice-grains': '🍚',
};

/// Drill-in from "Shop by department" → shows THIS department's sub-categories.
class DepartmentScreen extends ConsumerWidget {
  final String slug;
  const DepartmentScreen({super.key, required this.slug});

  CatNode? _find(List<CatNode> nodes, String slug) {
    for (final n in nodes) {
      if (n.slug == slug) return n;
      final f = _find(n.children, slug);
      if (f != null) return f;
    }
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tree = ref.watch(categoryTreeProvider);
    return Scaffold(
      appBar: AppBar(actions: const [WishlistButton(), CartButton()]),
      body: tree.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
            child: Text('$e',
                style: const TextStyle(color: BrandColors.textMuted))),
        data: (nodes) {
          final dept = _find(nodes, slug);
          if (dept == null) return const Center(child: Text('Not found'));
          final leaves = dept.children;
          return CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(dept.name,
                          style: const TextStyle(
                              fontSize: 24, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      GestureDetector(
                        onTap: () => context.push(
                            '/catalog?category=${Uri.encodeComponent(dept.allSlugs.join(","))}&title=${Uri.encodeComponent("All ${dept.name}")}'),
                        child: const Row(children: [
                          Text('View all products',
                              style: TextStyle(
                                  color: BrandColors.brand700,
                                  fontWeight: FontWeight.w700)),
                          Icon(Icons.arrow_forward_rounded,
                              size: 16, color: BrandColors.brand700),
                        ]),
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      childAspectRatio: 0.82,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10),
                  delegate: SliverChildBuilderDelegate(
                    (_, i) {
                      final c = leaves[i];
                      return GestureDetector(
                        onTap: () => context.push(
                            '/catalog?category=${Uri.encodeComponent([
                          dept.slug,
                          ...c.allSlugs
                        ].join(","))}&title=${Uri.encodeComponent(c.name)}'),
                        child: Column(
                          children: [
                            Expanded(
                              child: Container(
                                width: double.infinity,
                                decoration: BoxDecoration(
                                    color: const Color(0xFFE7F6EC),
                                    borderRadius: BorderRadius.circular(16)),
                                alignment: Alignment.center,
                                child: Text(_emoji[c.slug] ?? '🛍️',
                                    style: const TextStyle(fontSize: 34)),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(c.name,
                                maxLines: 2,
                                textAlign: TextAlign.center,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 12, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      );
                    },
                    childCount: leaves.length,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
