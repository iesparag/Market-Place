import 'package:flutter/material.dart';

/// Static fallback constants (used where a value is truly fixed, e.g. text/ink).
/// The *accent* colours are variable — see [BrandTokens] below, which is what
/// widgets read at runtime so the admin dashboard can recolour the whole app.
class BrandColors {
  static const ink = Color(0xFF15181C);
  static const ink2 = Color(0xFF26262B);
  static const bg = Color(0xFFF3F6F4); // soft canvas
  static const surface = Colors.white;
  static const border = Color(0xFFE7E7EC);
  static const textMuted = Color(0xFF6B7280);
  static const star = Color(0xFFF59E0B);
  static const success = Color(0xFF16A34A);
  static const danger = Color(0xFFE23744);

  // Green defaults — the seed for [BrandTokens.green]. Kept so any widget that
  // still references a static token stays visually consistent with the tokens.
  static const brand500 = Color(0xFF17A55A);
  static const brand600 = Color(0xFF0B8A45);
  static const brand700 = Color(0xFF076B34);
  static const brandSoft = Color(0xFFE7F6EC);
  static const gradientStart = Color(0xFF17A55A);
  static const gradientEnd = Color(0xFF0B7A43);
  static const brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [gradientStart, gradientEnd],
  );
}

/// Runtime, admin-configurable brand palette. Read via `context.brand` so the
/// whole app recolours when the backend `/app/config → theme` changes.
class BrandTokens extends ThemeExtension<BrandTokens> {
  final Color primary; // main accent
  final Color primaryDark; // links / pressed / dark text on soft
  final Color soft; // light accent surface (ADD button, chips, rails)
  final Color gStart; // gradient start
  final Color gEnd; // gradient end
  final Color canvas; // page background

  const BrandTokens({
    required this.primary,
    required this.primaryDark,
    required this.soft,
    required this.gStart,
    required this.gEnd,
    required this.canvas,
  });

  LinearGradient get gradient => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [gStart, gEnd],
      );

  /// Soft top-to-bottom wash for the home header.
  LinearGradient get headerWash => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color.lerp(soft, primary, 0.06)!, canvas],
      );

  static const green = BrandTokens(
    primary: Color(0xFF0B8A45),
    primaryDark: Color(0xFF076B34),
    soft: Color(0xFFE7F6EC),
    gStart: Color(0xFF17A55A),
    gEnd: Color(0xFF0B7A43),
    canvas: Color(0xFFF3F6F4),
  );

  /// Build tokens from the backend `theme` object. Any missing field is derived
  /// from `primary`, so an admin only *has* to set one colour.
  factory BrandTokens.fromConfig(Map<String, dynamic>? theme) {
    final primary = _hex(theme?['primary']?.toString()) ?? green.primary;
    return BrandTokens(
      primary: primary,
      primaryDark: _hex(theme?['primaryDark']?.toString()) ?? _shade(primary, -0.14),
      soft: _hex(theme?['soft']?.toString()) ?? _tint(primary),
      gStart: _hex(theme?['gradientStart']?.toString()) ?? _shade(primary, 0.12),
      gEnd: _hex(theme?['gradientEnd']?.toString()) ?? _shade(primary, -0.10),
      canvas: _hex(theme?['canvas']?.toString()) ?? green.canvas,
    );
  }

  @override
  BrandTokens copyWith({
    Color? primary,
    Color? primaryDark,
    Color? soft,
    Color? gStart,
    Color? gEnd,
    Color? canvas,
  }) =>
      BrandTokens(
        primary: primary ?? this.primary,
        primaryDark: primaryDark ?? this.primaryDark,
        soft: soft ?? this.soft,
        gStart: gStart ?? this.gStart,
        gEnd: gEnd ?? this.gEnd,
        canvas: canvas ?? this.canvas,
      );

  @override
  BrandTokens lerp(ThemeExtension<BrandTokens>? other, double t) {
    if (other is! BrandTokens) return this;
    return BrandTokens(
      primary: Color.lerp(primary, other.primary, t)!,
      primaryDark: Color.lerp(primaryDark, other.primaryDark, t)!,
      soft: Color.lerp(soft, other.soft, t)!,
      gStart: Color.lerp(gStart, other.gStart, t)!,
      gEnd: Color.lerp(gEnd, other.gEnd, t)!,
      canvas: Color.lerp(canvas, other.canvas, t)!,
    );
  }
}

Color? _hex(String? s) {
  if (s == null || s.trim().isEmpty) return null;
  var h = s.trim().replaceAll('#', '');
  if (h.length == 6) h = 'FF$h';
  if (h.length != 8) return null;
  final v = int.tryParse(h, radix: 16);
  return v == null ? null : Color(v);
}

Color _shade(Color c, double amount) {
  final h = HSLColor.fromColor(c);
  return h.withLightness((h.lightness + amount).clamp(0.0, 1.0)).toColor();
}

Color _tint(Color c) {
  final h = HSLColor.fromColor(c);
  return h.withLightness(0.94).withSaturation((h.saturation * 0.55).clamp(0.0, 1.0)).toColor();
}

/// `context.brand` → the active runtime palette.
extension BrandContext on BuildContext {
  BrandTokens get brand =>
      Theme.of(this).extension<BrandTokens>() ?? BrandTokens.green;
}

class AppTheme {
  static ThemeData light([BrandTokens tokens = BrandTokens.green]) {
    final base = ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: tokens.canvas,
      colorScheme: ColorScheme.fromSeed(
        seedColor: tokens.primary,
        primary: tokens.primary,
        surface: BrandColors.surface,
      ),
      fontFamily: 'Roboto',
      extensions: [tokens],
    );
    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: tokens.soft,
        foregroundColor: BrandColors.ink,
        elevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: const TextStyle(
          color: BrandColors.ink,
          fontSize: 18,
          fontWeight: FontWeight.w900,
        ),
      ),
      textTheme: base.textTheme.apply(
        bodyColor: BrandColors.ink,
        displayColor: BrandColors.ink,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: tokens.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: tokens.primaryDark),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(foregroundColor: tokens.primaryDark),
      ),
      chipTheme: base.chipTheme.copyWith(
        selectedColor: tokens.soft,
        checkmarkColor: tokens.primaryDark,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BrandColors.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
          borderSide: BorderSide(color: tokens.primary, width: 1.5),
        ),
      ),
    );
  }
}
