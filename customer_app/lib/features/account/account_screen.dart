import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../core/auth/auth_controller.dart';
import '../shell/app_shell.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        children: [
          Container(
            color: BrandColors.ink,
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            child: Row(children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: context.brand.primary,
                child: Text(
                    user != null && user.name.isNotEmpty
                        ? user.name[0].toUpperCase()
                        : '?',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user?.name ?? 'Guest',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w800)),
                    Text(user?.email ?? 'Sign in to see your orders',
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 13)),
                  ],
                ),
              ),
              if (user == null)
                ElevatedButton(
                    onPressed: () => context.push('/login'),
                    child: const Text('Sign in')),
            ]),
          ),
          const SizedBox(height: 8),
          // Same destination as the bottom-nav Orders tab (index 3 in app_shell.dart) —
          // switch the shared tab index instead of pushing a second /orders route, so
          // there's one consistent way to get there, not two with different back behavior.
          _tile(Icons.receipt_long_rounded, 'Your orders',
              () => ref.read(shellTabProvider.notifier).state = 3),
          _tile(Icons.location_on_outlined, 'Addresses',
              () => context.push('/addresses')),
          _tile(Icons.storefront_outlined, 'Become a vendor',
              () => context.push('/become-vendor')),
          _tile(Icons.help_outline_rounded, 'Help & support', () => context.push('/support')),
          if (user != null) ...[
            const Divider(height: 24),
            _tile(Icons.logout_rounded, 'Log out',
                () => ref.read(authProvider.notifier).logout(),
                danger: true),
          ],
          const SizedBox(height: 20),
          const Center(
              child: Text('Marketplace · demo app',
                  style:
                      TextStyle(color: BrandColors.textMuted, fontSize: 12))),
        ],
      ),
    );
  }

  Widget _tile(IconData icon, String label, VoidCallback onTap,
          {bool danger = false}) =>
      ListTile(
        leading:
            Icon(icon, color: danger ? BrandColors.danger : BrandColors.ink),
        title: Text(label,
            style: TextStyle(
                fontWeight: FontWeight.w600,
                color: danger ? BrandColors.danger : BrandColors.ink)),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
      );
}
