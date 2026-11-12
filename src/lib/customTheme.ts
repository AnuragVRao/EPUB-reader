/** The three colours a reader picks for the custom theme, as `#rrggbb`. */
export interface CustomColors {
  background: string;
  text: string;
  /** Links in the book, and buttons and highlights in the app. */
  accent: string;
}

export const DEFAULT_CUSTOM_COLORS: CustomColors = {
  background: '#fbf7ef',
  text: '#262321',
  accent: '#2f6690',
};

/** WCAG AA for body text. */
export const MIN_CONTRAST = 4.5;

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/** Stored colours can be stale or hand-edited; each one falls back separately. */
export function sanitizeCustomColors(raw: unknown): CustomColors {
  const d = DEFAULT_CUSTOM_COLORS;
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const pick = (value: unknown, fallback: string) => (isHexColor(value) ? value.toLowerCase() : fallback);
  return { background: pick(r.background, d.background), text: pick(r.text, d.text), accent: pick(r.accent, d.accent) };
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mixes `a` towards `b` by `amount` (0 = a, 1 = b). */
export function mix(a: string, b: string, amount: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * amount) as Rgb);
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Moves `color` towards `towards` in small steps until it reaches `target`
 * contrast against every colour in `against`, or `towards` itself is reached.
 */
function ensureContrast(color: string, against: string[], towards: string, target = MIN_CONTRAST): string {
  let current = color;
  for (let step = 0; step <= 20; step++) {
    if (against.every((bg) => contrastRatio(current, bg) >= target)) return current;
    current = mix(color, towards, step / 20);
  }
  return current;
}

/** Everything the custom theme needs, for the app shell and the book. */
export interface CustomPalette {
  dark: boolean;
  /** The book page: exactly the picked background. */
  page: string;
  text: string;
  /** Links in the book: the picked accent, made readable on the page if it wasn't. */
  link: string;
  /** App shell CSS custom properties, without the leading `--`. */
  vars: Record<string, string>;
  colorScheme: 'light' | 'dark';
  scrollbarThumb: string;
}

/**
 * Derives the app shell's palette from the three picked colours. Surfaces
 * are the background nudged towards the text colour; muted text, the accent
 * and error text are pushed towards full contrast until they pass WCAG AA on
 * every surface. The body text itself is used as picked - if it is hard to
 * read, the settings panel says so rather than silently overriding it.
 */
export function customPalette(colors: CustomColors): CustomPalette {
  const { background, text } = colors;
  const dark = luminance(background) < luminance(text);
  const extreme = dark ? '#ffffff' : '#000000';

  const surface = background;
  const bg = mix(background, text, 0.04);
  const surfaceAlt = mix(background, text, 0.08);
  const surfaces = [surface, bg, surfaceAlt];

  const accent = ensureContrast(colors.accent, surfaces, extreme);
  const accentContrast = contrastRatio(background, accent) >= contrastRatio(text, accent) ? background : text;
  const muted = ensureContrast(mix(text, background, 0.4), surfaces, text);
  const danger = ensureContrast(dark ? '#f2958c' : '#b3261e', surfaces, extreme);

  return {
    dark,
    page: background,
    text,
    link: ensureContrast(colors.accent, [background], extreme),
    colorScheme: dark ? 'dark' : 'light',
    scrollbarThumb: rgba(text, dark ? 0.22 : 0.28),
    vars: {
      bg,
      surface,
      'surface-alt': surfaceAlt,
      text,
      'text-muted': muted,
      border: mix(background, text, 0.18),
      accent,
      'accent-contrast': accentContrast,
      shadow: dark ? 'rgba(0, 0, 0, 0.5)' : rgba(text, 0.12),
      'overlay-bg': rgba(background, 0.85),
      'page-bg': background,
      danger,
      highlight: dark ? '#ffd54a' : '#ffd400',
      'highlight-opacity': dark ? '0.3' : '0.4',
      'highlight-blend': dark ? 'normal' : 'multiply',
    },
  };
}
