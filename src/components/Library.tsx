import { useCallback, useEffect, useState } from 'react';
import { LIBRARY_LIMITS, listLibrary, removeLibraryBook } from '../lib/db';
import { formatBytes } from '../lib/format';
import type { LibraryEntry } from '../lib/types';

interface LibraryProps {
  onOpen: (bookId: string) => void;
}

// The shelf of previously opened books on the start screen. Renders nothing
// until there is at least one book, so a first visit shows only the drop zone.
export default function Library({ onOpen }: LibraryProps) {
  const [books, setBooks] = useState<LibraryEntry[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listLibrary()
      .then((entries) => {
        if (!cancelled) setBooks(entries);
      })
      .catch((err: unknown) => {
        // IndexedDB unavailable: there is simply no shelf to show.
        console.warn('Could not read the library', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Covers are stored as raw bytes; give each an object URL for as long as
  // this list is on screen.
  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const book of books) {
      if (book.cover) urls[book.bookId] = URL.createObjectURL(new Blob([book.cover.data], { type: book.cover.type }));
    }
    setCovers(urls);
    return () => {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
  }, [books]);

  const remove = useCallback(async (bookId: string) => {
    setConfirmingId(null);
    try {
      await removeLibraryBook(bookId);
      setBooks((prev) => prev.filter((book) => book.bookId !== bookId));
    } catch (err) {
      console.warn('Could not remove the book', err);
    }
  }, []);

  if (books.length === 0) return null;

  const totalBytes = books.reduce((sum, book) => sum + book.size, 0);

  return (
    <section className="library" aria-label="Your books">
      <div className="library__header">
        <h2>Your books</h2>
        <span
          className="library__usage"
          title={`Keeps the ${LIBRARY_LIMITS.maxBooks} most recently opened books, up to ${formatBytes(LIBRARY_LIMITS.maxBytes)}. Older ones are dropped first.`}
        >
          {books.length} {books.length === 1 ? 'book' : 'books'} &middot; {formatBytes(totalBytes)} of{' '}
          {formatBytes(LIBRARY_LIMITS.maxBytes)}
        </span>
      </div>
      <ul className="library__grid">
        {books.map((book) => {
          const title = book.title || book.filename || 'Untitled';
          const percent = book.percentage === null ? null : Math.round(book.percentage * 100);
          return (
            <li key={book.bookId} className="library-book">
              <button
                type="button"
                className="library-book__open"
                onClick={() => onOpen(book.bookId)}
                title={`Open ${title}`}
              >
                <span className="library-book__cover">
                  {covers[book.bookId] ? (
                    <img src={covers[book.bookId]} alt="" loading="lazy" />
                  ) : (
                    <span className="library-book__placeholder" aria-hidden="true">
                      {title}
                    </span>
                  )}
                </span>
                <span className="library-book__title">{title}</span>
                {book.author && <span className="library-book__author">{book.author}</span>}
                <span className="library-book__meta">
                  {percent === null ? 'Not started' : `${percent}% read`} &middot; {formatBytes(book.size)}
                </span>
                {percent !== null && (
                  <span className="library-book__progress" aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                  </span>
                )}
              </button>
              {confirmingId === book.bookId ? (
                <div className="library-book__confirm">
                  <button type="button" className="btn btn--danger" onClick={() => remove(book.bookId)}>
                    Remove
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmingId(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="icon-btn library-book__remove"
                  aria-label={`Remove ${title} from your books`}
                  title="Remove from your books (bookmarks and position are kept)"
                  onClick={() => setConfirmingId(book.bookId)}
                >
                  <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
