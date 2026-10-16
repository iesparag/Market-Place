import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/push/push_service.dart';
import 'core/theme/theme.dart';
import 'data/providers.dart';
import 'router.dart';

const _themeCacheKey = 'cached_theme_json';

void _handleNotificationLink(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) {
    appRouter.go('/');
    return;
  }
  final uri = Uri.tryParse(trimmed);
  String target = trimmed;
  if (uri != null && uri.hasScheme) {
    target = uri.path;
    if (uri.hasQuery) {
      target = '$target?${uri.query}';
    }
  }
  if (!target.startsWith('/')) {
    target = '/$target';
  }
  appRouter.go(target);
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initPush();
  listenForNotificationTaps(_handleNotificationLink);
  final prefs = await SharedPreferences.getInstance();
  runApp(ProviderScope(
    overrides: [sharedPrefsProvider.overrideWithValue(prefs)],
    child: const MarketplaceApp(),
  ));
}

class MarketplaceApp extends ConsumerWidget {
  const MarketplaceApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(sharedPrefsProvider);
    final config = ref.watch(appConfigProvider);

    // Persist the theme whenever fresh config arrives, so the NEXT cold start
    // (splash included) is already themed instead of flashing the default green.
    ref.listen(appConfigProvider, (_, next) {
      next.whenData((c) {
        final theme = c['theme'];
        if (theme != null) prefs.setString(_themeCacheKey, jsonEncode(theme));
      });
    });

    // Live config wins; while it loads (or offline) fall back to the last cached
    // theme so the app + splash open in the admin-chosen colour immediately.
    final live = config.asData?.value;
    BrandTokens tokens;
    if (live != null) {
      tokens = BrandTokens.fromConfig(
          (live['theme'] as Map?)?.cast<String, dynamic>());
    } else {
      tokens = _cachedTokens(prefs);
    }

    return MaterialApp.router(
      title: 'Marketplace',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(tokens),
      routerConfig: appRouter,
    );
  }

  BrandTokens _cachedTokens(SharedPreferences prefs) {
    final raw = prefs.getString(_themeCacheKey);
    if (raw == null) return BrandTokens.green;
    try {
      return BrandTokens.fromConfig(
          (jsonDecode(raw) as Map).cast<String, dynamic>());
    } catch (_) {
      return BrandTokens.green;
    }
  }
}
