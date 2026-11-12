// idb checks values against the IDB* globals (IDBRequest and friends), so the
// whole set has to be installed, not just `indexedDB`.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bookmark } from './types';

// db.ts caches its connection at module level, so each test gets a fresh
// module instance on top of a fresh, empty database.
async function freshDb() {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  return import('./db');
}

function bookmark(id: string): Bookmark {
  return { id, cfi: `epubcfi(/6/2!/4/${id})`, label: `Chapter ${id}`, excerpt: 'text', createdAt: 1 };
}

let db: Awaited<ReturnType<typeof freshDb>>;

beforeEach(async () => {
  db = await freshDb();
});

describe('current book', () => {
  it('is undefined until a book is saved', async () => {
    expect(await db.loadCurrentBook()).toBeUndefined();
  });

  it('round-trips the stored book and replaces the previous one', async () => {
    await db.saveCurrentBook({ filename: 'a.epub', data: new ArrayBuffer(4), savedAt: 1 });
    await db.saveCurrentBook({ filename: 'b.epub', data: new ArrayBuffer(8), savedAt: 2 });

    const stored = await db.loadCurrentBook();
    expect(stored?.filename).toBe('b.epub');
    expect(stored?.data.byteLength).toBe(8);
  });

  it('is removed by clearCurrentBook', async () => {
    await db.saveCurrentBook({ filename: 'a.epub', data: new ArrayBuffer(4), savedAt: 1 });
    await db.clearCurrentBook();
    expect(await db.loadCurrentBook()).toBeUndefined();
  });
});

describe('per-book data', () => {
  it('returns an empty bookmark list for an unknown book', async () => {
    expect(await db.getBookmarks('nope')).toEqual([]);
  });

  it('keeps bookmarks, progress and locations separate per book', async () => {
    await db.saveBookmarks('book-a', [bookmark('1'), bookmark('2')]);
    await db.saveBookmarks('book-b', [bookmark('3')]);
    await db.saveProgress({ bookId: 'book-a', cfi: 'cfi-a', percentage: 0.25, updatedAt: 1 });
    await db.saveLocations('book-a', '["loc"]');

    expect((await db.getBookmarks('book-a')).map((b) => b.id)).toEqual(['1', '2']);
    expect((await db.getBookmarks('book-b')).map((b) => b.id)).toEqual(['3']);
    expect((await db.getProgress('book-a'))?.percentage).toBe(0.25);
    expect(await db.getProgress('book-b')).toBeUndefined();
    expect(await db.getLocations('book-a')).toBe('["loc"]');
    expect(await db.getLocations('book-b')).toBeUndefined();
  });
});

describe('listSavedBooks', () => {
  it('is empty when nothing is stored', async () => {
    expect(await db.listSavedBooks()).toEqual([]);
  });

  it('summarises each book across the stores, most recently read first', async () => {
    await db.saveBookmarks('book-a', [bookmark('1'), bookmark('2')]);
    await db.saveProgress({ bookId: 'book-a', cfi: 'cfi-a', percentage: 0.25, updatedAt: 100, title: 'Book A' });
    await db.saveLocations('book-a', '["loc"]');
    await db.saveProgress({ bookId: 'book-b', cfi: 'cfi-b', percentage: 0.9, updatedAt: 200 });
    // Only a location index: no position, so it sorts last.
    await db.saveLocations('book-c', '["loc"]');

    expect(await db.listSavedBooks()).toEqual([
      { bookId: 'book-b', bookmarkCount: 0, percentage: 0.9, updatedAt: 200, hasLocations: false },
      { bookId: 'book-a', title: 'Book A', bookmarkCount: 2, percentage: 0.25, updatedAt: 100, hasLocations: true },
      { bookId: 'book-c', bookmarkCount: 0, percentage: null, updatedAt: null, hasLocations: true },
    ]);
  });

  it('does not count the open book file as saved data', async () => {
    await db.saveCurrentBook({ filename: 'a.epub', data: new ArrayBuffer(4), savedAt: 1 });
    expect(await db.listSavedBooks()).toEqual([]);
  });
});

describe('deleteBookData', () => {
  it('removes one book from every store and leaves the others', async () => {
    for (const id of ['gone', 'kept']) {
      await db.saveBookmarks(id, [bookmark('1')]);
      await db.saveProgress({ bookId: id, cfi: 'cfi', percentage: 0.5, updatedAt: 1 });
      await db.saveLocations(id, '["loc"]');
    }

    await db.deleteBookData('gone');

    expect(await db.getBookmarks('gone')).toEqual([]);
    expect(await db.getProgress('gone')).toBeUndefined();
    expect(await db.getLocations('gone')).toBeUndefined();
    expect((await db.listSavedBooks()).map((b) => b.bookId)).toEqual(['kept']);
    expect(await db.getBookmarks('kept')).toHaveLength(1);
  });

  it('is a no-op for a book with no data', async () => {
    await expect(db.deleteBookData('nope')).resolves.toBeUndefined();
  });
});

