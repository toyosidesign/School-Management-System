/**
 * Builds a full 50-900 tint scale from a single brand colour.
 *
 * The school picks one hex; every shade the UI uses is derived from it, so a
 * custom colour looks deliberate rather than one flat swatch pasted everywhere.
 * Values are emitted as "R G B" channel triplets, which is what Tailwind's
 * <alpha-value> syntax needs for modifiers like bg-brand-600/10 to keep working.
 */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Target lightness per stop, matching the feel of Tailwind's own scales.
const STOPS: Record<number, number> = {
  50: 0.97, 100: 0.94, 200: 0.86, 300: 0.77, 400: 0.66,
  500: 0.58, 600: 0.50, 700: 0.42, 800: 0.34, 900: 0.26,
};

/** Pale tints lose saturation more slowly than deep ones; this keeps them from going grey. */
export function scaleFrom(hex: string): Record<number, string> {
  const [h, s] = rgbToHsl(hexToRgb(hex));
  const out: Record<number, string> = {};
  for (const [stop, l] of Object.entries(STOPS)) {
    const n = Number(stop);
    const sat = n <= 200 ? clamp(s * (n <= 100 ? 0.85 : 0.9), 0.08, 1) : clamp(s * (n >= 800 ? 0.98 : 1), 0, 1);
    out[n] = hslToRgb(h, sat, l).join(' ');
  }
  return out;
}

export function accentScaleFrom(hex: string): Record<number, string> {
  const full = scaleFrom(hex);
  return { 400: full[400], 500: full[500], 600: full[600], 700: full[700] };
}

/** Applies a school's colours to the document root. */
export function applyBrand(primary?: string, accent?: string) {
  const root = document.documentElement;
  if (isHex(primary)) {
    for (const [stop, triplet] of Object.entries(scaleFrom(primary!))) {
      root.style.setProperty(`--brand-${stop}`, triplet);
    }
  }
  if (isHex(accent)) {
    for (const [stop, triplet] of Object.entries(accentScaleFrom(accent!))) {
      root.style.setProperty(`--accent-${stop}`, triplet);
    }
  }
}

export const isHex = (v?: string): v is string => !!v && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());

/** Readable text colour for a given background, used for logo monograms and chips. */
export function contrastOn(hex: string): '#ffffff' | '#0f172a' {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#0f172a' : '#ffffff';
}

/** Curated starting points offered in the branding editor. */
export const PRESET_COLOURS = [
  { name: 'Oxford blue', primary: '#1e40af', accent: '#7c3aed' },
  { name: 'Classic blue', primary: '#2563eb', accent: '#7c3aed' },
  { name: 'Teal', primary: '#0d9488', accent: '#0891b2' },
  { name: 'Forest', primary: '#15803d', accent: '#65a30d' },
  { name: 'Burgundy', primary: '#9f1239', accent: '#be123c' },
  { name: 'Plum', primary: '#7e22ce', accent: '#c026d3' },
  { name: 'Amber', primary: '#b45309', accent: '#d97706' },
  { name: 'Slate', primary: '#334155', accent: '#0f766e' },
];
