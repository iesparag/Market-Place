import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/theme.dart';

/// Waits for AuthController to finish restoring a session (reading the stored token
/// + confirming it with GET /riders/me) before routing to home or login.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});
  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _wait();
  }

  Future<void> _wait() async {
    final notifier = ref.read(authProvider.notifier);
    while (!notifier.ready) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    if (!mounted) return;
    context.go(notifier.isLoggedIn ? '/' : '/login');
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: RiderColors.primary,
      body: Center(
        child: Icon(Icons.two_wheeler, color: Colors.white, size: 56),
      ),
    );
  }
}
