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

describe('export and import', () => {
  it('exports bookmarks and positions, but not the location index or the book file', async () => {
    await db.saveBookmarks('book-a', [bookmark('1')]);
    await db.saveProgress({ bookId: 'book-a', cfi: 'epubcfi(/6/2!/4/2)', percentage: 0.25, updatedAt: 100, title: 'Book A' });
    await db.saveLocations('book-a', '["loc"]');
    await db.saveLocations('book-b', '["loc"]');
    await db.saveBookmarks('book-c', []);
    await db.saveCurrentBook({ filename: 'a.epub', data: new ArrayBuffer(4), savedAt: 1 });

    const file = await db.exportBackup();
    expect(file.app).toBe('epub-reader');
    expect(file.version).toBe(1);
    expect(file.books).toEqual([
      {
        bookId: 'book-a',
        title: 'Book A',
        progress: { cfi: 'epubcfi(/6/2!/4/2)', percentage: 0.25, updatedAt: 100 },
        bookmarks: [bookmark('1')],
      },
    ]);
  });

  it('round-trips into an empty database', async () => {
    await db.saveBookmarks('book-a', [bookmark('1'), bookmark('2')]);
    await db.saveProgress({ bookId: 'book-a', cfi: 'epubcfi(/6/2!/4/2)', percentage: 0.25, updatedAt: 100, title: 'Book A' });
    const file = await db.exportBackup();

    db = await freshDb();
    expect(await db.importBackup(file)).toEqual({ books: 1, bookmarks: 2, positions: 1 });
    expect(await db.getBookmarks('book-a')).toEqual([bookmark('1'), bookmark('2')]);
    expect(await db.getProgress('book-a')).toEqual({
      bookId: 'book-a',
      cfi: 'epubcfi(/6/2!/4/2)',
      percentage: 0.25,
      updatedAt: 100,
      title: 'Book A',
    });
    expect((await db.listSavedBooks())[0]?.title).toBe('Book A');
  });

  it('merges into existing data without removing anything', async () => {
    await db.saveBookmarks('book-a', [bookmark('1')]);
    await db.saveProgress({ bookId: 'book-a', cfi: 'epubcfi(/6/2!/4/8)', percentage: 0.8, updatedAt: 500, title: 'Book A' });
    await db.saveBookmarks('book-z', [bookmark('9')]);

    const summary = await db.importBackup({
      app: 'epub-reader',
      version: 1,
      exportedAt: 1,
      books: [
        {
          bookId: 'book-a',
          // Older than what is stored: must not move the reader backwards.
          progress: { cfi: 'epubcfi(/6/2!/4/2)', percentage: 0.1, updatedAt: 100 },
          bookmarks: [bookmark('1'), bookmark('2')],
        },
        { bookId: 'book-b', bookmarks: [], progress: { cfi: 'epubcfi(/6/2!/4/4)', percentage: 0.3, updatedAt: 50 } },
      ],
    });

    expect(summary).toEqual({ books: 2, bookmarks: 1, positions: 1 });
    expect((await db.getBookmarks('book-a')).map((b) => b.id)).toEqual(['1', '2']);
    expect((await db.getProgress('book-a'))?.percentage).toBe(0.8);
    expect((await db.getProgress('book-b'))?.percentage).toBe(0.3);
    expect(await db.getBookmarks('book-z')).toHaveLength(1);
  });

  it('takes a newer reading position from the file', async () => {
    await db.saveProgress({ bookId: 'book-a', cfi: 'epubcfi(/6/2!/4/2)', percentage: 0.1, updatedAt: 100, title: 'Book A' });
    const summary = await db.importBackup({
      app: 'epub-reader',
      version: 1,
      exportedAt: 1,
      books: [{ bookId: 'book-a', bookmarks: [], progress: { cfi: 'epubcfi(/6/2!/4/8)', percentage: 0.9, updatedAt: 200 } }],
    });
    expect(summary).toEqual({ books: 1, bookmarks: 0, positions: 1 });
    // The title already known for the book is kept.
    expect(await db.getProgress('book-a')).toMatchObject({ percentage: 0.9, updatedAt: 200, title: 'Book A' });
  });

  it('reports nothing changed when the same file is imported twice', async () => {
    await db.saveBookmarks('book-a', [bookmark('1')]);
    await db.saveProgress({ bookId: 'book-a', cfi: 'epubcfi(/6/2!/4/2)', percentage: 0.25, updatedAt: 100 });
    const file = await db.exportBackup();
    expect(await db.importBackup(file)).toEqual({ books: 0, bookmarks: 0, positions: 0 });
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
