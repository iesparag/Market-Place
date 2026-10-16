import 'package:flutter/material.dart';
import '../../shared/widgets/error_view.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/product.dart';
import '../../shared/widgets/product_card.dart';
import '../../shared/widgets/store_favourite_card.dart';
import '../wishlist/wishlist_controller.dart';
import 'store_favourite_controller.dart';

final _wishlistProductsProvider = FutureProvider.autoDispose<List<Product>>((ref) async {
  final data = await ref.read(apiClientProvider).get('/wishlist') as List;
  return data.map((e) => Product.fromJson(e as Map<String, dynamic>)).toList();
});

/// Bottom-nav "Favourites" tab — one screen, two sub-tabs (Items / Stores), so a
/// customer doesn't have to remember two separate destinations for "things I saved."
/// Replaces the old split WishlistScreen + FavouriteStoresScreen as a nav entry; both
/// screens still exist and work standalone (reached via the heart icon on product/store
/// cards elsewhere in the app) — this just gives saved items AND saved stores one home.
class FavouritesScreen extends StatelessWidget {
  const FavouritesScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Favourites'),
          bottom: const TabBar(
            tabs: [Tab(text: 'Items'), Tab(text: 'Stores')],
          ),
        ),
        body: const TabBarView(
          children: [_ItemsTab(), _StoresTab()],
        ),
      ),
    );
  }
}

class _ItemsTab extends ConsumerWidget {
  const _ItemsTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    final ids = ref.watch(wishlistProvider);
    if (user == null) {
      return _SignIn(
        icon: Icons.favorite_border_rounded,
        message: 'Sign in to see your saved items',
        onSignIn: () => context.push('/login'),
      );
    }
    return ref.watch(_wishlistProductsProvider).when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(error: e),
          data: (products) {
            final list = products.where((p) => ids.contains(p.id)).toList();
            if (list.isEmpty) {
              return const _Empty(
                emoji: '🤍',
                title: 'No saved items yet',
                subtitle: 'Tap the heart on any product',
              );
            }
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
        );
  }
}

class _StoresTab extends ConsumerWidget {
  const _StoresTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    final ids = ref.watch(favouriteStoresProvider);
    if (user == null) {
      return _SignIn(
        icon: Icons.storefront_outlined,
        message: 'Sign in to see your favourite stores',
        onSignIn: () => context.push('/login'),
      );
    }
    return ref.watch(favouriteStoreVendorsProvider).when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(error: e),
          data: (stores) {
            final list = stores.where((s) => ids.contains(s.id)).toList();
            if (list.isEmpty) {
              return const _Empty(
                emoji: '🏬',
                title: 'No favourite stores yet',
                subtitle: 'Tap the heart on any store to save it here',
              );
            }
            return RefreshIndicator(
              onRefresh: () async => ref.invalidate(favouriteStoreVendorsProvider),
              child: GridView.builder(
                padding: const EdgeInsets.all(14),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2, childAspectRatio: 0.82, crossAxisSpacing: 12, mainAxisSpacing: 12),
                itemCount: list.length,
                itemBuilder: (_, i) => StoreFavouriteCard(vendor: list[i]),
              ),
            );
          },
        );
  }
}

class _SignIn extends StatelessWidget {
  final IconData icon;
  final String message;
  final VoidCallback onSignIn;
  const _SignIn({required this.icon, required this.message, required this.onSignIn});
  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 52, color: BrandColors.textMuted),
          const SizedBox(height: 10),
          Text(message, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 14),
          ElevatedButton(onPressed: onSignIn, child: const Text('Sign in')),
        ]),
      );
}

class _Empty extends StatelessWidget {
  final String emoji;
  final String title;
  final String subtitle;
  const _Empty({required this.emoji, required this.title, required this.subtitle});
  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(emoji, style: const TextStyle(fontSize: 52)),
          const SizedBox(height: 10),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(subtitle, style: const TextStyle(color: BrandColors.textMuted)),
        ]),
      );
}