describe('clearOtherBooksData', () => {
  it('removes every other book and keeps the current one', async () => {
    await db.saveBookmarks('keep', [bookmark('1')]);
    await db.saveProgress({ bookId: 'keep', cfi: 'cfi', percentage: 0.5, updatedAt: 1 });
    await db.saveLocations('keep', '["keep"]');

    // "old-a" has data in all three stores, "old-b" in only one: both count once.
    await db.saveBookmarks('old-a', [bookmark('2')]);
    await db.saveProgress({ bookId: 'old-a', cfi: 'cfi', percentage: 0.1, updatedAt: 1 });
    await db.saveLocations('old-a', '["a"]');
    await db.saveLocations('old-b', '["b"]');

    expect(await db.clearOtherBooksData('keep')).toBe(2);

    expect(await db.getBookmarks('old-a')).toEqual([]);
    expect(await db.getProgress('old-a')).toBeUndefined();
    expect(await db.getLocations('old-a')).toBeUndefined();
    expect(await db.getLocations('old-b')).toBeUndefined();

    expect(await db.getBookmarks('keep')).toHaveLength(1);
    expect((await db.getProgress('keep'))?.percentage).toBe(0.5);
    expect(await db.getLocations('keep')).toBe('["keep"]');
  });

  it('reports zero when there is nothing to remove', async () => {
    await db.saveBookmarks('keep', [bookmark('1')]);
    expect(await db.clearOtherBooksData('keep')).toBe(0);
    expect(await db.getBookmarks('keep')).toHaveLength(1);
  });

  it('leaves the open book file alone', async () => {
    await db.saveCurrentBook({ filename: 'a.epub', data: new ArrayBuffer(4), savedAt: 1 });
    await db.saveLocations('old', '["x"]');
    await db.clearOtherBooksData('keep');
    expect((await db.loadCurrentBook())?.filename).toBe('a.epub');
  });
});

describe('highlights', () => {
  const highlight = (id: string, note?: string) => ({
    id,
    cfiRange: `epubcfi(/6/2!/4/2,/1:0,/1:${id})`,
    text: `passage ${id}`,
    createdAt: 1,
    ...(note ? { note } : {}),
  });

  it('returns an empty list for an unknown book', async () => {
    expect(await db.getHighlights('nope')).toEqual([]);
  });

  it('round-trips highlights per book, notes included', async () => {
    await db.saveHighlights('book-a', [highlight('1'), highlight('2', 'remember this')]);
    await db.saveHighlights('book-b', [highlight('3')]);

    expect(await db.getHighlights('book-a')).toEqual([highlight('1'), highlight('2', 'remember this')]);
    expect((await db.getHighlights('book-b')).map((h) => h.id)).toEqual(['3']);
  });

  it('is removed along with the rest of a book\'s data', async () => {
    await db.saveHighlights('gone', [highlight('1')]);
    await db.saveHighlights('kept', [highlight('2')]);
    await db.deleteBookData('gone');
    expect(await db.getHighlights('gone')).toEqual([]);
    expect(await db.getHighlights('kept')).toHaveLength(1);
  });

  it('counts as other-book data when clearing', async () => {
    await db.saveHighlights('keep', [highlight('1')]);
    await db.saveHighlights('old', [highlight('2')]);
    expect(await db.clearOtherBooksData('keep')).toBe(1);
    expect(await db.getHighlights('old')).toEqual([]);
    expect(await db.getHighlights('keep')).toHaveLength(1);
  });
});

function shelfBook(bookId: string, bytes = 4) {
  return { bookId, filename: `${bookId}.epub`, data: new ArrayBuffer(bytes), title: `Title ${bookId}`, author: 'Author' };
}

const ROOMY = { maxBooks: 100, maxBytes: 1_000_000 };

