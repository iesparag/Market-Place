import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/theme.dart';
import '../home/home_screen.dart';
import '../history/history_screen.dart';
import '../payouts/payouts_screen.dart';

/// Selected bottom-nav tab.
final riderShellTabProvider = StateProvider<int>((ref) => 0);

/// Home · History · Payouts — "My tasks" and individual offer/task-detail screens stay
/// as pushed routes (reached from Home's action cards), not tabs: they're a live queue
/// you drill into, not a destination you flip back to the way History/Payouts are.
class RiderShell extends ConsumerWidget {
  const RiderShell({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(riderShellTabProvider);
    return Scaffold(
      body: IndexedStack(
        index: index,
        children: const [HomeScreen(), HistoryScreen(), PayoutsScreen()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => ref.read(riderShellTabProvider.notifier).state = i,
        backgroundColor: Colors.white,
        indicatorColor: RiderColors.primary.withValues(alpha: 0.12),
        height: 60,
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
          const NavigationDestination(icon: Icon(Icons.history_rounded), selectedIcon: Icon(Icons.history_rounded), label: 'History'),
          NavigationDestination(
              icon: const Icon(Icons.account_balance_wallet_outlined),
              selectedIcon: Icon(Icons.account_balance_wallet_rounded, color: RiderColors.primary),
              label: 'Payouts'),
        ],
      ),
    );
  }
}
