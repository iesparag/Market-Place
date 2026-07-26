import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/theme.dart';
import 'data/providers.dart';
import 'router.dart';

void main() {
  runApp(const ProviderScope(child: MarketplaceApp()));
}

class MarketplaceApp extends ConsumerWidget {
  const MarketplaceApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Palette is driven by the backend `/app/config → theme`, so the super-admin
    // can recolour the whole app from the dashboard. Falls back to green.
    final config = ref.watch(appConfigProvider);
    final tokens = config.maybeWhen(
      data: (c) => BrandTokens.fromConfig(
          (c['theme'] as Map?)?.cast<String, dynamic>()),
      orElse: () => BrandTokens.green,
    );
    return MaterialApp.router(
      title: 'Marketplace',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(tokens),
      routerConfig: appRouter,
    );
  }
}
