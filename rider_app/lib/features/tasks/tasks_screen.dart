import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/task.dart';

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});
  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen> {
  String? _busyId;

  Future<void> _advance(TaskModel task) async {
    final nextStatus = task.isReadyForPickup ? 'shipped' : 'delivered';
    setState(() => _busyId = task.id);
    try {
      await ref.read(ridersRepoProvider).updateTaskStatus(task.id, nextStatus);
      ref.invalidate(myTasksProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(nextStatus == 'shipped' ? 'Picked up — on the way' : 'Delivered 🎉')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
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
        error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: RiderColors.textMuted))),
        data: (tasks) => tasks.isEmpty
            ? const Center(child: Text('No active tasks', style: TextStyle(color: RiderColors.textMuted)))
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(myTasksProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: tasks.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
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

class _TaskCard extends StatelessWidget {
  final TaskModel task;
  final bool busy;
  final VoidCallback onAdvance;
  const _TaskCard({required this.task, required this.busy, required this.onAdvance});

  @override
  Widget build(BuildContext context) {
    final itemsSummary = task.items.isEmpty
        ? ''
        : task.items.length > 1
            ? '${task.items.first.title} +${task.items.length - 1} more'
            : task.items.first.title;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: RiderColors.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(task.orderNumber, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace'))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: (task.isOutForDelivery ? RiderColors.primary : RiderColors.warning).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              task.isOutForDelivery ? 'Out for delivery' : 'Ready for pickup',
              style: TextStyle(color: task.isOutForDelivery ? RiderColors.primary : RiderColors.warning, fontWeight: FontWeight.w700, fontSize: 11.5),
            ),
          ),
        ]),
        if (itemsSummary.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(itemsSummary, style: const TextStyle(color: RiderColors.textMuted, fontSize: 12.5)),
        ],
        const SizedBox(height: 10),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.storefront_outlined, size: 16, color: RiderColors.textMuted),
          const SizedBox(width: 6),
          Expanded(child: Text(task.pickup.oneLine, style: const TextStyle(fontSize: 12.5))),
        ]),
        const SizedBox(height: 4),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.flag_outlined, size: 16, color: RiderColors.textMuted),
          const SizedBox(width: 6),
          Expanded(child: Text(task.drop.oneLine, style: const TextStyle(fontSize: 12.5))),
        ]),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          height: 46,
          child: ElevatedButton(
            onPressed: busy ? null : onAdvance,
            child: busy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(task.isReadyForPickup ? 'Mark picked up' : 'Mark delivered'),
          ),
        ),
      ]),
    );
  }
}
