import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/theme.dart';
import '../../core/auth/auth_controller.dart';
import '../../data/providers.dart';
import '../../data/payment_repository.dart' show FeatureFlags;
import '../../shared/widgets/safe_pop_scope.dart';
import '../shell/app_shell.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider);
    final features =
        ref.watch(pricingSettingsProvider).valueOrNull?.features ??
            const FeatureFlags();
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
                    boxShadow: [
                      BoxShadow(
                          color: Color(0x33000000),
                          blurRadius: 10,
                          offset: Offset(0, 3))
                    ],
                  ),
                  alignment: Alignment.center,
                  child: Text(
                      user != null && user.name.isNotEmpty
                          ? user.name[0].toUpperCase()
                          : '?',
                      style: TextStyle(
                          color: context.brand.primaryDark,
                          fontSize: 26,
                          fontWeight: FontWeight.w900)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user?.name ?? 'Guest',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 19,
                              fontWeight: FontWeight.w900)),
                      const SizedBox(height: 2),
                      Text(user?.email ?? 'Sign in to see your orders',
                          style: const TextStyle(
                              color: Colors.white, fontSize: 13)),
                    ],
                  ),
                ),
                if (user == null)
                  ElevatedButton(
                      style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: context.brand.primaryDark),
                      onPressed: () => context.push('/login'),
                      child: const Text('Sign in')),
              ]),
            ),
            const SizedBox(height: 10),
            if (user != null && features.loyaltyEnabled) const _LoyaltyPointsTile(),
            // Orders has no bottom-nav tab — this IS the way to it, a plain pushed route.
            _tile(context, Icons.receipt_long_rounded, 'Your orders',
                () => context.push('/orders')),
            if (user != null && features.referralEnabled)
              _tile(context, Icons.card_giftcard_rounded, 'Invite a friend',
                  () => context.push('/refer')),
            _tile(context, Icons.location_on_outlined, 'Addresses',
                () => context.push('/addresses')),
            _tile(context, Icons.storefront_outlined, 'Become a vendor',
                () => context.push('/become-vendor')),
            _tile(context, Icons.help_outline_rounded, 'Help & support',
                () => context.push('/support')),
            const Divider(height: 8),
            const _AppearanceSection(),
            if (user != null) ...[
              const Divider(height: 8),
              SwitchListTile(
                secondary: Icon(Icons.chat_outlined, color: context.colors.ink),
                title: Text('WhatsApp updates & offers',
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: context.colors.ink)),
                subtitle: Text(
                    'Cart reminders and deals on WhatsApp — you can turn this off anytime',
                    style: TextStyle(
                        fontSize: 12, color: context.colors.textMuted)),
                value: user.whatsappOptIn,
                onChanged: (v) async {
                  try {
                    await ref.read(authProvider.notifier).setWhatsappOptIn(v);
                  } catch (_) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                          content: Text(
                              'Could not update preference — try again.')));
                    }
                  }
                },
              ),
              const Divider(height: 24),
              _tile(context, Icons.logout_rounded, 'Log out',
                  () => ref.read(authProvider.notifier).logout(),
                  danger: true),
            ],
            const SizedBox(height: 20),
            Center(
                child: Text('Marketplace · demo app',
                    style: TextStyle(
                        color: context.colors.textMuted, fontSize: 12))),
          ],
        ),
        bottomNavigationBar: const AppBottomNav(),
      ),
    );
  }

  Widget _tile(
          BuildContext context, IconData icon, String label, VoidCallback onTap,
          {bool danger = false}) =>
      ListTile(
        leading: Icon(icon,
            color: danger ? context.colors.danger : context.colors.ink),
        title: Text(label,
            style: TextStyle(
                fontWeight: FontWeight.w600,
                color: danger ? context.colors.danger : context.colors.ink)),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
      );
}

class _LoyaltyPointsTile extends ConsumerWidget {
  const _LoyaltyPointsTile();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final balance = ref.watch(loyaltyBalanceProvider).valueOrNull;
    return ListTile(
      leading: Icon(Icons.stars_rounded, color: context.brand.primary),
      title: Text('Loyalty points',
          style: TextStyle(
              fontWeight: FontWeight.w600, color: context.colors.ink)),
      subtitle: Text(
          balance == null
              ? 'Loading…'
              : '${balance.points} points · worth ₹${(balance.valuePaise / 100).toStringAsFixed(0)} — redeem at checkout',
          style: TextStyle(fontSize: 12, color: context.colors.textMuted)),
    );
  }
}

/// Light / Dark / System picker — persisted via ThemeModeController (local cache +
/// synced to the account so it follows the customer across devices). System is the
/// default until they explicitly choose otherwise.
class _AppearanceSection extends ConsumerWidget {
  const _AppearanceSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final user = ref.watch(authProvider);

    Future<void> choose(ThemeMode next) async {
      await ref.read(themeModeProvider.notifier).setMode(
            next,
            onPersist: user == null
                ? null
                : (value) => ref
                    .read(apiClientProvider)
                    .patch('/me', body: {'themePreference': value}),
          );
    }

    Widget option(ThemeMode m, IconData icon, String label) {
      final selected = mode == m;
      return Expanded(
        child: GestureDetector(
          onTap: () => choose(m),
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 4),
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: selected ? context.brand.soft : context.colors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color:
                      selected ? context.brand.primary : context.colors.border),
            ),
            child: Column(
              children: [
                Icon(icon,
                    size: 20,
                    color: selected
                        ? context.brand.primaryDark
                        : context.colors.textMuted),
                const SizedBox(height: 4),
                Text(label,
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: selected
                          ? context.brand.primaryDark
                          : context.colors.textMuted,
                    )),
              ],
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.dark_mode_outlined,
                size: 18, color: context.colors.textMuted),
            const SizedBox(width: 8),
            Text('Appearance',
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: context.colors.ink,
                    fontSize: 13.5)),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            option(ThemeMode.system, Icons.brightness_auto_rounded, 'System'),
            option(ThemeMode.light, Icons.light_mode_rounded, 'Light'),
            option(ThemeMode.dark, Icons.dark_mode_rounded, 'Dark'),
          ]),
        ],
      ),
    );
  }
}
