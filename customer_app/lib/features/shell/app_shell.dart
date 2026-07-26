import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/theme.dart';
import '../home/home_screen.dart';
import '../stores/stores_list_screen.dart';
import '../catalog/catalog_screen.dart';
import '../account/account_screen.dart';

/// Selected bottom-nav tab. Exposed so other screens (e.g. the home avatar)
/// can jump straight to a tab like Account without a separate route.
final shellTabProvider = StateProvider<int>((ref) => 0);

class AppShell extends ConsumerWidget {
  const AppShell({super.key});
  // Home · Stores · Products · Account
  static const _tabs = [
    HomeScreen(),
    StoresListScreen(),
    CatalogScreen(searchable: true),
    AccountScreen(),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(shellTabProvider);
    final b = context.brand;
    NavigationDestination dest(IconData o, IconData s, String l) =>
        NavigationDestination(
          icon: Icon(o),
          selectedIcon: Icon(s, color: b.primary),
          label: l,
        );
    return Scaffold(
      body: IndexedStack(index: index, children: _tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => ref.read(shellTabProvider.notifier).state = i,
        backgroundColor: Colors.white,
        indicatorColor: b.soft,
        height: 58,
        destinations: [
          dest(Icons.home_outlined, Icons.home_rounded, 'Home'),
          dest(Icons.storefront_outlined, Icons.storefront_rounded, 'Stores'),
          dest(Icons.grid_view_outlined, Icons.grid_view_rounded, 'Products'),
          dest(Icons.person_outline_rounded, Icons.person_rounded, 'Account'),
        ],
      ),
    );
  }
}
