import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedBook } from '../hooks/useEpubReader';
import type { ReaderSettings, ThemeSetting, FontFamily, FlowMode, SpreadMode } from '../lib/types';
import { MAX_PAGE_MARGIN, PARAGRAPH_SPACINGS } from '../lib/typography';

interface SettingsPanelProps {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onClearOtherBooks: () => Promise<number>;
  onListSavedBooks: () => Promise<SavedBook[]>;
  onRemoveSavedBook: (bookId: string) => Promise<void>;
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
}: SettingsPanelProps) {
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
        <SavedData onList={onListSavedBooks} onRemove={onRemoveSavedBook} onClearOthers={onClearOtherBooks} />
      </section>
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
}: {
  onList: () => Promise<SavedBook[]>;
  onRemove: (bookId: string) => Promise<void>;
  onClearOthers: () => Promise<number>;
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

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

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
    </>
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
