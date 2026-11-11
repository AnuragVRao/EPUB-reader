import { useEffect, useRef, useState } from 'react';
import type { ReaderSettings, ThemeSetting, FontFamily, FlowMode } from '../lib/types';

interface SettingsPanelProps {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onClearOtherBooks: () => Promise<number>;
}

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'sepia', label: 'Sepia' },
];

const FONTS: { value: FontFamily; label: string }[] = [
  { value: 'system', label: 'System UI' },
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans-serif' },
  { value: 'dyslexic', label: 'Dyslexia-friendly' },
];

const FLOWS: { value: FlowMode; label: string }[] = [
  { value: 'paginated', label: 'Paginated' },
  { value: 'scrolled', label: 'Scrolled' },
];

export default function SettingsPanel({ settings, onChange, onClearOtherBooks }: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      <section className="settings-section">
        <h3>Theme</h3>
        <div className="segmented">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`segmented__btn ${settings.theme === t.value ? 'segmented__btn--active' : ''}`}
              onClick={() => onChange({ theme: t.value })}
              title={t.value === 'auto' ? 'Follow the system light or dark setting' : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Font size</h3>
        <div className="stepper">
          <button
            type="button"
            className="icon-btn"
            onClick={() => onChange({ fontSize: Math.max(70, settings.fontSize - 10) })}
            aria-label="Decrease font size"
          >
            A-
          </button>
          <span className="stepper__value">{settings.fontSize}%</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onChange({ fontSize: Math.min(200, settings.fontSize + 10) })}
            aria-label="Increase font size"
          >
            A+
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Font family</h3>
        <div className="segmented segmented--wrap">
          {FONTS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`segmented__btn ${settings.fontFamily === f.value ? 'segmented__btn--active' : ''}`}
              onClick={() => onChange({ fontFamily: f.value })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Line spacing</h3>
        <input
          type="range"
          min={1}
          max={2.2}
          step={0.1}
          value={settings.lineSpacing}
          onChange={(e) => onChange({ lineSpacing: Number(e.target.value) })}
        />
      </section>

      <section className="settings-section">
        <h3>Text alignment</h3>
        <label className="switch-row">
          <span>Justify text</span>
          <input
            type="checkbox"
            checked={settings.justify}
            onChange={(e) => onChange({ justify: e.target.checked })}
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>Reading mode</h3>
        <div className="segmented">
          {FLOWS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`segmented__btn ${settings.flow === f.value ? 'segmented__btn--active' : ''}`}
              onClick={() => onChange({ flow: f.value })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Saved data</h3>
        <ClearOtherBooksButton onClear={onClearOtherBooks} />
      </section>
    </div>
  );
}


type ClearState = 'idle' | 'confirm' | 'clearing' | { cleared: number } | 'error';

// Two-step button: the first click arms it, the second actually deletes.
function ClearOtherBooksButton({ onClear }: { onClear: () => Promise<number> }) {
  const [state, setState] = useState<ClearState>('idle');
  const resetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetRef.current), []);

  const handleClick = async () => {
    clearTimeout(resetRef.current);
    if (state !== 'confirm') {
      setState('confirm');
      // Disarm if the user doesn't follow through.
      resetRef.current = setTimeout(() => setState('idle'), 4000);
      return;
    }
    setState('clearing');
    try {
      setState({ cleared: await onClear() });
    } catch {
      setState('error');
    }
  };

  let message = 'Removes bookmarks and reading positions for every book except this one.';
  if (typeof state === 'object') {
    message =
      state.cleared === 0
        ? 'There was no data from other books.'
        : `Cleared data for ${state.cleared} ${state.cleared === 1 ? 'book' : 'books'}.`;
  } else if (state === 'error') {
    message = 'Could not clear saved data.';
  }

  return (
    <div className="clear-data">
      <button
        type="button"
        className={`btn ${state === 'confirm' ? 'btn--danger' : ''}`}
        onClick={handleClick}
        disabled={state === 'clearing'}
      >
        {state === 'confirm' ? 'Click again to confirm' : 'Clear data for other books'}
      </button>
      <p className="clear-data__hint" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
