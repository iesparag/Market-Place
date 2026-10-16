import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/format.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/task.dart';
import '../../shared/widgets/error_view.dart';

Future<void> _call(String? phone) async {
  if (phone == null || phone.isEmpty) return;
  await launchUrl(Uri.parse('tel:$phone'));
}

/// Universal Google Maps directions link — opens the Maps app if installed, falls back
/// to the browser otherwise. Deliberately not a `google.navigation:` intent (Android-only,
/// no web fallback) since this needs to work the same way regardless of what's installed.
Future<void> _navigate(TaskAddress addr) async {
  if (!addr.hasLocation) return;
  final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${addr.lat},${addr.lng}&travelmode=driving');
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

class TaskDetailScreen extends ConsumerStatefulWidget {
  final String taskId;
  const TaskDetailScreen({super.key, required this.taskId});
  @override
  ConsumerState<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends ConsumerState<TaskDetailScreen> {
  bool _advancing = false;

  Future<void> _advance(TaskModel task) async {
    final next = task.nextStep;
    if (next == null) return;
    setState(() => _advancing = true);
    try {
      await ref.read(ridersRepoProvider).updateTaskStatus(task.id, next.status);
      ref.invalidate(myTasksProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.status == 'delivered' ? 'Delivered 🎉' : next.currentLabel)),
        );
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _advancing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tasksAsync = ref.watch(myTasksProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Task details')),
      body: tasksAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(error: e),
        data: (tasks) {
          final active = tasks.where((t) => t.id == widget.taskId).firstOrNull;
          if (active != null) return _detail(active, isHistory: false);

          // Not in the live queue — could be a completed/cancelled task opened from
          // History, which myTasksProvider deliberately excludes (it only lists
          // 'ready'+active rider stages). Fall back to historyProvider before giving up.
          final historyAsync = ref.watch(historyProvider);
          return historyAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => const Center(
                child: Text('This task is no longer in your queue.', style: TextStyle(color: RiderColors.textMuted))),
            data: (history) {
              final past = history.where((t) => t.id == widget.taskId).firstOrNull;
              if (past == null) {
                return const Center(
                    child: Text('This task is no longer in your queue.', style: TextStyle(color: RiderColors.textMuted)));
              }
              return _detail(past, isHistory: true);
            },
          );
        },
      ),
    );
  }

  Widget _detail(TaskModel task, {required bool isHistory}) {
    final next = isHistory ? null : task.nextStep;
    final stepIndex = kTaskSteps.indexWhere((s) => s.status == task.status);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(isHistory ? historyProvider : myTasksProvider),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            Expanded(child: Text(task.orderNumber, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace', fontSize: 15))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                  color: (isHistory
                          ? (task.status == 'delivered' ? RiderColors.success : RiderColors.danger)
                          : RiderColors.primary)
                      .withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999)),
              child: Text(
                isHistory ? (task.status == 'delivered' ? 'Delivered' : 'Cancelled') : task.stageLabel,
                style: TextStyle(
                    color: isHistory
                        ? (task.status == 'delivered' ? RiderColors.success : RiderColors.danger)
                        : RiderColors.primary,
                    fontWeight: FontWeight.w700,
                    fontSize: 11.5),
              ),
            ),
          ]),
          const SizedBox(height: 10),
          if (!isHistory) ...[_StepDots(currentIndex: stepIndex), const SizedBox(height: 16)],

          if (task.isCod)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(color: const Color(0xFFFFF7E6), borderRadius: BorderRadius.circular(14), border: Border.all(color: RiderColors.warning)),
              child: Row(children: [
                const Icon(Icons.payments_rounded, color: RiderColors.warning),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(isHistory ? 'Cash collected' : 'Collect on delivery',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: RiderColors.warning)),
                    Text(rupees(task.codAmount!), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: RiderColors.warning)),
                  ]),
                ),
              ]),
            )
          else if (isHistory)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(color: const Color(0xFFE7F6EC), borderRadius: BorderRadius.circular(14)),
              child: const Row(children: [
                Icon(Icons.credit_score_rounded, color: RiderColors.success),
                SizedBox(width: 10),
                Text('Prepaid online — nothing to collect', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: RiderColors.success)),
              ]),
            ),

          _ContactCard(
            icon: Icons.storefront_outlined,
            title: task.storeName ?? 'Pickup',
            subtitle: 'Pickup from vendor',
            address: task.pickup,
            phone: task.storePhone,
          ),
          const SizedBox(height: 12),
          _ContactCard(
            icon: Icons.person_outline_rounded,
            title: task.customerName ?? 'Customer',
            subtitle: 'Deliver to customer',
            address: task.drop,
            phone: task.customerPhone,
            note: task.instructions,
          ),
          const SizedBox(height: 14),

          _card(
            title: 'Items (${task.items.length})',
            child: Column(children: task.items.map((i) => _ItemTile(item: i)).toList()),
          ),

          const SizedBox(height: 20),
          if (next != null)
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: _advancing ? null : () => _advance(task),
                child: _advancing
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(next.buttonLabel),
              ),
            ),
        ],
      ),
    );
  }

  Widget _card({required String title, required Widget child}) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: RiderColors.border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
          const SizedBox(height: 8),
          child,
        ]),
      );
}

class _ContactCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final TaskAddress address;
  final String? phone;
  final String? note;
  const _ContactCard({required this.icon, required this.title, required this.subtitle, required this.address, this.phone, this.note});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: RiderColors.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 18, color: RiderColors.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
              Text(subtitle, style: const TextStyle(color: RiderColors.textMuted, fontSize: 11.5)),
            ]),
          ),
        ]),
        const SizedBox(height: 8),
        Text(address.oneLine.isEmpty ? 'Address not available' : address.oneLine, style: const TextStyle(fontSize: 13)),
        if (note != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: RiderColors.bg, borderRadius: BorderRadius.circular(8)),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.sticky_note_2_outlined, size: 14, color: RiderColors.textMuted),
              const SizedBox(width: 6),
              Expanded(child: Text(note!, style: const TextStyle(fontSize: 12.5, fontStyle: FontStyle.italic))),
            ]),
          ),
        ],
        const SizedBox(height: 10),
        Row(children: [
          if (phone != null)
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => _call(phone),
                icon: const Icon(Icons.call_rounded, size: 16),
                label: const Text('Call'),
              ),
            ),
          if (phone != null && address.hasLocation) const SizedBox(width: 10),
          if (address.hasLocation)
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => _navigate(address),
                icon: const Icon(Icons.directions_rounded, size: 18),
                label: const Text('Navigate'),
              ),
            ),
        ]),
      ]),
    );
  }
}

class _ItemTile extends StatelessWidget {
  final TaskItem item;
  const _ItemTile({required this.item});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Expanded(child: Text(item.title, style: const TextStyle(fontSize: 13))),
        Text('× ${item.qty}', style: const TextStyle(color: RiderColors.textMuted, fontWeight: FontWeight.w700, fontSize: 12.5)),
      ]),
    );
  }
}

/// Mirrors tasks_screen.dart's _StepDots exactly — kept separate since that one's
/// private to that file.
class _StepDots extends StatelessWidget {
  final int currentIndex;
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
            decoration: BoxDecoration(color: done ? RiderColors.primary : RiderColors.border, borderRadius: BorderRadius.circular(2)),
          ),
        );
      }),
    );
  }
}
