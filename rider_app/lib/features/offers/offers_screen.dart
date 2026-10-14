import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/task.dart';

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
    setState(() => _busyId = task.id);
    try {
      if (accept) {
        await ref.read(ridersRepoProvider).acceptOffer(task.id);
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Accepted ${task.orderNumber}')));
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
        error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: RiderColors.textMuted))),
        data: (offers) => offers.isEmpty
            ? const Center(child: Text('No offers right now', style: TextStyle(color: RiderColors.textMuted)))
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(offersProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: offers.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
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

class _OfferCard extends StatelessWidget {
  final TaskModel task;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onDecline;
  const _OfferCard({required this.task, required this.busy, required this.onAccept, required this.onDecline});

  @override
  Widget build(BuildContext context) {
    final remaining = task.offer?.remaining ?? Duration.zero;
    final seconds = remaining.inSeconds;
    final expired = seconds <= 0;
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
              color: expired ? RiderColors.danger.withValues(alpha: 0.1) : RiderColors.warning.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              expired ? 'expired' : '${seconds}s',
              style: TextStyle(color: expired ? RiderColors.danger : RiderColors.warning, fontWeight: FontWeight.w800, fontSize: 12),
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
