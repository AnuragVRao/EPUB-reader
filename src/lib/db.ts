import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Bookmark, Progress, SavedBookInfo, StoredBook, StoredLocations } from './types';
import type { CurrentBookPointer, Highlight, LibraryBook, LibraryEntry, LibraryLimits } from './types';

const CURRENT_BOOK_KEY = 'singleton';

interface EpubReaderDB extends DBSchema {
  // Either the dropped file itself (a book the reader has not identified yet,
  // and every record written by schema v1) or a pointer to a book on the
  // shelf.
  currentBook: {
    key: string;
    value: StoredBook | CurrentBookPointer;
  };
  // Added in v2. `library` holds what the shelf shows and `bookFiles` the
  // EPUBs themselves, so listing the shelf never loads the files.
  library: {
    key: string;
    value: LibraryBook;
  };
  bookFiles: {
    key: string;
    value: ArrayBuffer;
  };
  // Added in v2, keyed by book.key() like bookmarks.
  highlights: {
    key: string;
    value: { bookId: string; items: Highlight[] };
  };
  bookmarks: {
    key: string;
    value: { bookId: string; items: Bookmark[] };
  };
  progress: {
    key: string;
    value: Progress;
  };
  locations: {
    key: string;
    value: StoredLocations;
  };
}

let dbPromise: Promise<IDBPDatabase<EpubReaderDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<EpubReaderDB>('epub-reader-db', 2, {
      // Another tab wants to upgrade the schema: let go so it isn't blocked.
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase | null)?.close();
        dbPromise = null;
      },
      upgrade(db) {
        // v2: the shelf. Nothing from v1 needs rewriting - a v1 `currentBook`
        // record is a valid "not yet shelved" book, and the reader moves it
        // onto the shelf the next time it opens.
        if (!db.objectStoreNames.contains('library')) {
          db.createObjectStore('library');
        }
        if (!db.objectStoreNames.contains('bookFiles')) {
          db.createObjectStore('bookFiles');
        }
        if (!db.objectStoreNames.contains('highlights')) {
          db.createObjectStore('highlights');
        }
        if (!db.objectStoreNames.contains('currentBook')) {
          db.createObjectStore('currentBook');
        }
        if (!db.objectStoreNames.contains('bookmarks')) {
          db.createObjectStore('bookmarks');
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress');
        }
        if (!db.objectStoreNames.contains('locations')) {
          db.createObjectStore('locations');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveCurrentBook(book: StoredBook): Promise<void> {
  const db = await getDB();
  await db.put('currentBook', book, CURRENT_BOOK_KEY);
}

export async function loadCurrentBook(): Promise<StoredBook | undefined> {
  const db = await getDB();
  const current = await db.get('currentBook', CURRENT_BOOK_KEY);
  if (!current || 'data' in current) return current;
  return readLibraryBook(db, current.bookId);
}

export async function clearCurrentBook(): Promise<void> {
  const db = await getDB();
  await db.delete('currentBook', CURRENT_BOOK_KEY);
}

export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  const db = await getDB();
  const record = await db.get('bookmarks', bookId);
  return record?.items ?? [];
}

export async function saveBookmarks(bookId: string, items: Bookmark[]): Promise<void> {
  const db = await getDB();
  await db.put('bookmarks', { bookId, items }, bookId);
}

export async function getProgress(bookId: string): Promise<Progress | undefined> {
  const db = await getDB();
  return db.get('progress', bookId);
}

export async function saveProgress(progress: Progress): Promise<void> {
  const db = await getDB();
  await db.put('progress', progress, progress.bookId);
}

// Removes bookmarks, progress and cached locations for every book except
// `keepBookId`. Returns the number of distinct books whose data was removed.
export async function clearOtherBooksData(keepBookId: string): Promise<number> {
  const db = await getDB();
  const stores = ['bookmarks', 'progress', 'locations', 'highlights'] as const;
  const tx = db.transaction(stores, 'readwrite');
  const removed = new Set<string>();
  await Promise.all(
    stores.map(async (name) => {
      const store = tx.objectStore(name);
      const keys = await store.getAllKeys();
      await Promise.all(
        keys
          .filter((key) => key !== keepBookId)
          .map((key) => {
            removed.add(key);
            return store.delete(key);
          }),
      );
    }),
  );
  await tx.done;
  return removed.size;
}

// Lists every book that has bookmarks, a reading position or a cached
// location index, most recently read first.
export async function listSavedBooks(): Promise<SavedBookInfo[]> {
  const db = await getDB();
  const tx = db.transaction(['bookmarks', 'progress', 'locations'], 'readonly');
  const [bookmarks, progress, locationKeys] = await Promise.all([
    tx.objectStore('bookmarks').getAll(),
    tx.objectStore('progress').getAll(),
    tx.objectStore('locations').getAllKeys(),
  ]);
  await tx.done;

  const books = new Map<string, SavedBookInfo>();
  const entry = (bookId: string): SavedBookInfo => {
    let info = books.get(bookId);
    if (!info) {
      info = { bookId, bookmarkCount: 0, percentage: null, updatedAt: null, hasLocations: false };
      books.set(bookId, info);
    }
    return info;
  };
  for (const record of bookmarks) entry(record.bookId).bookmarkCount = record.items.length;
  for (const record of progress) {
    const info = entry(record.bookId);
    info.percentage = record.percentage;
    info.updatedAt = record.updatedAt;
    if (record.title) info.title = record.title;
  }
  for (const bookId of locationKeys) entry(bookId).hasLocations = true;

  return [...books.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

// Removes one book's bookmarks, progress and cached locations.
export async function deleteBookData(bookId: string): Promise<void> {
  const db = await getDB();
  const stores = ['bookmarks', 'progress', 'locations', 'highlights'] as const;
  const tx = db.transaction(stores, 'readwrite');
  await Promise.all(stores.map((name) => tx.objectStore(name).delete(bookId)));
  await tx.done;
}

export async function getLocations(bookId: string): Promise<string | undefined> {
  const db = await getDB();
  const record = await db.get('locations', bookId);
  return record?.locations;
}

export async function saveLocations(bookId: string, locations: string): Promise<void> {
  const db = await getDB();
  await db.put('locations', { bookId, locations }, bookId);
}

export async function getHighlights(bookId: string): Promise<Highlight[]> {
  const db = await getDB();
  const record = await db.get('highlights', bookId);
  return record?.items ?? [];
}

export async function saveHighlights(bookId: string, items: Highlight[]): Promise<void> {
  const db = await getDB();
  await db.put('highlights', { bookId, items }, bookId);
}

// The shelf: previously opened books, stored whole.

/** Least recently opened books are dropped once the shelf exceeds either limit. */
export const LIBRARY_LIMITS: LibraryLimits = { maxBooks: 20, maxBytes: 300 * 1024 * 1024 };

async function readLibraryBook(db: IDBPDatabase<EpubReaderDB>, bookId: string): Promise<StoredBook | undefined> {
  const tx = db.transaction(['library', 'bookFiles'], 'readonly');
  const [meta, data] = await Promise.all([
    tx.objectStore('library').get(bookId),
    tx.objectStore('bookFiles').get(bookId),
  ]);
  await tx.done;
  if (!meta || !data) return undefined;
  return { filename: meta.filename, data, savedAt: meta.lastOpenedAt };
}

export interface NewLibraryBook {
  bookId: string;
  filename: string;
  data: ArrayBuffer;
  title: string;
  author: string;
  cover?: LibraryBook['cover'];
}

// Puts a book on the shelf, or marks one already there as just opened, then
// enforces the shelf limits. Returns the ids of the books evicted to make
// room. Only files are evicted: bookmarks and reading positions are small and
// stay, so re-adding the book later picks up where it left off.
export async function addBookToLibrary(
  book: NewLibraryBook,
  limits: LibraryLimits = LIBRARY_LIMITS,
  now: number = Date.now(),
): Promise<string[]> {
  const db = await getDB();
  const tx = db.transaction(['currentBook', 'library', 'bookFiles'], 'readwrite');
  const current = tx.objectStore('currentBook');
  const library = tx.objectStore('library');
  const files = tx.objectStore('bookFiles');

  const [existing, hasFile] = await Promise.all([library.get(book.bookId), files.getKey(book.bookId)]);
  const size = book.data.byteLength;
  await library.put(
    {
      bookId: book.bookId,
      filename: book.filename || existing?.filename || '',
      title: book.title,
      author: book.author,
      cover: book.cover ?? existing?.cover,
      size,
      addedAt: existing?.addedAt ?? now,
      lastOpenedAt: now,
    },
    book.bookId,
  );
  // Rewriting megabytes on every open would be wasteful; the file only
  // changes if a different edition with the same identifier is dropped.
  if (hasFile === undefined || existing?.size !== size) await files.put(book.data, book.bookId);

  // The file is on the shelf now, so `currentBook` no longer needs its own
  // copy. Checked against the pending record because a different book may
  // have been dropped while this one was still loading.
  const pending = await current.get(CURRENT_BOOK_KEY);
  if (pending && 'data' in pending && pending.filename === book.filename && pending.data.byteLength === size) {
    await current.put({ bookId: book.bookId }, CURRENT_BOOK_KEY);
  }

  const shelf = (await library.getAll()).sort((a, b) => a.lastOpenedAt - b.lastOpenedAt);
  let count = shelf.length;
  let bytes = shelf.reduce((sum, entry) => sum + entry.size, 0);
  const evicted: string[] = [];
  for (const entry of shelf) {
    if (count <= limits.maxBooks && bytes <= limits.maxBytes) break;
    // The book being opened always stays, even if it alone is over budget.
    if (entry.bookId === book.bookId) continue;
    await Promise.all([library.delete(entry.bookId), files.delete(entry.bookId)]);
    evicted.push(entry.bookId);
    count -= 1;
    bytes -= entry.size;
  }
  await tx.done;
  return evicted;
}

// Lists the shelf, most recently opened first, with each book's progress.
export async function listLibrary(): Promise<LibraryEntry[]> {
  const db = await getDB();
  const tx = db.transaction(['library', 'progress'], 'readonly');
  const [books, progress] = await Promise.all([
    tx.objectStore('library').getAll(),
    tx.objectStore('progress').getAll(),
  ]);
  await tx.done;
  const read = new Map(progress.map((record) => [record.bookId, record.percentage]));
  return books
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .map((book) => ({ ...book, percentage: read.get(book.bookId) ?? null }));
}

// Reads a shelved book and makes it the current one, so it is the book that
// reopens on the next page load. Undefined if it is no longer on the shelf.
export async function openLibraryBook(bookId: string): Promise<StoredBook | undefined> {
  const db = await getDB();
  const stored = await readLibraryBook(db, bookId);
  if (stored) await db.put('currentBook', { bookId }, CURRENT_BOOK_KEY);
  return stored;
}

// Takes a book off the shelf and deletes its file. Its bookmarks and reading
// position are left alone.
export async function removeLibraryBook(bookId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['currentBook', 'library', 'bookFiles'], 'readwrite');
  const current = tx.objectStore('currentBook');
  const pointer = await current.get(CURRENT_BOOK_KEY);
  await Promise.all([
    tx.objectStore('library').delete(bookId),
    tx.objectStore('bookFiles').delete(bookId),
    pointer && !('data' in pointer) && pointer.bookId === bookId ? current.delete(CURRENT_BOOK_KEY) : undefined,
  ]);
  await tx.done;
}
