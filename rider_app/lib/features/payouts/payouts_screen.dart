import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/task.dart';
import '../../shared/widgets/error_view.dart';

/// What a rider earned, delivery by delivery — OSRM pickup→drop route distance × the
/// drop city's ₹/km rate (set by an admin on the Rider Rates page), computed once a
/// task is marked delivered. A delivered task can have no payout yet if no rate is
/// configured for its city — shown honestly as "Rate not set" rather than silently
/// omitted, so a rider isn't left wondering where a delivery's earnings went.
class PayoutsScreen extends ConsumerWidget {
  const PayoutsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(historyProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Payouts')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(error: e),
        data: (tasks) {
          final delivered = tasks.where((t) => t.status == 'delivered').toList();
          if (delivered.isEmpty) {
            return const Center(child: Text('No completed deliveries in the last 30 days', style: TextStyle(color: RiderColors.textMuted)));
          }
          final withPayout = delivered.where((t) => t.payoutAmount != null).toList();
          final total = withPayout.fold<int>(0, (n, t) => n + t.payoutAmount!);
          final totalKm = withPayout.fold<double>(0, (n, t) => n + (t.payoutDistanceMeters ?? 0) / 1000);
          final unratedCount = delivered.length - withPayout.length;

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(historyProvider),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [RiderColors.primary, RiderColors.primaryDark]),
                      borderRadius: BorderRadius.circular(16)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Earned · last 30 days', style: TextStyle(color: Colors.white70, fontSize: 12.5, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text(rupees(total), style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 10),
                    Row(children: [
                      Icon(Icons.route_rounded, size: 15, color: Colors.white.withValues(alpha: 0.8)),
                      const SizedBox(width: 4),
                      Text('${totalKm.toStringAsFixed(1)} km · ${withPayout.length} deliveries',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5)),
                    ]),
                  ]),
                ),
                if (unratedCount > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: const Color(0xFFFFF7E6), borderRadius: BorderRadius.circular(10)),
                      child: Row(children: [
                        const Icon(Icons.info_outline_rounded, size: 16, color: RiderColors.warning),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text('$unratedCount deliver${unratedCount == 1 ? 'y' : 'ies'} without a payout yet — rate not set for that city',
                              style: const TextStyle(fontSize: 12, color: RiderColors.warning)),
                        ),
                      ]),
                    ),
                  ),
                const SizedBox(height: 14),
                for (final t in delivered) ...[
                  _PayoutRow(task: t),
                  const SizedBox(height: 10),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _PayoutRow extends StatelessWidget {
  final TaskModel task;
  const _PayoutRow({required this.task});
  @override
  Widget build(BuildContext context) {
    final hasPayout = task.payoutAmount != null;
    final km = (task.payoutDistanceMeters ?? 0) / 1000;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: RiderColors.border)),
      child: Row(children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(
              color: (hasPayout ? RiderColors.success : RiderColors.textMuted).withValues(alpha: 0.12), shape: BoxShape.circle),
          alignment: Alignment.center,
          child: Icon(Icons.local_shipping_rounded, size: 17, color: hasPayout ? RiderColors.success : RiderColors.textMuted),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(task.orderNumber, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace', fontSize: 13)),
            Text(hasPayout ? '${km.toStringAsFixed(1)} km' : 'Rate not set for ${task.drop.city ?? 'this city'}',
                style: const TextStyle(color: RiderColors.textMuted, fontSize: 12)),
          ]),
        ),
        Text(hasPayout ? rupees(task.payoutAmount!) : '—',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: hasPayout ? Colors.black87 : RiderColors.textMuted)),
      ]),
    );
  }
}
