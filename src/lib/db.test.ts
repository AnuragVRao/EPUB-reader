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
