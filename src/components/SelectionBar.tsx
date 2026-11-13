import { useState } from 'react';
import type { TextSelection } from '../lib/types';
import { lookupTerm } from '../lib/dictionary';

interface SelectionBarProps {
  /** The text selected in the book right now, or null. */
  selection: TextSelection | null;
  onHighlight: (selection: TextSelection, note?: string) => void;
  /** Looks up a selected word or short phrase. */
  onDefine: (term: string) => void;
  onDismiss: () => void;
}

// Offers to highlight the text selected in the book. It sits at the bottom of
// the page rather than next to the selection, clear of the browser's own
// selection handles and menus on touch screens.
export default function SelectionBar({ selection, onHighlight, onDefine, onDismiss }: SelectionBarProps) {
  // Set while a note is being written. Held separately because moving focus
  // to the note field can drop the selection inside the book.
  const [draft, setDraft] = useState<TextSelection | null>(null);
  const [note, setNote] = useState('');

  const target = draft ?? selection;
  if (!target) return null;

  const finish = () => {
    setDraft(null);
    setNote('');
  };

  if (draft) {
    return (
      <form
        className="selection-bar selection-bar--note"
        onSubmit={(e) => {
          e.preventDefault();
          onHighlight(draft, note);
          finish();
        }}
        onKeyUp={(e) => {
          // Escape cancels the note; stop it there so it doesn't also close a panel.
          if (e.key === 'Escape') {
            e.stopPropagation();
            finish();
            onDismiss();
          }
        }}
      >
        <p className="selection-bar__quote">{draft.text}</p>
        <textarea
          className="text-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Note"
          aria-label="Note for this highlight"
          autoFocus
        />
        <div className="selection-bar__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              finish();
              onDismiss();
            }}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Save highlight
          </button>
        </div>
      </form>
    );
  }

  const term = lookupTerm(target.text);

  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected text">
      <button type="button" className="btn btn--primary" onClick={() => onHighlight(target)}>
        Highlight
      </button>
      <button type="button" className="btn" onClick={() => setDraft(target)}>
        Add note
      </button>
      {term && (
        <button type="button" className="btn" onClick={() => onDefine(term)}>
          Define
        </button>
      )}
      <button type="button" className="icon-btn" onClick={onDismiss} aria-label="Dismiss" title="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
