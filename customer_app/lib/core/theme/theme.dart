import 'package:flutter/material.dart';

/// Static fallback constants (light-mode values; used where a value is truly fixed,
/// e.g. the old all-screens-are-light codebase). Prefer `context.colors.*` in new/
/// updated widgets — it resolves to the correct light/dark value automatically. Kept
/// around (not deleted) since a handful of one-off decorative colors still reference
/// it directly and that's fine for non-structural accents.
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

/// Neutral/semantic UI colors (text, surfaces, borders) that DO change between light
/// and dark — unlike [BrandColors] above, these are resolved at runtime via
/// `context.colors` based on the active [Brightness], not compile-time constants.
/// The brand ACCENT palette (primary/soft/gradient) is separately admin-configurable —
/// see [BrandTokens] — these are the app's own dark-mode-safe neutrals around it.
class AppColors {
  final Color ink; // primary text
  final Color ink2; // secondary/heading text
  final Color bg; // page/scaffold background
  final Color surface; // card/sheet/app-bar background
  final Color border;
  final Color textMuted;
  final Color star;
  final Color success;
  final Color danger;

  const AppColors({
    required this.ink,
    required this.ink2,
    required this.bg,
    required this.surface,
    required this.border,
    required this.textMuted,
    required this.star,
    required this.success,
    required this.danger,
  });

  static const light = AppColors(
    ink: BrandColors.ink,
    ink2: BrandColors.ink2,
    bg: BrandColors.bg,
    surface: Colors.white,
    border: BrandColors.border,
    textMuted: BrandColors.textMuted,
    star: BrandColors.star,
    success: BrandColors.success,
    danger: BrandColors.danger,
  );

  static const dark = AppColors(
    ink: Color(0xFFF1F5F9),
    ink2: Color(0xFFE2E8F0),
    bg: Color(0xFF121316),
    surface: Color(0xFF1C1E22),
    border: Color(0xFF2E3238),
    textMuted: Color(0xFF9AA4B2),
    star: Color(0xFFFBBF24),
    success: Color(0xFF34D399),
    danger: Color(0xFFF87171),
  );
}

/// `context.colors` → the neutral palette for the ACTIVE brightness (not necessarily
/// the device's — see ThemeModeController for how light/dark/system is chosen).
extension AppColorsContext on BuildContext {
  AppColors get colors => Theme.of(this).brightness == Brightness.dark
      ? AppColors.dark
      : AppColors.light;
}

