import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _togglingOnline = false;
  StreamSubscription<Map<String, dynamic>>? _taskEventSub;

  @override
  void initState() {
    super.initState();
    _taskEventSub = ref.read(riderSocketProvider).taskEvents.listen((event) {
      if (!mounted) return;
      ref.invalidate(offersProvider);
      ref.invalidate(myTasksProvider);
      final msg = switch (event['kind']) {
        'offered' => 'New delivery offer — ${event['orderNumber']}',
        'assigned' => 'Delivery assigned — ${event['orderNumber']}',
        'reassigned' => 'Delivery reassigned — ${event['orderNumber']}',
        'unassigned' => 'Delivery removed — ${event['orderNumber']}',
        _ => null,
      };
      if (msg != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
      // Loud spoken alert — a toast is easy to miss while riding. Max volume,
      // regardless of the device's current media/ringer level (see AlertService).
      if (event['kind'] == 'offered' || event['kind'] == 'assigned') {
        ref.read(alertServiceProvider).speak('New delivery task assigned');
      }
    });
  }

  Future<void> _goOnline() async {
    setState(() => _togglingOnline = true);
    final locationOk = await ref.read(locationServiceProvider).start();
    if (!locationOk) {
      if (mounted) {
        setState(() => _togglingOnline = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Location permission is required to go online.')),
        );
      }
      return;
    }
    try {
      await ref.read(ridersRepoProvider).setStatus('available');
      await _refreshRider();
    } finally {
      if (mounted) setState(() => _togglingOnline = false);
    }
  }

  Future<void> _goOffline() async {
    setState(() => _togglingOnline = true);
    ref.read(locationServiceProvider).stop();
    try {
      await ref.read(ridersRepoProvider).setStatus('offline');
      await _refreshRider();
    } finally {
      if (mounted) setState(() => _togglingOnline = false);
    }
  }

  /// AuthController's state only updates on login/logout, not on setStatus — refetch
  /// `/riders/me` directly and push it back in so the toggle reflects the real state.
  Future<void> _refreshRider() async {
    try {
      final fresh = await ref.read(ridersRepoProvider).me();
      ref.read(authProvider.notifier).setRider(fresh);
    } catch (_) {/* keep showing the last known state */}
  }

  @override
  void dispose() {
    // Deliberately NOT stopping location/socket here — both are app-lifetime (see
    // locationServiceProvider/riderSocketProvider) and should keep running while the
    // rider is mid-delivery even if they navigate away from this screen.
    _taskEventSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rider = ref.watch(authProvider);
    final online = rider?.status != 'offline';
    final offersAsync = ref.watch(offersProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Rider App'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              ref.read(locationServiceProvider).stop();
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _refreshRider();
          ref.invalidate(offersProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: RiderColors.border)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(rider?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                      const SizedBox(height: 2),
                      Text(_statusLabel(rider?.status), style: TextStyle(color: online ? RiderColors.success : RiderColors.textMuted, fontWeight: FontWeight.w700, fontSize: 13)),
                    ]),
                  ),
                  Switch(
                    value: online,
                    onChanged: _togglingOnline ? null : (v) => v ? _goOnline() : _goOffline(),
                    activeThumbColor: RiderColors.success,
                  ),
                ]),
                const SizedBox(height: 14),
                Row(children: [
                  _statChip('⭐ ${(rider?.rating ?? 5).toStringAsFixed(1)}', 'rating'),
                  const SizedBox(width: 10),
                  _statChip('${rider?.activeTaskCount ?? 0}', 'active'),
                  const SizedBox(width: 10),
                  _statChip('${rider?.totalDeliveries ?? 0}', 'delivered'),
                ]),
              ]),
            ),
            const SizedBox(height: 16),

            offersAsync.maybeWhen(
              data: (offers) => offers.isEmpty
                  ? const SizedBox.shrink()
                  : _actionCard(
                      icon: Icons.notifications_active_outlined,
                      iconColor: RiderColors.warning,
                      title: '${offers.length} new job offer${offers.length == 1 ? '' : 's'}',
                      subtitle: 'Respond before the offer window closes',
                      onTap: () => context.push('/offers'),
                    ),
              orElse: () => const SizedBox.shrink(),
            ),
            const SizedBox(height: 10),
            _actionCard(
              icon: Icons.local_shipping_outlined,
              iconColor: RiderColors.primary,
              title: 'My tasks',
              subtitle: 'Pickups and deliveries assigned to you',
              onTap: () => context.push('/tasks'),
            ),

            if (!online) ...[
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: RiderColors.bg, borderRadius: BorderRadius.circular(12)),
                child: const Text(
                  "You're offline — go online to start receiving job offers and share your live location once you're delivering.",
                  style: TextStyle(color: RiderColors.textMuted, fontSize: 12.5),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _statusLabel(String? status) => switch (status) {
        'available' => 'Online — available',
        'busy' => 'Online — on a delivery',
        _ => 'Offline',
      };

  Widget _statChip(String value, String label) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(color: RiderColors.bg, borderRadius: BorderRadius.circular(10)),
          child: Column(children: [
            Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            Text(label, style: const TextStyle(color: RiderColors.textMuted, fontSize: 11)),
          ]),
        ),
      );

  Widget _actionCard({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) =>
      Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: RiderColors.border)),
            child: Row(children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(color: iconColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: iconColor),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                  Text(subtitle, style: const TextStyle(color: RiderColors.textMuted, fontSize: 12)),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded, color: RiderColors.textMuted),
            ]),
          ),
        ),
      );
}
