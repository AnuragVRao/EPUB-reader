import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ReaderSettings } from '../lib/types';
import { DEFAULT_SETTINGS, loadSettings, persistSettings } from '../lib/settings';

interface SettingsContextValue {
  settings: ReaderSettings;
  updateSettings: (patch: Partial<ReaderSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings() ?? DEFAULT_SETTINGS);

  useEffect(() => {
    persistSettings(settings);
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      updateSettings: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
