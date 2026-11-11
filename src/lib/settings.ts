import type { FlowMode, FontFamily, ReaderSettings, SpreadMode, ThemeName, ThemeSetting } from './types';
import { MAX_PAGE_MARGIN, PARAGRAPH_SPACINGS } from './typography';

const SETTINGS_KEY = 'epub-reader-settings';

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'auto',
  fontSize: 100,
  fontFamily: 'system',
  flow: 'paginated',
  lineSpacing: 1.4,
  justify: false,
  paragraphSpacing: null,
  hyphenate: false,
  pageMargin: 0,
  spread: 'auto',
  tocOpen: true,
  tocWidth: 300,
};

const THEMES: readonly ThemeSetting[] = ['auto', 'light', 'dark', 'sepia'];
const FONTS: readonly FontFamily[] = ['system', 'serif', 'sans', 'dyslexic'];
const FLOWS: readonly FlowMode[] = ['paginated', 'scrolled'];
const SPREADS: readonly SpreadMode[] = ['auto', 'single'];
const SPACINGS = PARAGRAPH_SPACINGS.map((s) => s.value);

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

// Stored settings can be stale (written by an older version) or hand-edited,
// so every field is checked: a bad value falls back to its default rather
// than reaching the reader as e.g. a `NaN%` font size or an unknown theme.
function sanitize(raw: unknown): ReaderSettings {
  const d = DEFAULT_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return d;
  const s = raw as Record<string, unknown>;
  return {
    theme: oneOf(s.theme, THEMES, d.theme),
    fontSize: numberIn(s.fontSize, 70, 200, d.fontSize),
    fontFamily: oneOf(s.fontFamily, FONTS, d.fontFamily),
    flow: oneOf(s.flow, FLOWS, d.flow),
    lineSpacing: numberIn(s.lineSpacing, 1, 2.2, d.lineSpacing),
    justify: bool(s.justify, d.justify),
    paragraphSpacing: oneOf(s.paragraphSpacing, SPACINGS, d.paragraphSpacing),
    hyphenate: bool(s.hyphenate, d.hyphenate),
    pageMargin: numberIn(s.pageMargin, 0, MAX_PAGE_MARGIN, d.pageMargin),
    spread: oneOf(s.spread, SPREADS, d.spread),
    tocOpen: bool(s.tocOpen, d.tocOpen),
    tocWidth: numberIn(s.tocWidth, 200, 520, d.tocWidth),
  };
}

/** The theme to actually render: 'auto' follows the OS preference. */
export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): ThemeName {
  if (setting !== 'auto') return setting;
  return prefersDark ? 'dark' : 'light';
}

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitize(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function persistSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode, quota, disabled) - settings still
    // apply for this session, they just won't survive a reload.
  }
}
