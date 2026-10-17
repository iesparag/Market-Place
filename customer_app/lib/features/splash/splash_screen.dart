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

class _SplashScreenState extends ConsumerState<SplashScreen>
    with SingleTickerProviderStateMixin {
  String _adTitle = 'Everything at one place';
  String _adSubtitle = 'Groceries, fashion, electronics, food & more.';

  late final AnimationController _ctrl;
  late final Animation<Offset> _textSlide;
  late final Animation<double> _textFade;

  static const _holdMs = 2000;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1400));
    _textFade = CurvedAnimation(
        parent: _ctrl, curve: const Interval(0.5, 0.85, curve: Curves.easeOut));
    _textSlide = Tween(begin: const Offset(0, 0.4), end: Offset.zero).animate(
        CurvedAnimation(
            parent: _ctrl,
            curve: const Interval(0.5, 0.85, curve: Curves.easeOutCubic)));
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
    if (elapsed < _holdMs)
      await Future.delayed(Duration(milliseconds: _holdMs - elapsed));
    if (!mounted) return;

    // No version → we could not read our own build; let the user in rather than
    // gate them on a comparison we cannot make.
    if (config != null && currentVersion != null) {
      final min = config['minVersion']?.toString() ?? '1.0.0';
      if (isVersionBelow(currentVersion, min)) {
        context.go(
            '/force-update?url=${Uri.encodeComponent(config['updateUrl']?.toString() ?? '')}&msg=${Uri.encodeComponent(config['updateMessage']?.toString() ?? '')}');
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
                const SizedBox(height: 32),
                SlideTransition(
                  position: _textSlide,
                  child: FadeTransition(
                    opacity: _textFade,
                    child: Column(
                      children: [
                        const Text('Marketplace',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 30,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.3)),
                        const SizedBox(height: 8),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 40),
                          child: Text(_adTitle,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700)),
                        ),
                        const SizedBox(height: 4),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 40),
                          child: Text(_adSubtitle,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 13)),
                        ),
                      ],
                    ),
                  ),
                ),
                const Spacer(),
                const SizedBox(
                    width: 26,
                    height: 26,
                    child: CircularProgressIndicator(
                        strokeWidth: 2.4, color: Colors.white)),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Rich Category & Event Badges orbiting and overlapping around the central brand mark
class _OrbitBadge {
  final IconData? icon;
  final String? emoji;
  final String label;
  final Color iconColor;
  final Color bgColor;
  final Alignment align;
  final double startAt;
  final double phase;
  final bool isEventBadge;
  final String? subtext;

  const _OrbitBadge({
    this.icon,
    this.emoji,
    required this.label,
    required this.iconColor,
    required this.bgColor,
    required this.align,
    required this.startAt,
    this.phase = 0.0,
    this.isEventBadge = false,
    this.subtext,
  });
}

const _orbitBadges = [
  // ── Big Category Badges (matching home category grid) ──
  _OrbitBadge(
    icon: Icons.shopping_basket_rounded,
    emoji: '🛒',
    label: 'Grocery',
    iconColor: Color(0xFFD97706),
    bgColor: Color(0xFFFEF3C7),
    align: Alignment(1.15, -0.35),
    startAt: 0.12,
    phase: 0.5,
  ),
  _OrbitBadge(
    icon: Icons.checkroom_rounded,
    emoji: '👗',
    label: 'Fashion',
    iconColor: Color(0xFFDB2777),
    bgColor: Color(0xFFFCE7F3),
    align: Alignment(0.85, -0.98),
    startAt: 0.18,
    phase: 2.2,
  ),
  _OrbitBadge(
    icon: Icons.eco_rounded,
    emoji: '🥦',
    label: 'Fresh Sabji',
    iconColor: Color(0xFF059669),
    bgColor: Color(0xFFD1FAE5),
    align: Alignment(-1.15, -0.25),
    startAt: 0.22,
    phase: 3.8,
  ),
  _OrbitBadge(
    icon: Icons.smartphone_rounded,
    emoji: '📱',
    label: 'Tech',
    iconColor: Color(0xFF0284C7),
    bgColor: Color(0xFFE0F2FE),
    align: Alignment(0.92, 0.75),
    startAt: 0.28,
    phase: 5.1,
  ),
  _OrbitBadge(
    icon: Icons.headphones_rounded,
    emoji: '🎧',
    label: 'Audio',
    iconColor: Color(0xFF6366F1),
    bgColor: Color(0xFFEDE9FE),
    align: Alignment(-0.85, -0.98),
    startAt: 0.10,
    phase: 1.0,
  ),
  _OrbitBadge(
    icon: Icons.local_pizza_rounded,
    emoji: '🍕',
    label: 'Food & Cafe',
    iconColor: Color(0xFFEA580C),
    bgColor: Color(0xFFFFEDD5),
    align: Alignment(-0.88, 0.78),
    startAt: 0.32,
    phase: 4.2,
  ),

  // ── Overlapping Event & Offer Badges ──
  _OrbitBadge(
    icon: Icons.bolt_rounded,
    label: '⚡ 10-Min Now',
    iconColor: Color(0xFFB45309),
    bgColor: Color(0xFFFEF08A),
    align: Alignment(-0.02, -0.95),
    startAt: 0.36,
    phase: 1.8,
    isEventBadge: true,
    subtext: 'Instant Delivery',
  ),
  _OrbitBadge(
    icon: Icons.celebration_rounded,
    label: '🎉 Mega Sale',
    iconColor: Color(0xFFBE185D),
    bgColor: Color(0xFFFFE4E6),
    align: Alignment(0.05, 0.95),
    startAt: 0.42,
    phase: 3.4,
    isEventBadge: true,
    subtext: 'Up to 80% OFF',
  ),
];