/// Runtime, admin-configurable brand accent palette — one variant per brightness, read
/// via `context.brand` so the whole app recolours when the backend `/app/config` theme
/// changes, AND automatically swaps to the dark variant when dark mode is active.
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

  /// Dark-mode default when the admin hasn't configured a `themeDark` palette —
  /// mirrors palette-presets.ts's `deriveDark()` on the backend (same lightness math)
  /// so an unconfigured app and a freshly-applied preset look consistent.
  static const greenDark = BrandTokens(
    primary: Color(0xFF17A55A),
    primaryDark: Color(0xFF4ADE80),
    soft: Color(0xFF17251C),
    gStart: Color(0xFF1CB864),
    gEnd: Color(0xFF0E7A43),
    canvas: Color(0xFF121316),
  );

  /// Build LIGHT tokens from the backend `theme` object. Any missing field is derived
  /// from `primary`, so an admin only *has* to set one colour.
  factory BrandTokens.fromConfig(Map<String, dynamic>? theme) {
    final primary = _hex(theme?['primary']?.toString()) ?? green.primary;
    return BrandTokens(
      primary: primary,
      primaryDark:
          _hex(theme?['primaryDark']?.toString()) ?? _shade(primary, -0.14),
      soft: _hex(theme?['soft']?.toString()) ?? _tint(primary),
      gStart:
          _hex(theme?['gradientStart']?.toString()) ?? _shade(primary, 0.12),
      gEnd: _hex(theme?['gradientEnd']?.toString()) ?? _shade(primary, -0.10),
      canvas: _hex(theme?['canvas']?.toString()) ?? green.canvas,
    );
  }

  /// Build DARK tokens from the backend `themeDark` object — same shape as
  /// `fromConfig`, but derives sensible dark-surface fallbacks (not light ones) when a
  /// field is blank, so an admin who only ever filled in light-mode `theme.primary`
  /// still gets a coherent (if auto-derived) dark app instead of a half-themed one.
  factory BrandTokens.darkFromConfig(
      Map<String, dynamic>? themeDark, Color lightPrimary) {
    final primary =
        _hex(themeDark?['primary']?.toString()) ?? _shade(lightPrimary, 0.04);
    return BrandTokens(
      primary: primary,
      // Unlike light mode (primaryDark DARKENS primary for text on a light `soft` card),
      // dark mode's `soft` is itself near-black — primaryDark sits as foreground text/
      // border ON that dark card, so it must be LIGHTENED or it reads muddy/low-contrast.
      primaryDark:
          _hex(themeDark?['primaryDark']?.toString()) ?? _shade(primary, 0.16),
      soft: _hex(themeDark?['soft']?.toString()) ?? _tintDark(primary),
      gStart: _hex(themeDark?['gradientStart']?.toString()) ??
          _shade(primary, 0.06),
      gEnd:
          _hex(themeDark?['gradientEnd']?.toString()) ?? _shade(primary, -0.06),
      canvas: _hex(themeDark?['canvas']?.toString()) ?? greenDark.canvas,
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
  return h
      .withLightness(0.94)
      .withSaturation((h.saturation * 0.55).clamp(0.0, 1.0))
      .toColor();
}

/// Dark-surface equivalent of [_tint] — blends toward a near-black surface instead of
/// near-white, for the "soft accent surface" token (ADD button fill, chips, rails) on
/// a dark background.
Color _tintDark(Color c) {
  final h = HSLColor.fromColor(c);
  return h
      .withLightness(0.18)
      .withSaturation((h.saturation * 0.5).clamp(0.0, 1.0))
      .toColor();
}

/// `context.brand` → the active runtime accent palette, for the CURRENT brightness.
extension BrandContext on BuildContext {
  BrandTokens get brand =>
      Theme.of(this).extension<BrandTokens>() ??
      (Theme.of(this).brightness == Brightness.dark
          ? BrandTokens.greenDark
          : BrandTokens.green);
}

class AppTheme {
  static ThemeData light([BrandTokens tokens = BrandTokens.green]) =>
      _build(tokens, AppColors.light, Brightness.light);

  static ThemeData dark([BrandTokens tokens = BrandTokens.greenDark]) =>
      _build(tokens, AppColors.dark, Brightness.dark);

  static ThemeData _build(
      BrandTokens tokens, AppColors colors, Brightness brightness) {
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: tokens.canvas,
      colorScheme: ColorScheme.fromSeed(
        seedColor: tokens.primary,
        brightness: brightness,
        primary: tokens.primary,
        surface: colors.surface,
      ),
      fontFamily: 'Roboto',
      extensions: [tokens],
    );
    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: tokens.soft,
        foregroundColor: colors.ink,
        elevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          color: colors.ink,
          fontSize: 18,
          fontWeight: FontWeight.w900,
        ),
      ),
      textTheme: base.textTheme.apply(
        bodyColor: colors.ink,
        displayColor: colors.ink,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: tokens.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          // Symmetric with only `vertical` set defaults horizontal to 0 — any button
          // that sizes to its content (not stretched full-width) then has its label
          // touching the pill's edges. Always set both axes explicitly.
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 26),
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
        fillColor: colors.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: tokens.primary, width: 1.5),
        ),
      ),
    );
  }
}

/// Compatibility extension for Flutter SDK versions before 3.27 that do not have `Color.withValues()`.
extension ColorWithValuesCompat on Color {
  Color withValues({
    double? alpha,
    double? red,
    double? green,
    double? blue,
    dynamic colorSpace,
  }) {
    if (alpha != null) {
      return withOpacity(alpha.clamp(0.0, 1.0));
    }
    return this;
  }
}
