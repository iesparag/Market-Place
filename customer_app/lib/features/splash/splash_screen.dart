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
  late final Animation<Offset> _textSlide;
  late final Animation<double> _textFade;

  static const _holdMs = 2000;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));
    _textFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0.5, 0.85, curve: Curves.easeOut));
    _textSlide = Tween(begin: const Offset(0, 0.4), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: const Interval(0.5, 0.85, curve: Curves.easeOutCubic)));
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
                _Mark(progress: _ctrl, brand: b),
                const SizedBox(height: 14),
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

/// A category icon chip that pops in around the logo — headphones, sabji/veggies, clothes, etc.
/// like BigBasket / Blinkit / Zepto splash animations with gentle floating dynamics.
class _OrbitItem {
  final IconData icon;
  final String label;
  final Color iconColor;
  final Color bgColor;
  final Alignment align;
  final double startAt;
  final double phase; // phase shift for floating bobbing motion

  const _OrbitItem({
    required this.icon,
    required this.label,
    required this.iconColor,
    required this.bgColor,
    required this.align,
    required this.startAt,
    this.phase = 0.0,
  });
}

const _orbitItems = [
  _OrbitItem(
    icon: Icons.headphones_rounded,
    label: 'Audio',
    iconColor: Color(0xFF6366F1), // Indigo
    bgColor: Color(0xFFEEF2FF),
    align: Alignment(-0.95, -0.85),
    startAt: 0.08,
    phase: 0.0,
  ),
  _OrbitItem(
    icon: Icons.checkroom_rounded,
    label: 'Fashion',
    iconColor: Color(0xFFEC4899), // Pink/Rose
    bgColor: Color(0xFFFDF2F8),
    align: Alignment(0.95, -0.85),
    startAt: 0.16,
    phase: 1.5,
  ),
  _OrbitItem(
    icon: Icons.eco_rounded,
    label: 'Sabji',
    iconColor: Color(0xFF10B981), // Emerald
    bgColor: Color(0xFFECFDF5),
    align: Alignment(-1.05, 0.15),
    startAt: 0.24,
    phase: 3.0,
  ),
  _OrbitItem(
    icon: Icons.shopping_basket_rounded,
    label: 'Grocery',
    iconColor: Color(0xFFF59E0B), // Amber
    bgColor: Color(0xFFFFFBEB),
    align: Alignment(1.05, 0.15),
    startAt: 0.32,
    phase: 4.5,
  ),
  _OrbitItem(
    icon: Icons.soup_kitchen_rounded,
    label: 'Home',
    iconColor: Color(0xFF0D9488), // Teal
    bgColor: Color(0xFFCCFBF1),
    align: Alignment(-0.85, 0.95),
    startAt: 0.38,
    phase: 2.0,
  ),
  _OrbitItem(
    icon: Icons.smartphone_rounded,
    label: 'Tech',
    iconColor: Color(0xFF0284C7), // Sky Blue
    bgColor: Color(0xFFE0F2FE),
    align: Alignment(0.85, 0.95),
    startAt: 0.44,
    phase: 5.0,
  ),
];

class _Mark extends StatelessWidget {
  final Animation<double> progress; // the raw controller, 0..1 over the whole splash
  final BrandTokens brand;
  const _Mark({required this.progress, required this.brand});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 250,
      height: 250,
      child: Lottie.asset(
        'assets/lottie/splash.json',
        repeat: false,
        errorBuilder: (context, error, stack) => _fallback(),
      ),
    );
  }

  Widget _fallback() {
    final ringFade = CurvedAnimation(parent: progress, curve: const Interval(0, 0.4, curve: Curves.easeOut));
    final ringScale = Tween(begin: 0.3, end: 1.0)
        .animate(CurvedAnimation(parent: progress, curve: const Interval(0, 0.5, curve: Curves.easeOutBack)));
    final logoFade = CurvedAnimation(parent: progress, curve: const Interval(0.05, 0.3, curve: Curves.easeOut));
    final logoScale = Tween(begin: 0.3, end: 1.0)
        .animate(CurvedAnimation(parent: progress, curve: const Interval(0.05, 0.55, curve: Curves.elasticOut)));

    return SizedBox(
      width: 250,
      height: 250,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Outer pulse glow
          FadeTransition(
            opacity: ringFade,
            child: ScaleTransition(
              scale: ringScale,
              child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withValues(alpha: 0.25), width: 2),
                ),
              ),
            ),
          ),
          // Inner halo
          FadeTransition(
            opacity: ringFade,
            child: ScaleTransition(
              scale: ringScale,
              child: Container(
                width: 150,
                height: 150,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.14),
                ),
              ),
            ),
          ),
          // Category shopping chips orbiting around the logo
          for (final item in _orbitItems)
            Align(
              alignment: item.align,
              child: _OrbitChip(
                progress: progress,
                item: item,
              ),
            ),
          // Central Brand Mark
          FadeTransition(
            opacity: logoFade,
            child: ScaleTransition(
              scale: logoScale,
              child: Container(
                width: 98,
                height: 98,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.18),
                      blurRadius: 28,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.storefront_rounded, color: brand.primary, size: 48),
                    const SizedBox(height: 2),
                    Container(
                      width: 28,
                      height: 3,
                      decoration: BoxDecoration(
                        color: brand.primary,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrbitChip extends StatelessWidget {
  final Animation<double> progress;
  final _OrbitItem item;

  const _OrbitChip({
    required this.progress,
    required this.item,
  });

  @override
  Widget build(BuildContext context) {
    final fade = CurvedAnimation(
      parent: progress,
      curve: Interval(item.startAt, (item.startAt + 0.3).clamp(0.0, 1.0), curve: Curves.easeOut),
    );
    final scale = Tween(begin: 0.1, end: 1.0).animate(
      CurvedAnimation(
        parent: progress,
        curve: Interval(item.startAt, (item.startAt + 0.35).clamp(0.0, 1.0), curve: Curves.elasticOut),
      ),
    );

    return AnimatedBuilder(
      animation: progress,
      builder: (context, child) {
        // Subtle floating bobbing motion using sine wave
        final t = progress.value * 6.28 + item.phase;
        final dy = (progress.value > item.startAt + 0.2) ? (3.5 * (1 - (progress.value - 0.5).abs()) * (t % 2 == 0 ? 1 : -1)) : 0.0;

        return Transform.translate(
          offset: Offset(0, dy),
          child: FadeTransition(
            opacity: fade,
            child: ScaleTransition(
              scale: scale,
              child: child,
            ),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: item.bgColor, width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.12),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: item.bgColor,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Icon(item.icon, size: 16, color: item.iconColor),
            ),
            const SizedBox(width: 5),
            Text(
              item.label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: item.iconColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
