import type { ReaderSettings, ThemeName, FontFamily, FlowMode } from '../lib/types';

interface SettingsPanelProps {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
}

const THEMES: { value: ThemeName; label: string }[] = [
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

export default function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
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
    </div>
  );
}
