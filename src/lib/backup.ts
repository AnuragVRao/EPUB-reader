import type { Bookmark } from './types';

/**
 * The export/import file: bookmarks and reading positions for every book,
 * keyed by the same `book.key()` identifier the database uses, so they attach
 * to the right book in another browser as soon as that book is opened there.
 * The books themselves and the regenerable location index are not included.
 */
export interface BackupFile {
  app: 'epub-reader';
  version: 1;
  exportedAt: number;
  books: BackupBook[];
}

export interface BackupBook {
  bookId: string;
  title?: string;
  progress?: { cfi: string; percentage: number; updatedAt: number };
  bookmarks: Bookmark[];
}

export const BACKUP_APP = 'epub-reader';
export const BACKUP_VERSION = 1;

const MAX_TEXT = 4000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT) : undefined;
}

function isCfi(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('epubcfi(') && value.length <= MAX_TEXT;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseBookmark(raw: unknown): Bookmark | null {
  if (!isRecord(raw) || !isCfi(raw.cfi)) return null;
  const createdAt = finite(raw.createdAt) ?? Date.now();
  const bookmark: Bookmark = {
    id: text(raw.id) || `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    cfi: raw.cfi,
    label: text(raw.label) || 'Bookmark',
    excerpt: text(raw.excerpt) ?? '',
    createdAt,
  };
  const note = text(raw.note)?.trim();
  if (note) bookmark.note = note;
  return bookmark;
}

function parseBook(raw: unknown): BackupBook | null {
  if (!isRecord(raw)) return null;
  const bookId = text(raw.bookId);
  if (!bookId) return null;

  const book: BackupBook = { bookId, bookmarks: [] };
  const title = text(raw.title);
  if (title) book.title = title;

  if (Array.isArray(raw.bookmarks)) {
    book.bookmarks = raw.bookmarks.map(parseBookmark).filter((b): b is Bookmark => b !== null);
  }
  if (isRecord(raw.progress) && isCfi(raw.progress.cfi)) {
    const percentage = finite(raw.progress.percentage) ?? 0;
    book.progress = {
      cfi: raw.progress.cfi,
      percentage: Math.min(1, Math.max(0, percentage)),
      updatedAt: finite(raw.progress.updatedAt) ?? 0,
    };
  }
  return book.progress || book.bookmarks.length ? book : null;
}

/**
 * Validates a parsed JSON value as a backup file. The file is user-supplied,
 * so nothing in it is trusted: entries that don't have the right shape are
 * dropped, and a file that isn't a backup at all throws with a message meant
 * for the user.
 */
export function parseBackup(raw: unknown): BackupFile {
  if (!isRecord(raw) || raw.app !== BACKUP_APP || !Array.isArray(raw.books)) {
    throw new Error('This file is not an EPUB Reader export.');
  }
  if (raw.version !== BACKUP_VERSION) {
    throw new Error('This export was made by a newer version of EPUB Reader.');
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: finite(raw.exportedAt) ?? 0,
    books: raw.books.map(parseBook).filter((b): b is BackupBook => b !== null),
  };
}

/**
 * Adds `incoming` bookmarks to `existing`. A bookmark is the same one if it
 * marks the same position; the existing copy wins, but picks up a note from
 * the incoming one if it has none of its own. Returns the merged list in
 * creation order and how many bookmarks were actually new.
 */
export function mergeBookmarks(existing: Bookmark[], incoming: Bookmark[]): { bookmarks: Bookmark[]; added: number } {
  const byCfi = new Map(existing.map((b) => [b.cfi, b]));
  const ids = new Set(existing.map((b) => b.id));
  let added = 0;
  for (const bookmark of incoming) {
    const current = byCfi.get(bookmark.cfi);
    if (current) {
      if (!current.note && bookmark.note) byCfi.set(bookmark.cfi, { ...current, note: bookmark.note });
      continue;
    }
    // Ids only need to be unique within a book; re-mint one that clashes.
    const id = ids.has(bookmark.id) ? `${bookmark.id}-${Math.random().toString(36).slice(2, 8)}` : bookmark.id;
    ids.add(id);
    byCfi.set(bookmark.cfi, { ...bookmark, id });
    added += 1;
  }
  return { bookmarks: [...byCfi.values()].sort((a, b) => a.createdAt - b.createdAt), added };
}
