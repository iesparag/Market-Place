import 'package:flutter/material.dart';

/// Brand palette mirrored from the web app (theme.css) so mobile + web feel identical.
class BrandColors {
  static const brand500 = Color(0xFFF97316);
  static const brand600 = Color(0xFFEA580C); // primary
  static const brand700 = Color(0xFFC2410C);
  static const gradientStart = Color(0xFFFF7A18);
  static const gradientEnd = Color(0xFFFF5A5F);
  static const ink = Color(0xFF17171A);
  static const ink2 = Color(0xFF26262B);
  static const bg = Color(0xFFF6F6F8);
  static const surface = Colors.white;
  static const border = Color(0xFFE7E7EC);
  static const textMuted = Color(0xFF6B6B73);
  static const star = Color(0xFFF59E0B);
  static const success = Color(0xFF16A34A);
  static const danger = Color(0xFFDC2626);

  static const brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [gradientStart, gradientEnd],
  );
}

class AppTheme {
  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: BrandColors.bg,
      colorScheme: ColorScheme.fromSeed(
        seedColor: BrandColors.brand600,
        primary: BrandColors.brand600,
        surface: BrandColors.surface,
      ),
      fontFamily: 'Roboto',
    );
    return base.copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: BrandColors.ink,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      textTheme: base.textTheme.apply(
        bodyColor: BrandColors.ink,
        displayColor: BrandColors.ink,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: BrandColors.brand600,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BrandColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.brand600, width: 1.5),
        ),
      ),
    );
  }
}
