import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedBook } from '../hooks/useEpubReader';
import type { BackupFile } from '../lib/backup';
import type { ImportSummary } from '../lib/db';
import type { ReaderSettings, ThemeSetting, FontFamily, FlowMode, SpreadMode } from '../lib/types';
import { MAX_PAGE_MARGIN, PARAGRAPH_SPACINGS } from '../lib/typography';
import { readAloudAvailable } from '../hooks/readAloud';
import { MAX_SPEECH_RATE, MIN_SPEECH_RATE } from '../lib/speech';
import { DICTIONARY_NAME, DICTIONARY_ORIGIN } from '../lib/dictionary';
import { DEFAULT_CUSTOM_COLORS, MIN_CONTRAST, contrastRatio, type CustomColors } from '../lib/customTheme';

interface SettingsPanelProps {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onClearOtherBooks: () => Promise<number>;
  onListSavedBooks: () => Promise<SavedBook[]>;
  onRemoveSavedBook: (bookId: string) => Promise<void>;
  onExportData: () => Promise<BackupFile>;
  onImportData: (raw: unknown) => Promise<ImportSummary>;
  /** The open book's language, for suggesting read-aloud voices. */
  bookLanguage: string;
  /** A fixed-layout book ignores the theme and text settings. */
  fixedLayout?: boolean;
}

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'custom', label: 'Custom' },
];

const FONTS: { value: FontFamily; label: string }[] = [
  { value: 'system', label: 'System UI' },
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans-serif' },
  { value: 'dyslexic', label: 'Dyslexia-friendly' },
];

const SPREADS: { value: SpreadMode; label: string }[] = [
  { value: 'auto', label: 'Two pages when wide' },
  { value: 'single', label: 'Always one page' },
];

const FLOWS: { value: FlowMode; label: string }[] = [
  { value: 'paginated', label: 'Paginated' },
  { value: 'scrolled', label: 'Scrolled' },
];

