import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/task.dart';
import '../../shared/widgets/error_view.dart';
import '../../core/format.dart';

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});
  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen> {
  String? _busyId;

  Future<void> _advance(TaskModel task) async {
    final next = task.nextStep;
    if (next == null) return;
    setState(() => _busyId = task.id);
    try {
      await ref.read(ridersRepoProvider).updateTaskStatus(task.id, next.status);
      ref.invalidate(myTasksProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              next.status == 'delivered' ? 'Delivered 🎉' : next.currentLabel,
            ),
          ),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tasksAsync = ref.watch(myTasksProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My tasks')),
      body: tasksAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(error: e),
        data: (tasks) => tasks.isEmpty
            ? const Center(
                child: Text(
                  'No active tasks',
                  style: TextStyle(color: RiderColors.textMuted),
                ),
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(myTasksProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: tasks.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => _TaskCard(
                    task: tasks[i],
                    busy: _busyId == tasks[i].id,
                    onAdvance: () => _advance(tasks[i]),
                  ),
                ),
              ),
      ),
    );
  }
}

class _TaskCard extends ConsumerWidget {
  final TaskModel task;
  final bool busy;
  final VoidCallback onAdvance;
  const _TaskCard({
    required this.task,
    required this.busy,
    required this.onAdvance,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsSummary = task.items.isEmpty
        ? ''
        : task.items.length > 1
        ? '${task.items.first.title} +${task.items.length - 1} more'
        : task.items.first.title;
    final next = task.nextStep;
    final stepIndex = kTaskSteps.indexWhere(
      (s) => s.status == task.status,
    ); // -1 while still 'ready'

    final pos = ref.watch(riderPositionProvider).valueOrNull;
    final riderToPickup = task.riderToPickupKm(pos?.latitude, pos?.longitude);
    final deliveryLeg = task.deliveryLegKm;
    final totalTrip = task.totalTripKm(pos?.latitude, pos?.longitude);
    final estimatedPayout = task.finalOrEstimatedPayout;
    final isDark = context.isDark;

    return Material(
      color: context.surfaceColor,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.push('/tasks/${task.id}'),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.borderColor),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: (isDark ? const Color(0xFF60A5FA) : RiderColors.primary).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      task.stageLabel,
                      style: TextStyle(
                        color: isDark ? const Color(0xFF93C5FD) : RiderColors.primary,
                        fontWeight: FontWeight.w700,
                        fontSize: 11.5,
                      ),
                    ),
                  ),
                ],
              ),
              if (itemsSummary.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  itemsSummary,
                  style: TextStyle(
                    color: context.mutedTextColor,
                    fontSize: 12.5,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.storefront_outlined,
                    size: 16,
                    color: context.mutedTextColor,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      task.pickup.oneLine,
                      style: TextStyle(fontSize: 12.5, color: context.textColor),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.flag_outlined,
                    size: 16,
                    color: context.mutedTextColor,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      task.drop.oneLine,
                      style: TextStyle(fontSize: 12.5, color: context.textColor),
                    ),
                  ),
                ],
              ),

              // 🛵 Rider Earnings & Distance Tag
              Container(
                margin: const EdgeInsets.only(top: 10),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF0F2E1E) : const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: isDark ? const Color(0xFF166534) : const Color(0xFFBBF7D0)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.account_balance_wallet_rounded,
                        size: 14, color: Color(0xFF22C55E)),
                    const SizedBox(width: 5),
                    Text(
                      rupees(estimatedPayout),
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: isDark ? const Color(0xFF4ADE80) : const Color(0xFF15803D),
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      '• ₹${task.rateRupeesPerKm.toStringAsFixed(0)}/km',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? const Color(0xFF86EFAC) : const Color(0xFF166534),
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '📍 ${riderToPickup != null ? "${riderToPickup.toStringAsFixed(1)}km" : "-"} ➔ 🏁 ${deliveryLeg != null ? "${deliveryLeg.toStringAsFixed(1)}km" : "-"} (${totalTrip != null ? "${totalTrip.toStringAsFixed(1)}km trip" : ""})',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF475569),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 10),
              _StepDots(currentIndex: stepIndex),
              const SizedBox(height: 10),
              if (next != null)
                SizedBox(
                  width: double.infinity,
                  height: 46,
                  child: ElevatedButton(
                    onPressed: busy ? null : onAdvance,
                    child: busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(next.buttonLabel),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small 6-dot progress indicator through the pickup/delivery steps.
class _StepDots extends StatelessWidget {
  final int currentIndex; // -1 = not started (still 'ready')
  const _StepDots({required this.currentIndex});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(kTaskSteps.length, (i) {
        final done = i <= currentIndex;
        return Expanded(
          child: Container(
            height: 4,
            margin: EdgeInsets.only(right: i == kTaskSteps.length - 1 ? 0 : 4),
            decoration: BoxDecoration(
              color: done ? RiderColors.primary : RiderColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        );
      }),
    );
  }
}