describe('library', () => {
  it('is empty until a book is added', async () => {
    expect(await db.listLibrary()).toEqual([]);
  });

  it('lists books most recently opened first, with their progress', async () => {
    await db.addBookToLibrary(shelfBook('a', 10), ROOMY, 100);
    await db.addBookToLibrary(shelfBook('b', 20), ROOMY, 200);
    await db.saveProgress({ bookId: 'a', cfi: 'cfi', percentage: 0.4, updatedAt: 1 });

    const shelf = await db.listLibrary();
    expect(shelf.map((book) => book.bookId)).toEqual(['b', 'a']);
    expect(shelf[0]).toMatchObject({ title: 'Title b', author: 'Author', size: 20, percentage: null });
    expect(shelf[1]).toMatchObject({ filename: 'a.epub', size: 10, percentage: 0.4, addedAt: 100, lastOpenedAt: 100 });
  });

  it('re-adding a book refreshes it without losing when it was added or its cover', async () => {
    const cover = { data: new ArrayBuffer(3), type: 'image/jpeg' };
    await db.addBookToLibrary({ ...shelfBook('a'), cover }, ROOMY, 100);
    await db.addBookToLibrary(shelfBook('b'), ROOMY, 200);
    await db.addBookToLibrary({ ...shelfBook('a'), title: 'Renamed' }, ROOMY, 300);

    const shelf = await db.listLibrary();
    expect(shelf.map((book) => book.bookId)).toEqual(['a', 'b']);
    expect(shelf[0]).toMatchObject({ title: 'Renamed', addedAt: 100, lastOpenedAt: 300 });
    expect(shelf[0].cover?.type).toBe('image/jpeg');
    expect(shelf[0].cover?.data.byteLength).toBe(3);
  });

  it('opens a shelved book and makes it the one restored on the next load', async () => {
    await db.addBookToLibrary(shelfBook('a', 10), ROOMY, 100);
    await db.addBookToLibrary(shelfBook('b', 20), ROOMY, 200);
    expect(await db.loadCurrentBook()).toBeUndefined();

    const opened = await db.openLibraryBook('a');
    expect(opened?.filename).toBe('a.epub');
    expect(opened?.data.byteLength).toBe(10);

    const restored = await db.loadCurrentBook();
    expect(restored?.filename).toBe('a.epub');
    expect(restored?.data.byteLength).toBe(10);
  });

  it('returns undefined for a book that is not on the shelf', async () => {
    expect(await db.openLibraryBook('nope')).toBeUndefined();
    expect(await db.loadCurrentBook()).toBeUndefined();
  });

  it('moves the dropped file onto the shelf once the reader identifies it', async () => {
    await db.saveCurrentBook({ filename: 'a.epub', data: new ArrayBuffer(10), savedAt: 1 });
    await db.addBookToLibrary(shelfBook('a', 10), ROOMY, 100);

    // Still restorable, now through the shelf...
    expect((await db.loadCurrentBook())?.data.byteLength).toBe(10);
    // ...so removing it from the shelf leaves nothing to restore.
    await db.removeLibraryBook('a');
    expect(await db.loadCurrentBook()).toBeUndefined();
  });

  it('does not repoint the current book when a different file is pending', async () => {
    // "b" was dropped while "a" was still loading; "a" is then shelved late.
    await db.saveCurrentBook({ filename: 'b.epub', data: new ArrayBuffer(20), savedAt: 2 });
    await db.addBookToLibrary(shelfBook('a', 10), ROOMY, 100);

    expect((await db.loadCurrentBook())?.filename).toBe('b.epub');
    await db.removeLibraryBook('a');
    expect((await db.loadCurrentBook())?.filename).toBe('b.epub');
  });

  it('closing the book keeps it on the shelf', async () => {
    await db.saveCurrentBook({ filename: 'a.epub', data: new ArrayBuffer(10), savedAt: 1 });
    await db.addBookToLibrary(shelfBook('a', 10), ROOMY, 100);
    await db.clearCurrentBook();

    expect(await db.loadCurrentBook()).toBeUndefined();
    expect((await db.listLibrary()).map((book) => book.bookId)).toEqual(['a']);
    expect((await db.openLibraryBook('a'))?.data.byteLength).toBe(10);
  });

  it('removing a book deletes its file but keeps its bookmarks and position', async () => {
    await db.addBookToLibrary(shelfBook('a'), ROOMY, 100);
    await db.addBookToLibrary(shelfBook('b'), ROOMY, 200);
    await db.saveBookmarks('a', [bookmark('1')]);
    await db.saveProgress({ bookId: 'a', cfi: 'cfi', percentage: 0.4, updatedAt: 1 });

    await db.removeLibraryBook('a');

    expect((await db.listLibrary()).map((book) => book.bookId)).toEqual(['b']);
    expect(await db.openLibraryBook('a')).toBeUndefined();
    expect(await db.getBookmarks('a')).toHaveLength(1);
    expect((await db.getProgress('a'))?.percentage).toBe(0.4);
  });

  it('clearing other books\' data leaves the shelf alone', async () => {
    await db.addBookToLibrary(shelfBook('a'), ROOMY, 100);
    await db.clearOtherBooksData('keep');
    expect((await db.openLibraryBook('a'))?.filename).toBe('a.epub');
  });
});