export default function SettingsPanel({
  settings,
  onChange,
  onClearOtherBooks,
  onListSavedBooks,
  onRemoveSavedBook,
  onExportData,
  onImportData,
  bookLanguage,
  fixedLayout = false,
}: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      {fixedLayout && (
        <p className="settings-panel__note" role="note">
          This book has a fixed layout: its pages keep the publisher's design, so theme colours and text settings
          don't change them.
        </p>
      )}
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
        {settings.theme === 'custom' && (
          <CustomThemeEditor colors={settings.customColors} onChange={(customColors) => onChange({ customColors })} />
        )}
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
        <h3>Paragraph spacing</h3>
        <div className="segmented segmented--wrap">
          {PARAGRAPH_SPACINGS.map((s) => (
            <button
              key={s.label}
              type="button"
              className={`segmented__btn ${settings.paragraphSpacing === s.value ? 'segmented__btn--active' : ''}`}
              onClick={() => onChange({ paragraphSpacing: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Page margins</h3>
        <input
          type="range"
          min={0}
          max={MAX_PAGE_MARGIN}
          step={1}
          value={settings.pageMargin}
          aria-label="Page margins"
          onChange={(e) => onChange({ pageMargin: Number(e.target.value) })}
        />
      </section>

      <section className="settings-section">
        <h3>Text</h3>
        <label className="switch-row">
          <span>Justify text</span>
          <input
            type="checkbox"
            checked={settings.justify}
            onChange={(e) => onChange({ justify: e.target.checked })}
          />
        </label>
        <label className="switch-row">
          <span>Hyphenate words</span>
          <input
            type="checkbox"
            checked={settings.hyphenate}
            onChange={(e) => onChange({ hyphenate: e.target.checked })}
          />
        </label>
      </section>

      {readAloudAvailable() && (
        <section className="settings-section">
          <h3>Read aloud</h3>
          <ReadAloudSettings
            rate={settings.speechRate}
            voice={settings.speechVoice}
            bookLanguage={bookLanguage}
            onChange={onChange}
          />
        </section>
      )}

      <section className="settings-section">
        <h3>Dictionary</h3>
        <label className="switch-row">
          <span>Look up words on {DICTIONARY_NAME}</span>
          <input
            type="checkbox"
            checked={settings.dictionaryEnabled}
            onChange={(e) => onChange({ dictionaryEnabled: e.target.checked })}
          />
        </label>
        <p className="clear-data__hint">
          Off by default. When on, selecting a word offers Define, and only that word is sent to{' '}
          {new URL(DICTIONARY_ORIGIN).host}.
        </p>
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

      {settings.flow === 'paginated' && (
        <section className="settings-section">
          <h3>Page layout</h3>
          <div className="segmented segmented--wrap">
            {SPREADS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`segmented__btn ${settings.spread === s.value ? 'segmented__btn--active' : ''}`}
                onClick={() => onChange({ spread: s.value })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="settings-section">
        <h3>Saved data</h3>
        <SavedData
          onList={onListSavedBooks}
          onRemove={onRemoveSavedBook}
          onClearOthers={onClearOtherBooks}
          onExport={onExportData}
          onImport={onImportData}
        />
      </section>
    </div>
  );
}

// The browser fills its voice list asynchronously (and Chrome only after the
// first call), so listen for it to change.
function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => speechSynthesis.getVoices());
  useEffect(() => {
    const update = () => setVoices(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', update);
    update();
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

function ReadAloudSettings({
  rate,
  voice,
  bookLanguage,
  onChange,
}: {
  rate: number;
  voice: string;
  bookLanguage: string;
  onChange: (patch: Partial<ReaderSettings>) => void;
}) {
  const voices = useVoices();
  const base = bookLanguage.toLowerCase().split(/[-_]/)[0];
  // Voices for the book's language first, then the rest, each alphabetically.
  const sorted = [...voices].sort((a, b) => {
    const am = Number(a.lang.toLowerCase().startsWith(base));
    const bm = Number(b.lang.toLowerCase().startsWith(base));
    return bm - am || a.name.localeCompare(b.name);
  });

  return (
    <div className="read-aloud-settings">
      <label className="read-aloud-settings__row">
        <span>Speed</span>
        <input
          type="range"
          min={MIN_SPEECH_RATE}
          max={MAX_SPEECH_RATE}
          step={0.1}
          value={rate}
          aria-label="Read-aloud speed"
          onChange={(e) => onChange({ speechRate: Number(e.target.value) })}
        />
        <span className="read-aloud-settings__value">{rate.toFixed(1)}×</span>
      </label>
      <label className="read-aloud-settings__row">
        <span>Voice</span>
        <select
          className="text-input"
          value={voices.some((v) => v.voiceURI === voice) ? voice : ''}
          aria-label="Read-aloud voice"
          onChange={(e) => onChange({ speechVoice: e.target.value })}
        >
          <option value="">{bookLanguage ? `Default for this book (${bookLanguage})` : 'Browser default'}</option>
          {sorted.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} ({v.lang}){v.localService ? '' : ' - online'}
            </option>
          ))}
        </select>
      </label>
      {voices.length === 0 && <p className="clear-data__hint">This browser has not offered any voices yet.</p>}
    </div>
  );
}

const COLOR_FIELDS: Array<{ key: keyof CustomColors; label: string }> = [
  { key: 'background', label: 'Page' },
  { key: 'text', label: 'Text' },
  { key: 'accent', label: 'Links and buttons' },
];

function CustomThemeEditor({
  colors,
  onChange,
}: {
  colors: CustomColors;
  onChange: (colors: CustomColors) => void;
}) {
  const ratio = contrastRatio(colors.text, colors.background);
  const readable = ratio >= MIN_CONTRAST;
  const changed = COLOR_FIELDS.some(({ key }) => colors[key] !== DEFAULT_CUSTOM_COLORS[key]);

  return (
    <div className="custom-theme">
      {COLOR_FIELDS.map(({ key, label }) => (
        <label key={key} className="custom-theme__field">
          <input
            type="color"
            aria-label={`${label} colour`}
            value={colors[key]}
            onChange={(e) => onChange({ ...colors, [key]: e.target.value })}
          />
          <span>{label}</span>
          <code aria-hidden="true">{colors[key]}</code>
        </label>
      ))}
      <p className={`custom-theme__contrast ${readable ? '' : 'custom-theme__contrast--low'}`} aria-live="polite">
        Text contrast {ratio.toFixed(1)}:1
        {readable ? ' - easy to read.' : ` - below the ${MIN_CONTRAST}:1 recommended for body text.`}
      </p>
      {changed && (
        <button type="button" className="btn custom-theme__reset" onClick={() => onChange(DEFAULT_CUSTOM_COLORS)}>
          Reset colours
        </button>
      )}
    </div>
  );
}

function describeSavedBook(book: SavedBook): string {
  const parts: string[] = [];
  if (book.percentage !== null) parts.push(`${Math.round(book.percentage * 100)}% read`);
  if (book.bookmarkCount > 0) parts.push(`${book.bookmarkCount} ${book.bookmarkCount === 1 ? 'bookmark' : 'bookmarks'}`);
  if (book.updatedAt !== null) parts.push(`last read ${new Date(book.updatedAt).toLocaleDateString()}`);
  return parts.join(' · ') || 'Page index only';
}

// Lists the books that have bookmarks or a reading position stored in this
// browser, with a way to remove them one at a time or all at once.
function SavedData({
  onList,
  onRemove,
  onClearOthers,
  onExport,
  onImport,
}: {
  onList: () => Promise<SavedBook[]>;
  onRemove: (bookId: string) => Promise<void>;
  onClearOthers: () => Promise<number>;
  onExport: () => Promise<BackupFile>;
  onImport: (raw: unknown) => Promise<ImportSummary>;
}) {
  // null while loading; 'error' when IndexedDB could not be read.
  const [books, setBooks] = useState<SavedBook[] | 'error' | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const list = await onList();
      if (mountedRef.current) setBooks(list);
    } catch {
      if (mountedRef.current) setBooks('error');
    }
  }, [onList]);

  // The first load; `refresh` reloads after a change. State is only set once
  // the list arrives.
  useEffect(() => {
    mountedRef.current = true;
    onList().then(
      (list) => {
        if (mountedRef.current) setBooks(list);
      },
      () => {
        if (mountedRef.current) setBooks('error');
      },
    );
    return () => {
      mountedRef.current = false;
    };
  }, [onList]);

  const remove = async (bookId: string) => {
    try {
      await onRemove(bookId);
    } finally {
      await refresh();
    }
  };

  const clearOthers = async () => {
    try {
      return await onClearOthers();
    } finally {
      await refresh();
    }
  };

  return (
    <>
      {books === 'error' && <p className="clear-data__hint">Could not read saved data.</p>}
      {Array.isArray(books) && books.length === 0 && <p className="clear-data__hint">Nothing is saved yet.</p>}
      {Array.isArray(books) && books.length > 0 && (
        <ul className="saved-books">
          {books.map((book) => (
            <li key={book.bookId} className="saved-book">
              <div className="saved-book__text">
                <span className="saved-book__title">
                  {book.title || 'Unknown book'}
                  {book.current && <span className="saved-book__badge">Open</span>}
                </span>
                <span className="saved-book__meta">{describeSavedBook(book)}</span>
              </div>
              {!book.current && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove saved data for ${book.title || 'unknown book'}`}
                  title="Remove this book's bookmarks and reading position"
                  onClick={() => void remove(book.bookId)}
                >
                  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ClearOtherBooksButton onClear={clearOthers} />
      <Transfer onExport={onExport} onImport={onImport} onImported={refresh} />
    </>
  );
}


function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// Export to / import from a JSON file: the way to move bookmarks and reading
// positions to another browser or device without any server.
function Transfer({
  onExport,
  onImport,
  onImported,
}: {
  onExport: () => Promise<BackupFile>;
  onImport: (raw: unknown) => Promise<ImportSummary>;
  onImported: () => Promise<void>;
}) {
  const [message, setMessage] = useState('Move bookmarks, highlights and reading positions to another browser as a file.');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const file = await onExport();
      if (file.books.length === 0) {
        setMessage('There is nothing to export yet.');
        return;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `epub-reader-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      // Give the download a moment to start before the URL goes away.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage(`Exported data for ${plural(file.books.length, 'book')}.`);
    } catch {
      setMessage('Could not export saved data.');
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setMessage('That file could not be read as an export.');
      return;
    }
    try {
      const summary = await onImport(raw);
      setMessage(
        summary.books === 0
          ? 'Everything in that file was already here.'
          : `Imported ${plural(summary.bookmarks, 'bookmark')}, ${plural(summary.highlights, 'highlight')} and ${plural(summary.positions, 'reading position')} for ${plural(summary.books, 'book')}.`,
      );
      await onImported();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not import that file.');
    }
  };

  return (
    <div className="transfer">
      <div className="transfer__buttons">
        <button type="button" className="btn" onClick={() => void handleExport()}>
          Export
        </button>
        <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
          Import
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Import saved data from a file"
          onChange={(e) => {
            void handleImport(e.target.files?.[0]);
            // Allow choosing the same file again.
            e.target.value = '';
          }}
        />
      </div>
      <p className="clear-data__hint" aria-live="polite">
        {message}
      </p>
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
