import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lottie/lottie.dart';
import '../../core/theme/theme.dart';
import '../../data/providers.dart';
import '../../models/festival.dart';

/// Shows the festival greeting once per day (not once ever — a 5-day Diwali window
/// still deserves a fresh "good morning, happy Diwali" each day, just not twice in
/// one session). Call from a screen's `build` via `ref.listen(festivalProvider, ...)`
/// so it fires exactly once when the data arrives, not on every rebuild.
Future<void> maybeShowFestivalGreeting(BuildContext context, WidgetRef ref, FestivalModel festival) async {
  final prefs = ref.read(sharedPrefsProvider);
  final todayKey = 'festival_seen_${festival.id}_${DateTime.now().toIso8601String().substring(0, 10)}';
  if (prefs.getBool(todayKey) == true) return;
  await prefs.setBool(todayKey, true);
  if (!context.mounted) return;

  showGeneralDialog(
    context: context,
    barrierLabel: festival.name,
    barrierDismissible: true,
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 280),
    pageBuilder: (_, __, ___) => _FestivalGreetingDialog(festival: festival),
    transitionBuilder: (_, anim, __, child) => ScaleTransition(
      scale: CurvedAnimation(parent: anim, curve: Curves.easeOutBack),
      child: FadeTransition(opacity: anim, child: child),
    ),
  );
}

class _FestivalGreetingDialog extends StatelessWidget {
  final FestivalModel festival;
  const _FestivalGreetingDialog({required this.festival});

  @override
  Widget build(BuildContext context) {
    final accent = _hex(festival.themeColor) ?? context.brand.primary;
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 28),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          SizedBox(
            height: 180,
            child: Lottie.network(
              festival.lottieUrl,
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => Icon(Icons.celebration_rounded, size: 72, color: accent),
            ),
          ),
          Text(festival.greetingTitle, textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
          if (festival.greetingMessage.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(festival.greetingMessage, textAlign: TextAlign.center, style: const TextStyle(color: BrandColors.textMuted, height: 1.4)),
          ],
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            height: 46,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: accent),
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Shop festive offers'),
            ),
          ),
        ]),
      ),
    );
  }

  Color? _hex(String? s) {
    if (s == null || s.trim().isEmpty) return null;
    var h = s.trim().replaceAll('#', '');
    if (h.length == 6) h = 'FF$h';
    if (h.length != 8) return null;
    final v = int.tryParse(h, radix: 16);
    return v == null ? null : Color(v);
  }
}
