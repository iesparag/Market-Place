import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/theme.dart';

/// Friendly error display — mirrors customer_app's error_view.dart. An ApiException's
/// message is backend-supplied and safe to show as-is; anything else (a raw Dart/
/// platform exception) is a client-bug symptom, hidden behind one plain message rather
/// than leaking `e.toString()` to the rider.
class ErrorView extends StatelessWidget {
  final Object error;
  const ErrorView({super.key, required this.error});

  @override
  Widget build(BuildContext context) {
    final message = error is ApiException ? (error as ApiException).message : 'Something went wrong. Please try again.';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(message, textAlign: TextAlign.center, style: const TextStyle(color: RiderColors.textMuted)),
      ),
    );
  }
}
