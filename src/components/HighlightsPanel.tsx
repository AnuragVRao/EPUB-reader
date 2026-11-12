import { useEffect, useRef, useState } from 'react';
import type { Highlight } from '../lib/types';

interface HighlightsPanelProps {
  highlights: Highlight[];
  /** A highlight to scroll to and pick out, e.g. the one just clicked on the page. */
  focusId?: string | null;
  onSelect: (cfiRange: string) => void;
  onRemove: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
}

// Lists the book's highlights below the bookmarks in the same side panel.
export default function HighlightsPanel({ highlights, focusId, onSelect, onRemove, onUpdateNote }: HighlightsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const focusedRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (focusId) focusedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [focusId]);

  return (
    <section className="highlights">
      <h3 className="highlights__heading">Highlights</h3>
      {highlights.length === 0 ? (
        <p className="side-panel__empty">No highlights yet. Select text in the book to highlight it or attach a note.</p>
      ) : (
        <ul className="bookmark-list">
          {highlights.map((highlight) =>
            highlight.id === editingId ? (
              <li key={highlight.id}>
                <NoteEditor
                  highlight={highlight}
                  onSave={(note) => {
                    onUpdateNote(highlight.id, note);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={highlight.id}
                ref={highlight.id === focusId ? focusedRef : undefined}
                className={`bookmark-item ${highlight.id === focusId ? 'highlight-item--focused' : ''}`}
              >
                <button type="button" className="bookmark-item__main" onClick={() => onSelect(highlight.cfiRange)}>
                  <span className="highlight-item__text">{highlight.text}</span>
                  {highlight.note && <span className="bookmark-item__note">{highlight.note}</span>}
                  <span className="bookmark-item__date">{new Date(highlight.createdAt).toLocaleString()}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={highlight.note ? 'Edit note' : 'Add a note'}
                  title={highlight.note ? 'Edit note' : 'Add a note'}
                  onClick={() => setEditingId(highlight.id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
                    <path
                      d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove highlight"
                  title="Remove highlight"
                  onClick={() => onRemove(highlight.id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function NoteEditor({
  highlight,
  onSave,
  onCancel,
}: {
  highlight: Highlight;
  onSave: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState(highlight.note ?? '');

  return (
    <form
      className="bookmark-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(note);
      }}
      onKeyUp={(e) => {
        // Escape cancels the edit; stop it there so it doesn't also close the panel.
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <span className="highlight-item__text">{highlight.text}</span>
      <label className="bookmark-editor__field">
        <span>Note</span>
        <textarea
          className="text-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Leave empty to remove the note"
          autoFocus
        />
      </label>
      <div className="bookmark-editor__actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Save
        </button>
      </div>
    </form>
  );
}
