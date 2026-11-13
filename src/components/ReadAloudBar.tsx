interface ReadAloudBarProps {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/** Floating controls shown while the book is being read aloud. */
export default function ReadAloudBar({ paused, onPause, onResume, onStop }: ReadAloudBarProps) {
  return (
    <div className="read-aloud-bar" role="group" aria-label="Read aloud">
      <span className="read-aloud-bar__label" aria-live="polite">
        {paused ? 'Paused' : 'Reading aloud'}
      </span>
      {paused ? (
        <button type="button" className="icon-btn" onClick={onResume} aria-label="Resume reading" title="Resume">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button type="button" className="icon-btn" onClick={onPause} aria-label="Pause reading" title="Pause">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z" fill="currentColor" />
          </svg>
        </button>
      )}
      <button type="button" className="icon-btn" onClick={onStop} aria-label="Stop reading" title="Stop">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M7 7h10v10H7z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
