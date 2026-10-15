import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../shared/widgets/store_favourite_card.dart';
import 'store_favourite_controller.dart';

/// Mirrors wishlist_screen.dart's shape exactly, for the store-favourites equivalent.
class FavouriteStoresScreen extends ConsumerWidget {
  const FavouriteStoresScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    final ids = ref.watch(favouriteStoresProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Favourite stores')),
      body: user == null
          ? _SignIn(onSignIn: () => context.push('/login'))
          : ref.watch(favouriteStoreVendorsProvider).when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: BrandColors.textMuted))),
              data: (stores) {
                final list = stores.where((s) => ids.contains(s.id)).toList();
                if (list.isEmpty) return const _Empty();
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
          const Icon(Icons.storefront_outlined, size: 52, color: BrandColors.textMuted),
          const SizedBox(height: 10),
          const Text('Sign in to see your favourite stores', style: TextStyle(fontWeight: FontWeight.w700)),
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
          Text('🏬', style: TextStyle(fontSize: 52)),
          SizedBox(height: 10),
          Text('No favourite stores yet', style: TextStyle(fontWeight: FontWeight.w700)),
          SizedBox(height: 4),
          Text('Tap the heart on any store to save it here', style: TextStyle(color: BrandColors.textMuted)),
        ]),
      );
}
