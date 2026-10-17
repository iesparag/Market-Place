import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/theme.dart';

/// An ApiException's message is backend-supplied and already written for a customer to
/// read (e.g. "This item is no longer available", "Kapda Junction doesn't deliver to
/// your selected address") — safe to show as-is, often genuinely actionable. Anything
/// else (a raw Dart/platform exception — a type error, a socket failure, a parsing bug)
/// is a symptom of a client bug, not something a customer should see verbatim, so it's
/// hidden behind one plain fallback instead of leaking `e.toString()` onto the screen.
/// Shared by ErrorView (full-screen) and any SnackBar that needs the same judgment call.
String friendlyError(Object error,
        {String fallback = 'Something went wrong. Please try again.'}) =>
    error is ApiException ? error.message : fallback;

/// Friendly error display for an AsyncValue's error branch — see [friendlyError].
class ErrorView extends StatelessWidget {
  final Object error;
  const ErrorView({super.key, required this.error});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(friendlyError(error),
            textAlign: TextAlign.center,
            style: TextStyle(color: context.colors.textMuted)),
      ),
    );
  }
}
