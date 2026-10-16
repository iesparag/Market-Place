import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../home/home_screen.dart';
import '../favourites/favourites_screen.dart';
import '../now/now_screen.dart';
import '../catalog/catalog_screen.dart';
import '../orders/orders_screen.dart';

/// Selected bottom-nav tab. Exposed so other screens (e.g. the home avatar)
/// can jump straight to a tab like Account without a separate route.
final shellTabProvider = StateProvider<int>((ref) => 0);

class _NavItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final Widget screen;
  const _NavItem({required this.icon, required this.selectedIcon, required this.label, required this.screen});
}

/// The bottom-nav's tab list, built fresh each read so "Now" can come and go with
/// nowTabVisibleProvider — Home, Products, Favourites and Orders are always present;
/// only Now's presence (and therefore everyone else's index) is conditional. Exposed as
/// a provider (not just a local build() variable) so other screens — the Account
/// screen's "Your orders" tile — can look up "which index is Orders today" instead of
/// hardcoding a number that silently goes stale when Now appears/disappears.
final shellNavItemsProvider = Provider.autoDispose<List<_NavItem>>((ref) {
  final showNow = ref.watch(nowTabVisibleProvider);
  return [
    const _NavItem(icon: Icons.home_outlined, selectedIcon: Icons.home_rounded, label: 'Home', screen: HomeScreen()),
    if (showNow)
      const _NavItem(icon: Icons.bolt_outlined, selectedIcon: Icons.bolt_rounded, label: 'Now', screen: NowScreen()),
    const _NavItem(
        icon: Icons.grid_view_outlined,
        selectedIcon: Icons.grid_view_rounded,
        label: 'Products',
        screen: CatalogScreen(searchable: true, title: 'Products')),
    const _NavItem(
        icon: Icons.favorite_border_rounded, selectedIcon: Icons.favorite_rounded, label: 'Favourites', screen: FavouritesScreen()),
    const _NavItem(
        icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long_rounded, label: 'Orders', screen: OrdersScreen()),
  ];
});

/// Index of the Orders tab in today's nav — used by AccountScreen's "Your orders" tile
/// instead of a hardcoded number, since Now appearing/disappearing shifts it.
final ordersTabIndexProvider = Provider.autoDispose<int>((ref) {
  final items = ref.watch(shellNavItemsProvider);
  final i = items.indexWhere((it) => it.screen is OrdersScreen);
  return i < 0 ? 0 : i;
});

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});
  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  StreamSubscription<Map<String, dynamic>>? _notifSub;

  @override
  void initState() {
    super.initState();
    _notifSub = ref.read(appSocketProvider).notifications.listen((_) {
      ref.invalidate(unreadCountProvider);
      ref.invalidate(notificationsProvider);
    });
  }

  @override
  void dispose() {
    _notifSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(shellNavItemsProvider);
    // Now appearing/disappearing shifts indices — clamp rather than let IndexedStack
    // crash on a now-out-of-range index (e.g. serviceability resolves while the user
    // happens to be on the last tab).
    final rawIndex = ref.watch(shellTabProvider);
    final index = rawIndex.clamp(0, items.length - 1);
    final b = context.brand;
    NavigationDestination dest(_NavItem it) => NavigationDestination(
          icon: Icon(it.icon),
          selectedIcon: Icon(it.selectedIcon, color: b.primary),
          label: it.label,
        );
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        // Not on Home → first back press lands the user on Home
        if (index != 0) {
          ref.read(shellTabProvider.notifier).state = 0;
          return;
        }
        final exit = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Exit app?'),
            content: const Text('Are you sure you want to close Marketplace?'),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancel')),
              TextButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('Exit')),
            ],
          ),
        );
        if (exit == true) SystemNavigator.pop();
      },
      child: Scaffold(
        body: IndexedStack(index: index, children: items.map((it) => it.screen).toList()),
        bottomNavigationBar: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (i) => ref.read(shellTabProvider.notifier).state = i,
          backgroundColor: Colors.white,
          indicatorColor: b.soft,
          height: 60,
          destinations: items.map(dest).toList(),
        ),
      ),
    );
  }
}
