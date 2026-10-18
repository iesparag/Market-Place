import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/task.dart';
import '../../shared/widgets/error_view.dart';
import '../../core/format.dart';

class OffersScreen extends ConsumerStatefulWidget {
  const OffersScreen({super.key});
  @override
  ConsumerState<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends ConsumerState<OffersScreen> {
  Timer? _tick;
  Timer? _poll;
  String? _busyId;

  @override
  void initState() {
    super.initState();
    // Rider opened the screen — silence any ringing alert so they can review in peace
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(alertServiceProvider).stopAlert();
    });
    // Redraws the countdown each second; refetches periodically so an offer that
    // expired (or cascaded away) disappears without the rider having to pull-to-refresh.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
    _poll = Timer.periodic(const Duration(seconds: 5), (_) => ref.invalidate(offersProvider));
  }

  @override
  void dispose() {
    _tick?.cancel();
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _respond(TaskModel task, {required bool accept}) async {
    ref.read(alertServiceProvider).stopAlert();
    setState(() => _busyId = task.id);
    try {
      if (accept) {
        await ref.read(ridersRepoProvider).acceptOffer(task.id);
        ref.invalidate(offersProvider);
        ref.invalidate(myTasksProvider);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Accepted ${task.orderNumber}')));
          // Straight to the task — a rider who just accepted wants to start moving,
          // not hunt for it under "My tasks".
          context.push('/tasks/${task.id}');
        }
        return;
      } else {
        await ref.read(ridersRepoProvider).declineOffer(task.id);
      }
      ref.invalidate(offersProvider);
      ref.invalidate(myTasksProvider);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      ref.invalidate(offersProvider); // the offer likely moved on — refresh either way
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final offersAsync = ref.watch(offersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Job offers')),
      body: offersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(error: e),
        data: (offers) => offers.isEmpty
            ? const Center(child: Text('No offers right now', style: TextStyle(color: RiderColors.textMuted)))
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(offersProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: offers.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => _OfferCard(
                    task: offers[i],
                    busy: _busyId == offers[i].id,
                    onAccept: () => _respond(offers[i], accept: true),
                    onDecline: () => _respond(offers[i], accept: false),
                  ),
                ),
              ),
      ),
    );
  }
}

class _OfferCard extends ConsumerWidget {
  final TaskModel task;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onDecline;
  const _OfferCard({required this.task, required this.busy, required this.onAccept, required this.onDecline});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final remaining = task.offer?.remaining ?? Duration.zero;
    final seconds = remaining.inSeconds;
    final expired = seconds <= 0;
    final itemsSummary = task.items.isEmpty
        ? ''
        : task.items.length > 1
            ? '${task.items.first.title} +${task.items.length - 1} more'
            : task.items.first.title;

    final pos = ref.watch(riderPositionProvider).valueOrNull;
    final riderToPickup = task.riderToPickupKm(pos?.latitude, pos?.longitude);
    final deliveryLeg = task.deliveryLegKm;
    final totalTrip = task.totalTripKm(pos?.latitude, pos?.longitude);
    final estimatedPayout = task.finalOrEstimatedPayout;

    final isDark = context.isDark;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text(
              task.orderNumber,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontFamily: 'monospace',
                color: context.textColor,
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: expired
                  ? RiderColors.danger.withValues(alpha: 0.12)
                  : RiderColors.warning.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              expired ? 'expired' : '${seconds}s',
              style: TextStyle(
                color: expired ? RiderColors.danger : RiderColors.warning,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ),
        ]),
        if (itemsSummary.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(itemsSummary, style: TextStyle(color: context.mutedTextColor, fontSize: 12.5)),
        ],
        const SizedBox(height: 10),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.storefront_outlined, size: 16, color: context.mutedTextColor),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              task.pickup.oneLine,
              style: TextStyle(fontSize: 12.5, color: context.textColor),
            ),
          ),
        ]),
        const SizedBox(height: 4),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.flag_outlined, size: 16, color: context.mutedTextColor),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              task.drop.oneLine,
              style: TextStyle(fontSize: 12.5, color: context.textColor),
            ),
          ),
        ]),

        // 🛵 Rider Trip & Earnings Transparency Card (Dark/Light Safe)
        Container(
          margin: const EdgeInsets.only(top: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF0F2E1E) : const Color(0xFFF0FDF4),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: isDark ? const Color(0xFF166534) : const Color(0xFFBBF7D0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.account_balance_wallet_rounded,
                          size: 16, color: Color(0xFF22C55E)),
                      const SizedBox(width: 6),
                      Text(
                        rupees(estimatedPayout),
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 16,
                          color: isDark ? const Color(0xFF4ADE80) : const Color(0xFF15803D),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF14532D) : const Color(0xFFDCFCE7),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          '₹${task.rateRupeesPerKm.toStringAsFixed(0)}/km',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: isDark ? const Color(0xFF86EFAC) : const Color(0xFF166534),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (totalTrip != null)
                    Text(
                      '${totalTrip.toStringAsFixed(1)} km total trip',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: isDark ? const Color(0xFF86EFAC) : const Color(0xFF166534),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(Icons.route_rounded,
                      size: 14, color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B)),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      '📍 You ➔ Store: ${riderToPickup != null ? "${riderToPickup.toStringAsFixed(1)} km" : "-- km"}  |  🏁 Delivery: ${deliveryLeg != null ? "${deliveryLeg.toStringAsFixed(1)} km" : "-- km"}',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF475569),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 14),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: busy || expired ? null : onDecline,
              child: const Text('Decline'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: ElevatedButton(
              onPressed: busy || expired ? null : onAccept,
              child: busy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Accept'),
            ),
          ),
        ]),
      ]),
    );
  }
}
