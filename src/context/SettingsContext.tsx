import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ReaderSettings, ThemeName } from '../lib/types';
import { DEFAULT_SETTINGS, loadSettings, persistSettings, resolveTheme } from '../lib/settings';
import { customPalette } from '../lib/customTheme';

interface SettingsContextValue {
  settings: ReaderSettings;
  /** The theme in effect: `settings.theme` with 'auto' resolved against the OS preference. */
  theme: ThemeName;
  updateSettings: (patch: Partial<ReaderSettings>) => void;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings() ?? DEFAULT_SETTINGS);

  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia(DARK_QUERY).matches);
  const theme = resolveTheme(settings.theme, prefersDark);

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // The custom theme's app-shell colours are set inline on <html>, where they
  // override the stylesheet's per-theme custom properties. Other themes
  // remove them again.
  const { background, text, accent } = settings.customColors;
  useEffect(() => {
    if (theme !== 'custom') return;
    const root = document.documentElement;
    const palette = customPalette({ background, text, accent });
    for (const [name, value] of Object.entries(palette.vars)) root.style.setProperty(`--${name}`, value);
    root.style.colorScheme = palette.colorScheme;
    return () => {
      for (const name of Object.keys(palette.vars)) root.style.removeProperty(`--${name}`);
      root.style.removeProperty('color-scheme');
    };
  }, [theme, background, text, accent]);

  // Debounced: dragging the TOC edge updates settings on every pointermove.
  // A save still pending when the page goes away (reload, tab closed) is
  // written straight away, or a change made just before it would be lost.
  const pendingSaveRef = useRef<ReaderSettings | null>(null);
  useEffect(() => {
    pendingSaveRef.current = settings;
    const timeout = setTimeout(() => {
      pendingSaveRef.current = null;
      persistSettings(settings);
    }, 250);
    return () => clearTimeout(timeout);
  }, [settings]);

  useEffect(() => {
    const flush = () => {
      if (!pendingSaveRef.current) return;
      persistSettings(pendingSaveRef.current);
      pendingSaveRef.current = null;
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      theme,
      updateSettings: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
    }),
    [settings, theme],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
