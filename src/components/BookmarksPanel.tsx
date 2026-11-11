import { useState } from 'react';
import type { Bookmark } from '../lib/types';
import type { BookmarkPatch } from '../hooks/useEpubReader';

interface BookmarksPanelProps {
  bookmarks: Bookmark[];
  onSelect: (cfi: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: BookmarkPatch) => void;
}

export default function BookmarksPanel({ bookmarks, onSelect, onRemove, onUpdate }: BookmarksPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (bookmarks.length === 0) {
    return <p className="side-panel__empty">No bookmarks yet. Use the bookmark button in the toolbar to save your place.</p>;
  }

  return (
    <ul className="bookmark-list">
      {bookmarks.map((bookmark) =>
        bookmark.id === editingId ? (
          <li key={bookmark.id}>
            <BookmarkEditor
              bookmark={bookmark}
              onSave={(patch) => {
                onUpdate(bookmark.id, patch);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          </li>
        ) : (
          <li key={bookmark.id} className="bookmark-item">
            <button type="button" className="bookmark-item__main" onClick={() => onSelect(bookmark.cfi)}>
              <span className="bookmark-item__label">{bookmark.label}</span>
              {bookmark.excerpt && <span className="bookmark-item__excerpt">{bookmark.excerpt}</span>}
              {bookmark.note && <span className="bookmark-item__note">{bookmark.note}</span>}
              <span className="bookmark-item__date">{new Date(bookmark.createdAt).toLocaleString()}</span>
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Edit bookmark: ${bookmark.label}`}
              title="Rename or add a note"
              onClick={() => setEditingId(bookmark.id)}
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
              aria-label={`Remove bookmark: ${bookmark.label}`}
              title="Remove bookmark"
              onClick={() => onRemove(bookmark.id)}
            >
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function BookmarkEditor({
  bookmark,
  onSave,
  onCancel,
}: {
  bookmark: Bookmark;
  onSave: (patch: BookmarkPatch) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(bookmark.label);
  const [note, setNote] = useState(bookmark.note ?? '');

  return (
    <form
      className="bookmark-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ label, note });
      }}
      onKeyUp={(e) => {
        // Escape cancels the edit; stop it there so it doesn't also close the panel.
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <label className="bookmark-editor__field">
        <span>Name</span>
        <input
          type="text"
          className="text-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          autoFocus
        />
      </label>
      <label className="bookmark-editor__field">
        <span>Note</span>
        <textarea
          className="text-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Optional"
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
