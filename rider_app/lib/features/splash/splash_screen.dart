import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/theme.dart';

/// Waits for AuthController to finish restoring a session (reading the stored token
/// + confirming it with GET /riders/me) before routing to home or login. Deliberately
/// kept in RiderColors' own deep blue (not customer_app's orange) — the in-code
/// rationale in theme.dart stands: a rider should never mistake this app for the
/// customer-facing one at a glance, even on the launch screen.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});
  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _markScale;
  late final Animation<double> _markFade;
  late final Animation<Offset> _textSlide;
  late final Animation<double> _textFade;

  static const _holdMs = 1600;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));
    _markFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.45, curve: Curves.easeOut));
    _markScale = Tween(begin: 0.4, end: 1.0)
        .animate(CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.55, curve: Curves.elasticOut)));
    _textFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0.4, 0.75, curve: Curves.easeOut));
    _textSlide = Tween(begin: const Offset(0, 0.3), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: const Interval(0.4, 0.75, curve: Curves.easeOutCubic)));
    _ctrl.forward();
    _wait();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _wait() async {
    final start = DateTime.now();
    final notifier = ref.read(authProvider.notifier);
    while (!notifier.ready) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    final elapsed = DateTime.now().difference(start).inMilliseconds;
    if (elapsed < _holdMs) await Future.delayed(Duration(milliseconds: _holdMs - elapsed));
    if (!mounted) return;
    context.go(notifier.isLoggedIn ? '/' : '/login');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SizedBox.expand(
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [RiderColors.primary, RiderColors.primaryDark],
            ),
          ),
          child: SafeArea(
            child: Column(
              children: [
                const Spacer(),
                FadeTransition(
                  opacity: _markFade,
                  child: ScaleTransition(
                    scale: _markScale,
                    child: Container(
                      width: 110,
                      height: 110,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(30),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 28, offset: const Offset(0, 12)),
                        ],
                      ),
                      alignment: Alignment.center,
                      child: const Icon(Icons.two_wheeler_rounded, color: RiderColors.primary, size: 58),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                SlideTransition(
                  position: _textSlide,
                  child: FadeTransition(
                    opacity: _textFade,
                    child: const Column(
                      children: [
                        Text('Marketplace Rider',
                            style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 0.3)),
                        SizedBox(height: 8),
                        Text('Accept jobs. Navigate. Deliver.',
                            style: TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.w600)),
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
