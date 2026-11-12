import { useEffect, useRef } from 'react';
import type { BookNote } from '../hooks/useEpubReader';

interface NotePopupProps {
  note: BookNote;
  onClose: () => void;
  /** Navigates to the note's own place in the book. */
  onGoTo: (target: string) => void;
}

// Shows a footnote over the page it was referenced from, so reading it
// doesn't mean losing the page.
export default function NotePopup({ note, onClose, onGoTo }: NotePopupProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // The click that opened the note left focus inside the book's iframe,
  // where the app can't see Escape. Bring it here.
  useEffect(() => {
    cardRef.current?.focus();
  }, [note]);

  return (
    <div className="note-popup" onClick={onClose}>
      <div
        className="note-popup__card"
        role="dialog"
        aria-label="Footnote"
        tabIndex={-1}
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        onKeyUp={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="note-popup__text">{note.text}</div>
        <div className="note-popup__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              onClose();
              onGoTo(note.target);
            }}
          >
            Go to note
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
