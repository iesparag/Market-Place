import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/task.dart';

/// "What did I accomplish" — a rider's own completed/cancelled track record, last 30
/// days. Distinct from /tasks (the live queue): this is read-only, no advance buttons,
/// but still taps through to the same detail screen for a full look-back.
class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(historyProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('History')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: RiderColors.textMuted))),
        data: (tasks) {
          if (tasks.isEmpty) {
            return const Center(child: Text('No completed deliveries in the last 30 days', style: TextStyle(color: RiderColors.textMuted)));
          }
          final delivered = tasks.where((t) => t.status == 'delivered').toList();
          final codCollected = delivered.fold<int>(0, (n, t) => n + (t.codAmount ?? 0));
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(historyProvider),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: RiderColors.border)),
                  child: Row(children: [
                    _stat('${delivered.length}', 'Delivered'),
                    _divider(),
                    _stat('${tasks.length - delivered.length}', 'Cancelled'),
                    _divider(),
                    _stat(rupees(codCollected), 'Cash collected'),
                  ]),
                ),
                const SizedBox(height: 14),
                for (final t in tasks) ...[
                  _HistoryRow(task: t),
                  const SizedBox(height: 10),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _stat(String value, String label) => Expanded(
        child: Column(children: [
          Text(value, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
          Text(label, style: const TextStyle(color: RiderColors.textMuted, fontSize: 11), textAlign: TextAlign.center),
        ]),
      );
  Widget _divider() => Container(width: 1, height: 30, color: RiderColors.border);
}

class _HistoryRow extends StatelessWidget {
  final TaskModel task;
  const _HistoryRow({required this.task});
  @override
  Widget build(BuildContext context) {
    final delivered = task.status == 'delivered';
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => context.push('/tasks/${task.id}'),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: RiderColors.border)),
        child: Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: (delivered ? RiderColors.success : RiderColors.danger).withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Icon(delivered ? Icons.check_rounded : Icons.close_rounded, size: 18, color: delivered ? RiderColors.success : RiderColors.danger),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(task.orderNumber, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace', fontSize: 13)),
              Text(delivered ? 'Delivered' : 'Cancelled', style: TextStyle(color: delivered ? RiderColors.success : RiderColors.danger, fontSize: 12, fontWeight: FontWeight.w700)),
            ]),
          ),
          if (task.isCod) Text(rupees(task.codAmount!), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
        ]),
      ),
    );
  }
}
