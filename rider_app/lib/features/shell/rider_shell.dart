import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/alert/alert_service.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../home/home_screen.dart';
import '../history/history_screen.dart';
import '../payouts/payouts_screen.dart';

/// Selected bottom-nav tab.
final riderShellTabProvider = StateProvider<int>((ref) => 0);

/// Home · History · Payouts — "My tasks" and individual offer/task-detail screens stay
/// as pushed routes (reached from Home's action cards), not tabs: they're a live queue
/// you drill into, not a destination you flip back to the way History/Payouts are.
class RiderShell extends ConsumerStatefulWidget {
  const RiderShell({super.key});

  @override
  ConsumerState<RiderShell> createState() => _RiderShellState();
}

class _RiderShellState extends ConsumerState<RiderShell> {
  StreamSubscription<Map<String, dynamic>>? _taskEventSub;

  @override
  void initState() {
    super.initState();
    // Centralized app-wide task event listener:
    // Ensures ringtone, full-volume alert, and removal tones trigger reliably
    // no matter which tab the rider is viewing.
    _taskEventSub = ref.read(riderSocketProvider).taskEvents.listen((event) {
      if (!mounted) return;
      ref.invalidate(offersProvider);
      ref.invalidate(myTasksProvider);

      final kind = event['kind'] as String? ?? '';
      final orderNumber = event['orderNumber'] as String? ?? '';
      final taskId = event['taskId'] as String? ?? '';

      if (kind == 'offered' || kind == 'assigned') {
        ref.read(alertServiceProvider).playAssignmentAlert(
              taskId: taskId,
              orderNumber: orderNumber,
              kind: kind,
            );
      } else if (kind == 'unassigned' || kind == 'reassigned') {
        ref.read(alertServiceProvider).playRemovalAlert(
              orderNumber: orderNumber,
              kind: kind,
            );
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            backgroundColor: RiderColors.danger,
            margin: const EdgeInsets.all(16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            content: Row(
              children: [
                const Icon(Icons.notifications_off_rounded, color: Colors.white, size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    kind == 'reassigned'
                        ? 'Order $orderNumber reassigned to another rider'
                        : 'Order $orderNumber was removed from your list',
                    style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.white),
                  ),
                ),
              ],
            ),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    });
  }

  @override
  void dispose() {
    _taskEventSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final index = ref.watch(riderShellTabProvider);
    final alertService = ref.watch(alertServiceProvider);
    final activeAlert = alertService.activeAlert;

    return Scaffold(
      body: Stack(
        children: [
          IndexedStack(
            index: index,
            children: const [HomeScreen(), HistoryScreen(), PayoutsScreen()],
          ),
          if (alertService.isRinging && activeAlert != null)
            Positioned(
              top: MediaQuery.of(context).padding.top + 10,
              left: 12,
              right: 12,
              child: _RiderActiveAlertOverlay(
                alert: activeAlert,
                onMute: () => alertService.stopAlert(),
                onOpen: () {
                  alertService.stopAlert();
                  if (activeAlert.kind == 'offered') {
                    context.push('/offers');
                  } else if (activeAlert.taskId.isNotEmpty) {
                    context.push('/tasks/${activeAlert.taskId}');
                  }
                },
              ),
            ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) =>
            ref.read(riderShellTabProvider.notifier).state = i,
        backgroundColor: RiderColors.surface,
        indicatorColor: RiderColors.primary.withValues(alpha: 0.12),
        height: 60,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined, color: RiderColors.textMuted),
            selectedIcon: Icon(Icons.home_rounded, color: RiderColors.primary),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_rounded, color: RiderColors.textMuted),
            selectedIcon: Icon(Icons.history_rounded, color: RiderColors.primary),
            label: 'History',
          ),
          NavigationDestination(
            icon: Icon(
              Icons.account_balance_wallet_outlined,
              color: RiderColors.textMuted,
            ),
            selectedIcon: Icon(
              Icons.account_balance_wallet_rounded,
              color: RiderColors.primary,
            ),
            label: 'Payouts',
          ),
        ],
      ),
    );
  }
}

/// Urgent, high-visibility overlay banner displayed while the loud alarm is actively ringing.
/// Gives the rider immediate options to silence the siren or navigate straight to the task.
class _RiderActiveAlertOverlay extends StatefulWidget {
  final ActiveTaskAlert alert;
  final VoidCallback onMute;
  final VoidCallback onOpen;

  const _RiderActiveAlertOverlay({
    required this.alert,
    required this.onMute,
    required this.onOpen,
  });

  @override
  State<_RiderActiveAlertOverlay> createState() => _RiderActiveAlertOverlayState();
}

class _RiderActiveAlertOverlayState extends State<_RiderActiveAlertOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _anim;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (context, child) {
        final glowAlpha = 0.4 + (_anim.value * 0.4);
        return Material(
          elevation: 12,
          borderRadius: BorderRadius.circular(16),
          color: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  const Color(0xFFDC2626), // Urgent red
                  RiderColors.primary,     // High-energy orange
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: Colors.white.withValues(alpha: glowAlpha),
                width: 2.2,
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFDC2626).withValues(alpha: glowAlpha),
                  blurRadius: 16,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.25),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.notification_important_rounded,
                        color: Colors.white,
                        size: 26,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.alert.kind == 'offered'
                                ? 'NEW DELIVERY OFFER!'
                                : 'NEW TASK ASSIGNED!',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                              fontSize: 15,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Order #${widget.alert.orderNumber} • Volume set to MAX',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.92),
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white70, width: 1.5),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        onPressed: widget.onMute,
                        icon: const Icon(Icons.volume_off_rounded, size: 18),
                        label: const Text(
                          'Mute Sound',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: const Color(0xFFDC2626),
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        onPressed: widget.onOpen,
                        icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                        label: const Text(
                          'View Order',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