describe('library eviction', () => {
  it('drops the least recently opened books beyond the book limit', async () => {
    const limits = { maxBooks: 2, maxBytes: 1_000_000 };
    expect(await db.addBookToLibrary(shelfBook('a'), limits, 100)).toEqual([]);
    expect(await db.addBookToLibrary(shelfBook('b'), limits, 200)).toEqual([]);
    expect(await db.addBookToLibrary(shelfBook('c'), limits, 300)).toEqual(['a']);

    expect((await db.listLibrary()).map((book) => book.bookId)).toEqual(['c', 'b']);
    expect(await db.openLibraryBook('a')).toBeUndefined();
  });

  it('goes by when a book was last opened, not when it was added', async () => {
    const limits = { maxBooks: 2, maxBytes: 1_000_000 };
    await db.addBookToLibrary(shelfBook('a'), limits, 100);
    await db.addBookToLibrary(shelfBook('b'), limits, 200);
    await db.addBookToLibrary(shelfBook('a'), limits, 300);
    expect(await db.addBookToLibrary(shelfBook('c'), limits, 400)).toEqual(['b']);
    expect((await db.listLibrary()).map((book) => book.bookId)).toEqual(['c', 'a']);
  });

  it('drops as many old books as it takes to get under the byte budget', async () => {
    const limits = { maxBooks: 100, maxBytes: 100 };
    await db.addBookToLibrary(shelfBook('a', 40), limits, 100);
    await db.addBookToLibrary(shelfBook('b', 40), limits, 200);
    await db.addBookToLibrary(shelfBook('c', 20), limits, 300);
    expect(await db.addBookToLibrary(shelfBook('d', 70), limits, 400)).toEqual(['a', 'b']);
    expect((await db.listLibrary()).map((book) => book.bookId)).toEqual(['d', 'c']);
  });

  it('keeps the book being opened even when it alone is over budget', async () => {
    const limits = { maxBooks: 100, maxBytes: 100 };
    await db.addBookToLibrary(shelfBook('a', 40), limits, 100);
    expect(await db.addBookToLibrary(shelfBook('huge', 500), limits, 200)).toEqual(['a']);
    expect((await db.listLibrary()).map((book) => book.bookId)).toEqual(['huge']);
    expect((await db.openLibraryBook('huge'))?.data.byteLength).toBe(500);
  });

  it('keeps an evicted book\'s bookmarks and position', async () => {
    const limits = { maxBooks: 1, maxBytes: 1_000_000 };
    await db.addBookToLibrary(shelfBook('a'), limits, 100);
    await db.saveBookmarks('a', [bookmark('1')]);
    await db.saveProgress({ bookId: 'a', cfi: 'cfi', percentage: 0.4, updatedAt: 1 });
    await db.addBookToLibrary(shelfBook('b'), limits, 200);

    expect(await db.getBookmarks('a')).toHaveLength(1);
    expect((await db.getProgress('a'))?.percentage).toBe(0.4);
  });
});

describe('upgrade from schema v1', () => {
  // Builds the database the way version 1 of the app left it.
  async function seedV1() {
    vi.resetModules();
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('epub-reader-db', 1);
      request.onupgradeneeded = () => {
        for (const name of ['currentBook', 'bookmarks', 'progress', 'locations']) {
          request.result.createObjectStore(name);
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const v1 = request.result;
        const tx = v1.transaction(['currentBook', 'bookmarks', 'progress', 'locations'], 'readwrite');
        tx.objectStore('currentBook').put({ filename: 'old.epub', data: new ArrayBuffer(16), savedAt: 5 }, 'singleton');
        tx.objectStore('bookmarks').put({ bookId: 'old', items: [bookmark('1')] }, 'old');
        tx.objectStore('progress').put({ bookId: 'old', cfi: 'cfi', percentage: 0.6, updatedAt: 7 }, 'old');
        tx.objectStore('locations').put({ bookId: 'old', locations: '["loc"]' }, 'old');
        tx.oncomplete = () => {
          v1.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    return import('./db');
  }

  it('keeps the open book and all per-book data', async () => {
    const upgraded = await seedV1();

    const current = await upgraded.loadCurrentBook();
    expect(current?.filename).toBe('old.epub');
    expect(current?.data.byteLength).toBe(16);
    expect(await upgraded.getBookmarks('old')).toHaveLength(1);
    expect((await upgraded.getProgress('old'))?.percentage).toBe(0.6);
    expect(await upgraded.getLocations('old')).toBe('["loc"]');
  });

  it('starts with an empty shelf that the open book then joins', async () => {
    const upgraded = await seedV1();
    expect(await upgraded.listLibrary()).toEqual([]);

    // What the reader does once it has opened the restored file.
    await upgraded.addBookToLibrary(
      { bookId: 'old', filename: 'old.epub', data: new ArrayBuffer(16), title: 'Old', author: '' },
      ROOMY,
      100,
    );

    expect(await upgraded.listLibrary()).toMatchObject([{ bookId: 'old', size: 16, percentage: 0.6 }]);
    expect((await upgraded.loadCurrentBook())?.data.byteLength).toBe(16);
  });
});
