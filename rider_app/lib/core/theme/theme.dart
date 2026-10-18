import 'package:flutter/material.dart';

/// Distinct from customer_app's palette on purpose — a rider should never mistake
/// this app for the customer-facing one at a glance.
class RiderColors {
  static const primary = Color(0xFF1E3A8A); // deep blue
  static const primaryDark = Color(0xFF172554);
  static const bg = Color(0xFFF3F4F6);
  static const surface = Colors.white;
  static const border = Color(0xFFE5E7EB);
  static const textMuted = Color(0xFF6B7280);
  static const success = Color(0xFF16A34A);
  static const warning = Color(0xFFD97706);
  static const danger = Color(0xFFDC2626);
}

class RiderTheme {
  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: RiderColors.bg,
      colorScheme: ColorScheme.fromSeed(seedColor: RiderColors.primary, primary: RiderColors.primary),
      fontFamily: 'Roboto',
    );
    return base.copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: RiderColors.surface,
        foregroundColor: Colors.black,
        elevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(color: Colors.black, fontSize: 18, fontWeight: FontWeight.w900),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: RiderColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: RiderColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: RiderColors.border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: RiderColors.border)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: RiderColors.primary, width: 1.5)),
      ),
    );
  }

  static ThemeData dark() {
    const bgDark = Color(0xFF0F172A);
    const surfaceDark = Color(0xFF1E293B);
    const borderDark = Color(0xFF334155);

    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bgDark,
      cardColor: surfaceDark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF3B82F6),
        primary: const Color(0xFF3B82F6),
        brightness: Brightness.dark,
        surface: surfaceDark,
      ),
      fontFamily: 'Roboto',
    );
    return base.copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: surfaceDark,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF2563EB),
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceDark,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: borderDark)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: borderDark)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF3B82F6), width: 1.5)),
      ),
    );
  }
}

extension RiderContextColors on BuildContext {
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
  Color get surfaceColor => isDark ? const Color(0xFF1E293B) : Colors.white;
  Color get cardBgColor => isDark ? const Color(0xFF1E293B) : Colors.white;
  Color get scaffoldBgColor => isDark ? const Color(0xFF0F172A) : RiderColors.bg;
  Color get borderColor => isDark ? const Color(0xFF334155) : RiderColors.border;
  Color get textColor => isDark ? const Color(0xFFF8FAFC) : Colors.black;
  Color get mutedTextColor => isDark ? const Color(0xFF94A3B8) : RiderColors.textMuted;
  Color get highlightBgColor => isDark ? const Color(0xFF1E3A5F) : const Color(0xFFEFF6FF);
}
