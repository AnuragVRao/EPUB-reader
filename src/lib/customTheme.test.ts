import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUSTOM_COLORS,
  MIN_CONTRAST,
  contrastRatio,
  customPalette,
  mix,
  sanitizeCustomColors,
} from './customTheme';

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1);
    // The usual "just passes AA" grey on white.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
  });
});

describe('mix', () => {
  it('blends between two colours', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('sanitizeCustomColors', () => {
  it('keeps valid colours, lower-cased', () => {
    expect(sanitizeCustomColors({ background: '#FFFFFF', text: '#000000', accent: '#AA0000' })).toEqual({
      background: '#ffffff',
      text: '#000000',
      accent: '#aa0000',
    });
  });

  it('replaces each invalid colour with its default independently', () => {
    expect(sanitizeCustomColors({ background: 'red', text: '#123', accent: '#00ff00' })).toEqual({
      ...DEFAULT_CUSTOM_COLORS,
      accent: '#00ff00',
    });
    expect(sanitizeCustomColors(null)).toEqual(DEFAULT_CUSTOM_COLORS);
  });
});

describe('customPalette', () => {
  const textVars = ['text-muted', 'accent', 'danger'];

  const cases: Array<[string, { background: string; text: string; accent: string }]> = [
    ['the default', DEFAULT_CUSTOM_COLORS],
    ['a dark theme', { background: '#0f1a24', text: '#d8e1e8', accent: '#3a6ea5' }],
    // A pale accent on a pale page has to be darkened to be readable.
    ['a light theme with a weak accent', { background: '#ffffff', text: '#111111', accent: '#ffd0e0' }],
    // A dark accent on a dark page has to be lightened.
    ['a dark theme with a weak accent', { background: '#101010', text: '#eeeeee', accent: '#202060' }],
  ];

  for (const [name, colors] of cases) {
    it(`keeps every derived text colour at AA contrast for ${name}`, () => {
      const p = customPalette(colors);
      for (const key of textVars) {
        for (const surface of [p.vars.surface, p.vars.bg, p.vars['surface-alt']]) {
          expect(contrastRatio(p.vars[key], surface), `${key} on ${surface}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }
      }
      expect(contrastRatio(p.link, p.page)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      // Button text on an accent button.
      expect(contrastRatio(p.vars['accent-contrast'], p.vars.accent)).toBeGreaterThan(3);
    });
  }

  it('uses the picked page and text colours exactly', () => {
    const p = customPalette({ background: '#203040', text: '#f0e0d0', accent: '#88ccff' });
    expect(p.page).toBe('#203040');
    expect(p.vars['page-bg']).toBe('#203040');
    expect(p.text).toBe('#f0e0d0');
    expect(p.dark).toBe(true);
    expect(p.colorScheme).toBe('dark');
  });

  it('leaves a readable accent alone', () => {
    const p = customPalette({ background: '#ffffff', text: '#000000', accent: '#1a4f8b' });
    expect(p.vars.accent).toBe('#1a4f8b');
    expect(p.link).toBe('#1a4f8b');
  });
});
