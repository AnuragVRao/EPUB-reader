import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Bookmark, Progress, SavedBookInfo, StoredBook, StoredLocations } from './types';

const CURRENT_BOOK_KEY = 'singleton';

interface EpubReaderDB extends DBSchema {
  currentBook: {
    key: string;
    value: StoredBook;
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
    dbPromise = openDB<EpubReaderDB>('epub-reader-db', 1, {
      upgrade(db) {
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
  return db.get('currentBook', CURRENT_BOOK_KEY);
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
  const stores = ['bookmarks', 'progress', 'locations'] as const;
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
  const stores = ['bookmarks', 'progress', 'locations'] as const;
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
