import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../home/home_screen.dart';
import '../favourites/favourites_screen.dart';
import '../now/now_screen.dart';
import '../catalog/catalog_screen.dart';
import '../stores/stores_list_screen.dart';

/// Selected bottom-nav tab. Exposed so other screens (e.g. the home avatar)
/// can jump straight to a tab like Account without a separate route.
final shellTabProvider = StateProvider<int>((ref) => 0);

class NavItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final Widget screen;
  const NavItem(
      {required this.icon,
      required this.selectedIcon,
      required this.label,
      required this.screen});
}

/// The bottom-nav's tab list, built fresh each read so "Now" can come and go with
/// nowTabVisibleProvider — Home, Products, Favourites and Stores are always present;
/// only Now's presence (and therefore everyone else's index) is conditional. Orders has
/// no tab — it's already one tap away from Account (the avatar on Home), and a thing
/// reachable from Account doesn't need a second, permanent slot in the bar too (same
/// reasoning Account itself was dropped from the bar for, earlier).
final shellNavItemsProvider = Provider.autoDispose<List<NavItem>>((ref) {
  final showNow = ref.watch(nowTabVisibleProvider);
  return [
    const NavItem(
        icon: Icons.home_outlined,
        selectedIcon: Icons.home_rounded,
        label: 'Home',
        screen: HomeScreen()),
    if (showNow)
      const NavItem(
          icon: Icons.bolt_outlined,
          selectedIcon: Icons.bolt_rounded,
          label: 'Now',
          screen: NowScreen()),
    const NavItem(
        icon: Icons.grid_view_outlined,
        selectedIcon: Icons.grid_view_rounded,
        label: 'Products',
        screen: CatalogScreen(searchable: true, title: 'Products')),
    const NavItem(
        icon: Icons.favorite_border_rounded,
        selectedIcon: Icons.favorite_rounded,
        label: 'Favourites',
        screen: FavouritesScreen()),
    const NavItem(
        icon: Icons.storefront_outlined,
        selectedIcon: Icons.storefront_rounded,
        label: 'Stores',
        screen: StoresListScreen(embedded: true)),
  ];
});

/// Shared bottom navigation bar that can be rendered on root shell and pushed screens (like Orders).
class AppBottomNav extends ConsumerWidget {
  final int? selectedIndex;
  final String? activeTab;
  const AppBottomNav({super.key, this.selectedIndex, this.activeTab});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(shellNavItemsProvider);
    int index;
    if (activeTab != null) {
      final found = items.indexWhere(
          (it) => it.label.toLowerCase() == activeTab!.toLowerCase());
      index =
          found >= 0 ? found : (selectedIndex ?? ref.watch(shellTabProvider));
    } else {
      final int rawIndex = selectedIndex ?? ref.watch(shellTabProvider);
      index = rawIndex;
    }
    final clampedIndex = items.isEmpty ? 0 : index.clamp(0, items.length - 1);
    final b = context.brand;

    return NavigationBar(
      selectedIndex: clampedIndex,
      onDestinationSelected: (i) {
        ref.read(shellTabProvider.notifier).state = i;
        context.go('/');
      },
      backgroundColor: context.colors.surface,
      indicatorColor: b.soft,
      height: 60,
      destinations: items
          .map((it) => NavigationDestination(
                icon: Icon(it.icon, color: context.colors.textMuted),
                selectedIcon: Icon(it.selectedIcon, color: b.primary),
                label: it.label,
              ))
          .toList(),
    );
  }
}

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
        body: IndexedStack(
            index: index, children: items.map((it) => it.screen).toList()),
        bottomNavigationBar: const AppBottomNav(),
      ),
    );
  }
}
