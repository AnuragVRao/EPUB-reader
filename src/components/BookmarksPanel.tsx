import type { Bookmark } from '../lib/types';

interface BookmarksPanelProps {
  bookmarks: Bookmark[];
  onSelect: (cfi: string) => void;
  onRemove: (id: string) => void;
}

export default function BookmarksPanel({ bookmarks, onSelect, onRemove }: BookmarksPanelProps) {
  if (bookmarks.length === 0) {
    return <p className="side-panel__empty">No bookmarks yet. Use the bookmark button in the toolbar to save your place.</p>;
  }

  return (
    <ul className="bookmark-list">
      {bookmarks.map((bookmark) => (
        <li key={bookmark.id} className="bookmark-item">
          <button type="button" className="bookmark-item__main" onClick={() => onSelect(bookmark.cfi)}>
            <span className="bookmark-item__label">{bookmark.label}</span>
            <span className="bookmark-item__date">{new Date(bookmark.createdAt).toLocaleString()}</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Remove bookmark"
            onClick={() => onRemove(bookmark.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
