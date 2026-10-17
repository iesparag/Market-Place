import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/safe_pop_scope.dart';

class ReferralScreen extends ConsumerWidget {
  const ReferralScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(referralInfoProvider);
    return SafePopScope(
      child: Scaffold(
        appBar: AppBar(title: const Text('Invite a friend')),
        body: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(error: e),
          data: (info) => ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                    gradient: context.brand.gradient,
                    borderRadius: BorderRadius.circular(18)),
                child: Column(children: [
                  const Icon(Icons.card_giftcard_rounded,
                      color: Colors.white, size: 40),
                  const SizedBox(height: 10),
                  Text(
                      'Give your friends a reason to shop here — you earn ${info.rewardPoints} points (₹${(info.rewardValuePaise / 100).toStringAsFixed(0)}) when their first order is delivered.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          height: 1.4)),
                ]),
              ),
              const SizedBox(height: 24),
              Text('Your referral code',
                  style: TextStyle(
                      color: context.colors.textMuted, fontSize: 13)),
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                    color: context.colors.bg,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: context.colors.border)),
                child: Row(children: [
                  Expanded(
                    child: Text(info.code,
                        style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            fontFamily: 'monospace',
                            letterSpacing: 2)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.copy_rounded),
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: info.code));
                      ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Code copied')));
                    },
                  ),
                ]),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.share_rounded),
                  label: const Text('Share invite'),
                  onPressed: () => Share.share(
                    'Use my referral code ${info.code} when you sign up on the Marketplace app — we both get rewarded!',
                  ),
                ),
              ),
              const SizedBox(height: 24),
              const Divider(),
              const SizedBox(height: 12),
              Row(children: [
                _StatTile(label: 'Friends joined', value: '${info.referredCount}'),
                const SizedBox(width: 12),
                _StatTile(
                    label: 'Rewards earned', value: '${info.rewardedCount}'),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  const _StatTile({required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              color: context.colors.bg,
              borderRadius: BorderRadius.circular(12)),
          child: Column(children: [
            Text(value,
                style:
                    const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 2),
            Text(label,
                style: TextStyle(
                    fontSize: 12, color: context.colors.textMuted)),
          ]),
        ),
      );
}
