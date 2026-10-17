import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'core/push/push_service.dart';
import 'core/theme/theme.dart';
import 'data/providers.dart';
import 'router.dart';

const _themeCacheKey = 'cached_theme_json';
const _themeDarkCacheKey = 'cached_theme_dark_json';

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
    final themeMode = ref.watch(themeModeProvider);

    // Persist both palettes whenever fresh config arrives, so the NEXT cold start
    // (splash included) is already themed instead of flashing the default green —
    // in whichever mode (light/dark/system) ends up active at that next launch.
    ref.listen(appConfigProvider, (_, next) {
      next.whenData((c) {
        final theme = c['theme'];
        final themeDark = c['themeDark'];
        if (theme != null) prefs.setString(_themeCacheKey, jsonEncode(theme));
        if (themeDark != null)
          prefs.setString(_themeDarkCacheKey, jsonEncode(themeDark));
      });
    });

    // Live config wins; while it loads (or offline) fall back to the last cached
    // theme so the app + splash open in the admin-chosen colour immediately.
    final live = config.asData?.value;
    BrandTokens lightTokens;
    BrandTokens darkTokens;
    if (live != null) {
      final lightMap = (live['theme'] as Map?)?.cast<String, dynamic>();
      lightTokens = BrandTokens.fromConfig(lightMap);
      darkTokens = BrandTokens.darkFromConfig(
          (live['themeDark'] as Map?)?.cast<String, dynamic>(),
          lightTokens.primary);
    } else {
      lightTokens = _cachedLightTokens(prefs);
      darkTokens = _cachedDarkTokens(prefs, lightTokens.primary);
    }

    return MaterialApp.router(
      title: 'Marketplace',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(lightTokens),
      darkTheme: AppTheme.dark(darkTokens),
      themeMode: themeMode,
      routerConfig: appRouter,
    );
  }

  BrandTokens _cachedLightTokens(SharedPreferences prefs) {
    final raw = prefs.getString(_themeCacheKey);
    if (raw == null) return BrandTokens.green;
    try {
      return BrandTokens.fromConfig(
          (jsonDecode(raw) as Map).cast<String, dynamic>());
    } catch (_) {
      return BrandTokens.green;
    }
  }

  BrandTokens _cachedDarkTokens(SharedPreferences prefs, Color lightPrimary) {
    final raw = prefs.getString(_themeDarkCacheKey);
    if (raw == null) return BrandTokens.darkFromConfig(null, lightPrimary);
    try {
      return BrandTokens.darkFromConfig(
          (jsonDecode(raw) as Map).cast<String, dynamic>(), lightPrimary);
    } catch (_) {
      return BrandTokens.darkFromConfig(null, lightPrimary);
    }
  }
}
