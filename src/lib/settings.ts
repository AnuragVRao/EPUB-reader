import type { ReaderSettings } from './types';

const SETTINGS_KEY = 'epub-reader-settings';

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'light',
  fontSize: 100,
  fontFamily: 'system',
  flow: 'paginated',
  lineSpacing: 1.4,
  justify: false,
  tocOpen: true,
  tocWidth: 300,
};

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function persistSettings(settings: ReaderSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
