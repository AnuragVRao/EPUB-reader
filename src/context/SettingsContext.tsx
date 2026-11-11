import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ReaderSettings, ThemeName } from '../lib/types';
import { DEFAULT_SETTINGS, loadSettings, persistSettings, resolveTheme } from '../lib/settings';

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

  useEffect(() => {
    // Debounced: dragging the TOC edge updates settings on every pointermove.
    const timeout = setTimeout(() => persistSettings(settings), 250);
    return () => clearTimeout(timeout);
  }, [settings]);

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
