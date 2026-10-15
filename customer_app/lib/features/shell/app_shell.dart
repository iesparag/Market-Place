import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../home/home_screen.dart';
import '../categories/categories_screen.dart';
import '../stores/stores_list_screen.dart';
import '../orders/orders_screen.dart';
import '../account/account_screen.dart';

/// Selected bottom-nav tab. Exposed so other screens (e.g. the home avatar)
/// can jump straight to a tab like Account without a separate route.
final shellTabProvider = StateProvider<int>((ref) => 0);

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});
  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  // Home · Categories · Stores · Orders · Account (5 tabs matching Image 1 & specification)
  static const _tabs = [
    HomeScreen(),
    CategoriesScreen(),
    StoresListScreen(),
    OrdersScreen(),
    AccountScreen(),
  ];

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
    final index = ref.watch(shellTabProvider);
    final b = context.brand;
    NavigationDestination dest(IconData o, IconData s, String l) =>
        NavigationDestination(
          icon: Icon(o),
          selectedIcon: Icon(s, color: b.primary),
          label: l,
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
        body: IndexedStack(index: index, children: _tabs),
        bottomNavigationBar: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (i) => ref.read(shellTabProvider.notifier).state = i,
          backgroundColor: Colors.white,
          indicatorColor: b.soft,
          height: 60,
          destinations: [
            dest(Icons.home_outlined, Icons.home_rounded, 'Home'),
            dest(Icons.grid_view_outlined, Icons.grid_view_rounded, 'Categories'),
            dest(Icons.storefront_outlined, Icons.storefront_rounded, 'Stores'),
            dest(Icons.receipt_long_outlined, Icons.receipt_long_rounded, 'Orders'),
            dest(Icons.person_outline_rounded, Icons.person_rounded, 'Account'),
          ],
        ),
      ),
    );
  }
}
