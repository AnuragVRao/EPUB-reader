import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Bookmark, Progress, StoredBook, StoredLocations } from './types';

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

export async function getLocations(bookId: string): Promise<string | undefined> {
  const db = await getDB();
  const record = await db.get('locations', bookId);
  return record?.locations;
}

export async function saveLocations(bookId: string, locations: string): Promise<void> {
  const db = await getDB();
  await db.put('locations', { bookId, locations }, bookId);
}
