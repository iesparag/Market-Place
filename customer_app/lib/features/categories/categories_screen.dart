import 'package:flutter/material.dart';
import '../../shared/widgets/error_view.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/category.dart';
import '../../shared/category_emoji.dart';
import '../../shared/widgets/safe_pop_scope.dart';
import '../shell/app_shell.dart';

class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tree = ref.watch(categoryTreeProvider);
    return SafePopScope(
      child: Scaffold(
        appBar: AppBar(
          leading: const AppBackButton(),
          title: const Text('Categories'),
        ),
        body: tree.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(error: e),
          data: (nodes) => ListView(
            padding: const EdgeInsets.all(12),
            children: nodes.map((d) => _Department(node: d)).toList(),
          ),
        ),
        bottomNavigationBar: const AppBottomNav(),
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
      decoration: BoxDecoration(
          color: context.colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.colors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            leading: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                  color: const Color(0xFFE7F6EC),
                  borderRadius: BorderRadius.circular(12)),
              alignment: Alignment.center,
              child: Text(categoryEmoji(node.slug),
                  style: const TextStyle(fontSize: 22)),
            ),
            title: Text(node.name,
                style:
                    const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => context.push(
                '/catalog?dept=${node.slug}&title=${Uri.encodeComponent(node.name)}'),
          ),
          if (node.children.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: node.children
                    .map((c) => ActionChip(
                          label: Text(c.name),
                          backgroundColor: context.colors.bg,
                          side: BorderSide(color: context.colors.border),
                          onPressed: () => context.push(
                              '/catalog?category=${Uri.encodeComponent([
                            node.slug,
                            ...c.allSlugs
                          ].join(","))}&title=${Uri.encodeComponent(c.name)}'),
                        ))
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }
}
