import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/config.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';

/// Launch screen: shows the Marketplace brand/advert, checks the version gate, then routes.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});
  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  String _adTitle = 'Everything at one place';
  String _adSubtitle = 'Groceries, fashion, electronics, food & more.';

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final start = DateTime.now();
    final currentVersion = await Config.loadAppVersion();
    Map<String, dynamic>? config;
    try {
      final c = await ref.read(appConfigProvider.future);
      config = c;
      final ad = c['ad'];
      if (ad is Map && mounted) {
        setState(() {
          _adTitle = ad['title']?.toString() ?? _adTitle;
          _adSubtitle = ad['subtitle']?.toString() ?? _adSubtitle;
        });
      }
    } catch (_) {/* offline / error → continue to app */}

    // Keep the splash visible for at least ~1.8s.
    final elapsed = DateTime.now().difference(start).inMilliseconds;
    if (elapsed < 1800) await Future.delayed(Duration(milliseconds: 1800 - elapsed));
    if (!mounted) return;

    // No version → we could not read our own build; let the user in rather than
    // gate them on a comparison we cannot make.
    if (config != null && currentVersion != null) {
      final min = config['minVersion']?.toString() ?? '1.0.0';
      if (isVersionBelow(currentVersion, min)) {
        context.go('/force-update?url=${Uri.encodeComponent(config['updateUrl']?.toString() ?? '')}&msg=${Uri.encodeComponent(config['updateMessage']?.toString() ?? '')}');
        return;
      }
    }
    context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    final b = context.brand;
    return Scaffold(
      body: SizedBox.expand( // fill the whole screen — no white strip on the sides
        child: DecoratedBox(
          decoration: BoxDecoration(gradient: b.gradient),
          child: SafeArea(
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 96, height: 96,
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(26)),
                alignment: Alignment.center,
                child: Text('M', style: TextStyle(color: b.primary, fontSize: 52, fontWeight: FontWeight.w900)),
              ),
              const SizedBox(height: 18),
              const Text('Marketplace', style: TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: 0.3)),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: Text(_adTitle, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: Text(_adSubtitle, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontSize: 13)),
              ),
              const Spacer(),
              const SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)),
              const SizedBox(height: 40),
            ],
          ),
          ),
        ),
      ),
    );
  }
}
