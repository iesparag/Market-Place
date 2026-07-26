import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/category.dart';

const _emoji = {
  'food-beverages': '🍔', 'food': '🍔', 'grocery-dept': '🛒', 'kirana-grocery': '🛒',
  'fashion': '👗', 'electronics': '📱', 'home-kitchen': '🍳', 'beauty': '💄', 'pharmacy': '💊', 'watches': '⌚',
};

class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tree = ref.watch(categoryTreeProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Categories')),
      body: tree.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: BrandColors.textMuted))),
        data: (nodes) => ListView(
          padding: const EdgeInsets.all(12),
          children: nodes.map((d) => _Department(node: d)).toList(),
        ),
      ),
    );
  }
}

class _Department extends StatelessWidget {
  final CatNode node;
  const _Department({required this.node});
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: BrandColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            leading: Container(
              width: 44, height: 44,
              decoration: BoxDecoration(color: const Color(0xFFFFF1E9), borderRadius: BorderRadius.circular(12)),
              alignment: Alignment.center,
              child: Text(_emoji[node.slug] ?? '🛍️', style: const TextStyle(fontSize: 22)),
            ),
            title: Text(node.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => context.push('/department/${node.slug}'),
          ),
          if (node.children.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Wrap(
                spacing: 8, runSpacing: 8,
                children: node.children.map((c) => ActionChip(
                  label: Text(c.name),
                  backgroundColor: BrandColors.bg,
                  side: const BorderSide(color: BrandColors.border),
                  onPressed: () => context.push('/catalog?category=${Uri.encodeComponent([node.slug, ...c.allSlugs].join(","))}&title=${Uri.encodeComponent(c.name)}'),
                )).toList(),
              ),
            ),
        ],
      ),
    );
  }
}
