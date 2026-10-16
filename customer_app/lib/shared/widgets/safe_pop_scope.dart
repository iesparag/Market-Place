import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Intercepts system back gesture / button on pushed and deep-linked screens.
/// If there is a route to pop in the navigator stack, it pops.
/// If the screen was opened directly via deep-link (Push, WhatsApp, SMS),
/// it safely navigates to Home ('/') instead of exiting the app.
class SafePopScope extends StatelessWidget {
  final Widget child;
  final VoidCallback? onPop;
  const SafePopScope({super.key, required this.child, this.onPop});

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (onPop != null) {
          onPop!();
        } else if (Navigator.of(context).canPop()) {
          context.pop();
        } else {
          context.go('/');
        }
      },
      child: child,
    );
  }
}

/// Back button for AppBars that safely falls back to Home ('/') if the user
/// arrived via deep-link (Push, WhatsApp, SMS) and has nothing to pop in the stack.
class AppBackButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final Color? color;
  const AppBackButton({super.key, this.onPressed, this.color});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.arrow_back_rounded),
      color: color,
      tooltip: 'Back',
      onPressed: onPressed ??
          () {
            if (Navigator.of(context).canPop()) {
              context.pop();
            } else {
              context.go('/');
            }
          },
    );
  }
}
