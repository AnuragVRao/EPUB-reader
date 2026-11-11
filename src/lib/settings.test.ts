import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, persistSettings, resolveTheme } from './settings';

const SETTINGS_KEY = 'epub-reader-settings';

function stubStorage(overrides: Partial<Storage> = {}) {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    ...overrides,
  };
  vi.stubGlobal('localStorage', storage);
  return items;
}

let items: Map<string, string>;

beforeEach(() => {
  items = stubStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadSettings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('fills in settings missing from an older stored value', () => {
    items.set(SETTINGS_KEY, JSON.stringify({ theme: 'dark', fontSize: 130 }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', fontSize: 130 });
  });

  it('follows the OS theme by default and keeps a stored "auto"', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('auto');
    items.set(SETTINGS_KEY, JSON.stringify({ theme: 'auto' }));
    expect(loadSettings().theme).toBe('auto');
  });

  it('falls back to the defaults on corrupt JSON', () => {
    items.set(SETTINGS_KEY, '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('replaces invalid values with defaults and clamps out-of-range numbers', () => {
    items.set(
      SETTINGS_KEY,
      JSON.stringify({ theme: 'neon', fontSize: 'big', lineSpacing: 9, tocWidth: 5, justify: 'yes', flow: 'scrolled' }),
    );
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, lineSpacing: 2.2, tocWidth: 200, flow: 'scrolled' });
  });

  it('validates the typography and layout settings', () => {
    items.set(
      SETTINGS_KEY,
      JSON.stringify({ paragraphSpacing: 0.5, hyphenate: true, pageMargin: 99, spread: 'single' }),
    );
    expect(loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      paragraphSpacing: 0.5,
      hyphenate: true,
      pageMargin: 25,
      spread: 'single',
    });

    // 0.7 is not one of the offered spacings; "double" is not a spread mode.
    items.set(SETTINGS_KEY, JSON.stringify({ paragraphSpacing: 0.7, hyphenate: 1, pageMargin: -4, spread: 'double' }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, pageMargin: 0 });
  });

  it('falls back to the defaults when the stored value is not an object', () => {
    items.set(SETTINGS_KEY, 'null');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to the defaults when storage throws', () => {
    stubStorage({
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('resolveTheme', () => {
  it('follows the OS preference when set to auto', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
  });

  it('keeps an explicit choice whatever the OS prefers', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('sepia', true)).toBe('sepia');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('persistSettings', () => {
  it('round-trips through loadSettings', () => {
    const settings = { ...DEFAULT_SETTINGS, theme: 'sepia' as const, flow: 'scrolled' as const, tocWidth: 240 };
    persistSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it('does not throw when storage is full or unavailable', () => {
    stubStorage({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => persistSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});
