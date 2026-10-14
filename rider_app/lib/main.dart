import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/theme.dart';
import 'router.dart';

void main() {
  runApp(const ProviderScope(child: RiderApp()));
}

class RiderApp extends StatelessWidget {
  const RiderApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Rider App',
      debugShowCheckedModeBanner: false,
      theme: RiderTheme.light(),
      routerConfig: appRouter,
    );
  }
}
