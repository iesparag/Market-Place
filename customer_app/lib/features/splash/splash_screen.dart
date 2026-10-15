import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lottie/lottie.dart';
import '../../core/config.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';

/// Launch screen: animated brand reveal (~2s, BigBasket/Blinkit-style), checks the
/// version gate, then routes. Lottie-ready: drop a file at assets/lottie/splash.json
/// (declare it under flutter/assets in pubspec.yaml) and it plays automatically in
/// place of the built-in animation below — no code change needed, see [_Mark].
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});
  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> with SingleTickerProviderStateMixin {
  String _adTitle = 'Everything at one place';
  String _adSubtitle = 'Groceries, fashion, electronics, food & more.';

  late final AnimationController _ctrl;
  late final Animation<double> _ringScale;
  late final Animation<double> _ringFade;
  late final Animation<double> _logoScale;
  late final Animation<double> _logoFade;
  late final Animation<Offset> _textSlide;
  late final Animation<double> _textFade;

  static const _holdMs = 2000;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));
    _ringFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.4, curve: Curves.easeOut));
    _ringScale = Tween(begin: 0.4, end: 1.0)
        .animate(CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.5, curve: Curves.easeOut)));
    _logoFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0.05, 0.35, curve: Curves.easeOut));
    _logoScale = Tween(begin: 0.3, end: 1.0)
        .animate(CurvedAnimation(parent: _ctrl, curve: const Interval(0.05, 0.55, curve: Curves.elasticOut)));
    _textFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0.45, 0.8, curve: Curves.easeOut));
    _textSlide = Tween(begin: const Offset(0, 0.4), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: const Interval(0.45, 0.8, curve: Curves.easeOutCubic)));
    _ctrl.forward();
    _boot();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
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

    final elapsed = DateTime.now().difference(start).inMilliseconds;
    if (elapsed < _holdMs) await Future.delayed(Duration(milliseconds: _holdMs - elapsed));
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
      body: SizedBox.expand(
        child: DecoratedBox(
          decoration: BoxDecoration(gradient: b.gradient),
          child: SafeArea(
            child: Column(
              children: [
                const Spacer(),
                _Mark(ringScale: _ringScale, ringFade: _ringFade, logoScale: _logoScale, logoFade: _logoFade, brand: b),
                const SizedBox(height: 22),
                SlideTransition(
                  position: _textSlide,
                  child: FadeTransition(
                    opacity: _textFade,
                    child: Column(
                      children: [
                        const Text('Marketplace',
                            style: TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: 0.3)),
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
                      ],
                    ),
                  ),
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

/// The animated brand mark. Tries a bundled Lottie file first (drop one at
/// assets/lottie/splash.json — the folder is already declared under flutter/assets
/// in pubspec.yaml, no rebuild config needed) and falls back to a built-in pop-in
/// animation (expanding ring + elastic logo scale) when that file doesn't exist yet,
/// so the splash never breaks waiting on an asset nobody has added.
class _Mark extends StatelessWidget {
  final Animation<double> ringScale, ringFade, logoScale, logoFade;
  final BrandTokens brand;
  const _Mark({
    required this.ringScale,
    required this.ringFade,
    required this.logoScale,
    required this.logoFade,
    required this.brand,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 180,
      height: 180,
      child: Lottie.asset(
        'assets/lottie/splash.json',
        repeat: false,
        errorBuilder: (context, error, stack) => _fallback(),
      ),
    );
  }

  Widget _fallback() {
    return Stack(
        alignment: Alignment.center,
        children: [
          FadeTransition(
            opacity: ringFade,
            child: ScaleTransition(
              scale: ringScale,
              child: Container(
                width: 170,
                height: 170,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 2),
                ),
              ),
            ),
          ),
          FadeTransition(
            opacity: ringFade,
            child: ScaleTransition(
              scale: ringScale,
              child: Container(
                width: 132,
                height: 132,
                decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.12)),
              ),
            ),
          ),
          FadeTransition(
            opacity: logoFade,
            child: ScaleTransition(
              scale: logoScale,
              child: Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(26),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 24, offset: const Offset(0, 10))],
                ),
                alignment: Alignment.center,
                child: Icon(Icons.storefront_rounded, color: brand.primary, size: 50),
              ),
            ),
          ),
        ],
      );
  }
}