class _Mark extends StatelessWidget {
  final Animation<double>
      progress; // the raw controller, 0..1 over the whole splash
  final BrandTokens brand;
  const _Mark({required this.progress, required this.brand});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 320,
      height: 320,
      child: Lottie.asset(
        'assets/lottie/splash.json',
        repeat: false,
        errorBuilder: (context, error, stack) => _fallback(),
      ),
    );
  }

  Widget _fallback() {
    final ringFade = CurvedAnimation(
        parent: progress,
        curve: const Interval(0, 0.45, curve: Curves.easeOut));
    final ringScale = Tween(begin: 0.25, end: 1.0).animate(CurvedAnimation(
        parent: progress,
        curve: const Interval(0, 0.55, curve: Curves.easeOutBack)));
    final logoFade = CurvedAnimation(
        parent: progress,
        curve: const Interval(0.05, 0.3, curve: Curves.easeOut));
    final logoScale = Tween(begin: 0.3, end: 1.0).animate(CurvedAnimation(
        parent: progress,
        curve: const Interval(0.05, 0.58, curve: Curves.elasticOut)));

    return SizedBox(
      width: 320,
      height: 320,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          // Outer decorative glowing ring
          FadeTransition(
            opacity: ringFade,
            child: ScaleTransition(
              scale: ringScale,
              child: Container(
                width: 270,
                height: 270,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: Colors.white.withValues(alpha: 0.2), width: 1.8),
                ),
              ),
            ),
          ),
          // Middle orbital ring
          FadeTransition(
            opacity: ringFade,
            child: ScaleTransition(
              scale: ringScale,
              child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: Colors.white.withValues(alpha: 0.35), width: 2),
                ),
              ),
            ),
          ),
          // Inner halo glow
          FadeTransition(
            opacity: ringFade,
            child: ScaleTransition(
              scale: ringScale,
              child: Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.15),
                ),
              ),
            ),
          ),

          // Central Brand Mark (Clean 3D store card with depth)
          FadeTransition(
            opacity: logoFade,
            child: ScaleTransition(
              scale: logoScale,
              child: Container(
                width: 104,
                height: 104,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(30),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.22),
                      blurRadius: 30,
                      offset: const Offset(0, 14),
                    ),
                    BoxShadow(
                      color: brand.primary.withValues(alpha: 0.3),
                      blurRadius: 18,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.storefront_rounded,
                        color: brand.primary, size: 52),
                    const SizedBox(height: 3),
                    Container(
                      width: 32,
                      height: 3.5,
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

          // Category shopping badges + overlapping event badges orbiting around
          for (final badge in _orbitBadges)
            Align(
              alignment: badge.align,
              child: _OrbitBadgeView(
                progress: progress,
                badge: badge,
              ),
            ),
        ],
      ),
    );
  }
}

class _OrbitBadgeView extends StatelessWidget {
  final Animation<double> progress;
  final _OrbitBadge badge;

  const _OrbitBadgeView({
    required this.progress,
    required this.badge,
  });

  @override
  Widget build(BuildContext context) {
    final fade = CurvedAnimation(
      parent: progress,
      curve: Interval(badge.startAt, (badge.startAt + 0.25).clamp(0.0, 1.0),
          curve: Curves.easeOut),
    );
    final scale = Tween(begin: 0.1, end: 1.0).animate(
      CurvedAnimation(
        parent: progress,
        curve: Interval(badge.startAt, (badge.startAt + 0.35).clamp(0.0, 1.0),
            curve: Curves.elasticOut),
      ),
    );

    return AnimatedBuilder(
      animation: progress,
      builder: (context, child) {
        // Organic gentle floating motion
        final t = progress.value * 6.28 + badge.phase;
        final dy = (progress.value > badge.startAt + 0.15)
            ? (4.0 * (1 - (progress.value - 0.5).abs()) * (t % 2 == 0 ? 1 : -1))
            : 0.0;

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
      child: badge.isEventBadge ? _buildEventBadge() : _buildCategoryBadge(),
    );
  }

  /// Big category icon bubble (matching category grid with depth)
  Widget _buildCategoryBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: badge.bgColor, width: 2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.15),
            blurRadius: 12,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: badge.bgColor,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: badge.emoji != null
                ? Text(badge.emoji!, style: const TextStyle(fontSize: 18))
                : Icon(badge.icon, size: 18, color: badge.iconColor),
          ),
          const SizedBox(width: 7),
          Text(
            badge.label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: badge.iconColor,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }

  /// Special Overlapping Event / Deal Badge (e.g. 10-Min Delivery, Mega Sale)
  Widget _buildEventBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
            color: badge.iconColor.withValues(alpha: 0.35), width: 1.6),
        boxShadow: [
          BoxShadow(
            color: badge.iconColor.withValues(alpha: 0.25),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: badge.bgColor,
              shape: BoxShape.circle,
            ),
            child: Icon(badge.icon, size: 16, color: badge.iconColor),
          ),
          const SizedBox(width: 6),
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                badge.label,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w900,
                  color: badge.iconColor,
                ),
              ),
              if (badge.subtext != null)
                Text(
                  badge.subtext!,
                  style: const TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF475569),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
