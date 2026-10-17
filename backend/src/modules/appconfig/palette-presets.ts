/**
 * Predefined brand-colour presets for the customer app — so an admin picks a
 * ready-made, good-looking light+dark pair ("Sunset Orange", "Ocean Blue", …) instead
 * of hand-typing 6 hex codes per mode. Each preset is derived from ONE base hue via
 * HSL math, so every preset is internally consistent (same relationships flutter_app's
 * BrandTokens.gradient/soft always expected from a hand-tuned palette).
 */

interface ThemeTokens {
  primary: string;
  primaryDark: string;
  soft: string;
  gradientStart: string;
  gradientEnd: string;
  canvas: string;
}

export interface PalettePreset {
  id: string;
  name: string;
  light: ThemeTokens;
  dark: ThemeTokens;
}

// ── tiny HSL colour math (no dependency needed for 6-field derivation) ──────────────
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0; const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/** Shift lightness by `delta` (-1..1), clamped to [0,1]. */
function shiftLightness(hex: string, delta: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return rgbToHex(...hslToRgb(h, s, Math.max(0, Math.min(1, l + delta))));
}
/** Blend `hex` toward `target` by `ratio` (0 = hex, 1 = target). */
function mix(hex: string, target: string, ratio: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(target);
  return rgbToHex(r1 + (r2 - r1) * ratio, g1 + (g2 - g1) * ratio, b1 + (b2 - b1) * ratio);
}

function deriveLight(primary: string): ThemeTokens {
  return {
    primary,
    primaryDark: shiftLightness(primary, -0.12),
    soft: mix(primary, '#FFFFFF', 0.9),
    gradientStart: shiftLightness(primary, 0.08),
    gradientEnd: shiftLightness(primary, -0.08),
    canvas: mix(primary, '#FFFFFF', 0.97),
  };
}
function deriveDark(primary: string): ThemeTokens {
  // Slightly lifted so the accent stays legible on a near-black surface (plain Tailwind
  // 500-ish shades can read muddy at low luminance without this).
  const liftedPrimary = shiftLightness(primary, 0.04);
  return {
    primary: liftedPrimary,
    // Unlike light mode (where primaryDark DARKENS primary for readable text on a light
    // `soft` card), dark mode's `soft` is itself near-black — primaryDark is used as
    // foreground text/border ON that dark card, so it must be LIGHTENED, not darkened,
    // or it reads as muddy, low-contrast brown/olive instead of a crisp accent.
    primaryDark: shiftLightness(liftedPrimary, 0.16),
    soft: mix(liftedPrimary, '#15171C', 0.82),
    gradientStart: shiftLightness(liftedPrimary, 0.06),
    gradientEnd: shiftLightness(liftedPrimary, -0.06),
    canvas: '#121316',
  };
}

/** 32 base hues — Tailwind/Material-adjacent shades chosen for good brand-accent
 * contrast on both a white and a near-black surface. */
const BASE_HUES: { id: string; name: string; hex: string }[] = [
  { id: 'sunset-orange', name: 'Sunset Orange', hex: '#F97316' },
  { id: 'cherry-red', name: 'Cherry Red', hex: '#EF4444' },
  { id: 'crimson-rose', name: 'Crimson Rose', hex: '#F43F5E' },
  { id: 'blossom-pink', name: 'Blossom Pink', hex: '#EC4899' },
  { id: 'orchid-fuchsia', name: 'Orchid Fuchsia', hex: '#D946EF' },
  { id: 'royal-purple', name: 'Royal Purple', hex: '#A855F7' },
  { id: 'violet-dusk', name: 'Violet Dusk', hex: '#8B5CF6' },
  { id: 'indigo-night', name: 'Indigo Night', hex: '#6366F1' },
  { id: 'classic-blue', name: 'Classic Blue', hex: '#3B82F6' },
  { id: 'sky-breeze', name: 'Sky Breeze', hex: '#0EA5E9' },
  { id: 'cyan-wave', name: 'Cyan Wave', hex: '#06B6D4' },
  { id: 'teal-lagoon', name: 'Teal Lagoon', hex: '#14B8A6' },
  { id: 'emerald-fresh', name: 'Emerald Fresh', hex: '#10B981' },
  { id: 'leaf-green', name: 'Leaf Green', hex: '#22C55E' },
  { id: 'lime-zest', name: 'Lime Zest', hex: '#84CC16' },
  { id: 'golden-yellow', name: 'Golden Yellow', hex: '#EAB308' },
  { id: 'warm-amber', name: 'Warm Amber', hex: '#F59E0B' },
  { id: 'terracotta', name: 'Terracotta', hex: '#C2703D' },
  { id: 'slate-storm', name: 'Slate Storm', hex: '#64748B' },
  { id: 'neutral-gray', name: 'Neutral Gray', hex: '#6B7280' },
  { id: 'urban-zinc', name: 'Urban Zinc', hex: '#71717A' },
  { id: 'warm-stone', name: 'Warm Stone', hex: '#78716C' },
  { id: 'deep-maroon', name: 'Deep Maroon', hex: '#9F1239' },
  { id: 'midnight-navy', name: 'Midnight Navy', hex: '#1E3A8A' },
  { id: 'forest-canopy', name: 'Forest Canopy', hex: '#166534' },
  { id: 'olive-grove', name: 'Olive Grove', hex: '#65A30D' },
  { id: 'mustard-field', name: 'Mustard Field', hex: '#CA8A04' },
  { id: 'coral-reef', name: 'Coral Reef', hex: '#FB7185' },
  { id: 'lavender-mist', name: 'Lavender Mist', hex: '#C084FC' },
  { id: 'spearmint', name: 'Spearmint', hex: '#34D399' },
  { id: 'peach-cream', name: 'Peach Cream', hex: '#FDBA74' },
  { id: 'charcoal-blue', name: 'Charcoal Blue', hex: '#334155' },
];

export const PALETTE_PRESETS: PalettePreset[] = BASE_HUES.map((b) => ({
  id: b.id,
  name: b.name,
  light: deriveLight(b.hex),
  dark: deriveDark(b.hex),
}));
