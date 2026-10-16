import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../core/auth/auth_controller.dart';
import '../../shared/widgets/safe_pop_scope.dart';
import '../shell/app_shell.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    return SafePopScope(
      child: Scaffold(
        appBar: AppBar(
          leading: const AppBackButton(),
          title: const Text('Account'),
        ),
      body: ListView(
        children: [
          Container(
            decoration: BoxDecoration(gradient: context.brand.gradient),
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 26),
            child: Row(children: [
              Container(
                width: 60,
                height: 60,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Color(0x33000000), blurRadius: 10, offset: Offset(0, 3))],
                ),
                alignment: Alignment.center,
                child: Text(
                    user != null && user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
                    style: TextStyle(color: context.brand.primaryDark, fontSize: 26, fontWeight: FontWeight.w900)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user?.name ?? 'Guest',
                        style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 2),
                    Text(user?.email ?? 'Sign in to see your orders',
                        style: const TextStyle(color: Colors.white, fontSize: 13)),
                  ],
                ),
              ),
              if (user == null)
                ElevatedButton(
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: context.brand.primaryDark),
                    onPressed: () => context.push('/login'),
                    child: const Text('Sign in')),
            ]),
          ),
          const SizedBox(height: 10),
          // Orders has no bottom-nav tab — this IS the way to it, a plain pushed route.
          _tile(Icons.receipt_long_rounded, 'Your orders', () => context.push('/orders')),
          _tile(Icons.location_on_outlined, 'Addresses',
              () => context.push('/addresses')),
          _tile(Icons.storefront_outlined, 'Become a vendor',
              () => context.push('/become-vendor')),
          _tile(Icons.help_outline_rounded, 'Help & support', () => context.push('/support')),
          if (user != null) ...[
            const Divider(height: 8),
            SwitchListTile(
              secondary: const Icon(Icons.chat_outlined, color: BrandColors.ink),
              title: const Text('WhatsApp updates & offers',
                  style: TextStyle(fontWeight: FontWeight.w600, color: BrandColors.ink)),
              subtitle: const Text('Cart reminders and deals on WhatsApp — you can turn this off anytime',
                  style: TextStyle(fontSize: 12, color: BrandColors.textMuted)),
              value: user.whatsappOptIn,
              onChanged: (v) async {
                try {
                  await ref.read(authProvider.notifier).setWhatsappOptIn(v);
                } catch (_) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context)
                        .showSnackBar(const SnackBar(content: Text('Could not update preference — try again.')));
                  }
                }
              },
            ),
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
      bottomNavigationBar: const AppBottomNav(),
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
