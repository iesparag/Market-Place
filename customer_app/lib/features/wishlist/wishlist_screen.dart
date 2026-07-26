import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/product.dart';
import '../../shared/widgets/product_card.dart';
import 'wishlist_controller.dart';

final _wishlistProductsProvider = FutureProvider.autoDispose<List<Product>>((ref) async {
  final data = await ref.read(apiClientProvider).get('/wishlist') as List;
  return data.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
});

class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    final ids = ref.watch(wishlistProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Wishlist')),
      body: user == null
          ? _SignIn(onSignIn: () => context.push('/login'))
          : ref.watch(_wishlistProductsProvider).when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: BrandColors.textMuted))),
              data: (products) {
                // Reflect live removals (heart toggled off) without refetching.
                final list = products.where((p) => ids.contains(p.id)).toList();
                if (list.isEmpty) return const _Empty();
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(_wishlistProductsProvider),
                  child: GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2, childAspectRatio: 0.58, crossAxisSpacing: 12, mainAxisSpacing: 12),
                    itemCount: list.length,
                    itemBuilder: (_, i) => ProductCard(product: list[i]),
                  ),
                );
              },
            ),
    );
  }
}

class _SignIn extends StatelessWidget {
  final VoidCallback onSignIn;
  const _SignIn({required this.onSignIn});
  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.favorite_border_rounded, size: 52, color: BrandColors.textMuted),
          const SizedBox(height: 10),
          const Text('Sign in to see your wishlist', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 14),
          ElevatedButton(onPressed: onSignIn, child: const Text('Sign in')),
        ]),
      );
}

class _Empty extends StatelessWidget {
  const _Empty();
  @override
  Widget build(BuildContext context) => const Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('🤍', style: TextStyle(fontSize: 52)),
          SizedBox(height: 10),
          Text('No saved items yet', style: TextStyle(fontWeight: FontWeight.w700)),
          SizedBox(height: 4),
          Text('Tap the heart on any product', style: TextStyle(color: BrandColors.textMuted)),
        ]),
      );
}
