import { describe, expect, it } from 'vitest';
import { mergeBookmarks, parseBackup } from './backup';
import type { Bookmark } from './types';

function bookmark(n: number, extra: Partial<Bookmark> = {}): Bookmark {
  return { id: `id-${n}`, cfi: `epubcfi(/6/2!/4/${n})`, label: `Chapter ${n}`, excerpt: 'text', createdAt: n, ...extra };
}

describe('parseBackup', () => {
  it('accepts a well-formed export unchanged', () => {
    const file = {
      app: 'epub-reader',
      version: 1,
      exportedAt: 123,
      books: [
        {
          bookId: 'book-a',
          title: 'Book A',
          progress: { cfi: 'epubcfi(/6/2!/4/2)', percentage: 0.4, updatedAt: 99 },
          bookmarks: [bookmark(1, { note: 'remember this' })],
        },
      ],
    };
    expect(parseBackup(JSON.parse(JSON.stringify(file)))).toEqual(file);
  });

  it('rejects files that are not exports, with a message for the user', () => {
    expect(() => parseBackup(null)).toThrow(/not an EPUB Reader export/);
    expect(() => parseBackup([])).toThrow(/not an EPUB Reader export/);
    expect(() => parseBackup({ app: 'something-else', version: 1, books: [] })).toThrow(/not an EPUB Reader export/);
    expect(() => parseBackup({ app: 'epub-reader', version: 1 })).toThrow(/not an EPUB Reader export/);
    expect(() => parseBackup({ app: 'epub-reader', version: 2, books: [] })).toThrow(/newer version/);
  });

  it('drops malformed books, bookmarks and positions but keeps the rest', () => {
    const parsed = parseBackup({
      app: 'epub-reader',
      version: 1,
      books: [
        'not a book',
        { title: 'no id', bookmarks: [bookmark(1)] },
        { bookId: 'empty', bookmarks: [] },
        {
          bookId: 'book-a',
          progress: { cfi: 'not-a-cfi', percentage: 0.5, updatedAt: 1 },
          bookmarks: [bookmark(1), { cfi: 42 }, null, { cfi: 'epubcfi(/6/2!/4/9)', label: 7, note: '   ' }],
        },
        { bookId: 'book-b', progress: { cfi: 'epubcfi(/6/4!/4/2)', percentage: 7, updatedAt: 'x' } },
      ],
    });

    expect(parsed.exportedAt).toBe(0);
    expect(parsed.books.map((b) => b.bookId)).toEqual(['book-a', 'book-b']);
    const [a, b] = parsed.books;
    expect(a.progress).toBeUndefined();
    expect(a.bookmarks).toHaveLength(2);
    expect(a.bookmarks[1]).toMatchObject({ cfi: 'epubcfi(/6/2!/4/9)', label: 'Bookmark', excerpt: '' });
    expect(a.bookmarks[1].note).toBeUndefined();
    expect(typeof a.bookmarks[1].id).toBe('string');
    // Out-of-range percentage is clamped; a bad timestamp becomes "oldest".
    expect(b.progress).toEqual({ cfi: 'epubcfi(/6/4!/4/2)', percentage: 1, updatedAt: 0 });
  });
});

describe('mergeBookmarks', () => {
  it('adds bookmarks at new positions and keeps creation order', () => {
    const { bookmarks, added } = mergeBookmarks([bookmark(1), bookmark(3)], [bookmark(2)]);
    expect(added).toBe(1);
    expect(bookmarks.map((b) => b.cfi)).toEqual([bookmark(1).cfi, bookmark(2).cfi, bookmark(3).cfi]);
  });

  it('keeps the existing bookmark when the position is already marked', () => {
    const existing = bookmark(1, { label: 'Mine', note: 'my note' });
    const { bookmarks, added } = mergeBookmarks([existing], [bookmark(1, { id: 'other', label: 'Theirs', note: 'their note' })]);
    expect(added).toBe(0);
    expect(bookmarks).toEqual([existing]);
  });

  it('fills in a missing note from the incoming copy', () => {
    const { bookmarks, added } = mergeBookmarks([bookmark(1)], [bookmark(1, { note: 'their note' })]);
    expect(added).toBe(0);
    expect(bookmarks[0]).toMatchObject({ id: 'id-1', label: 'Chapter 1', note: 'their note' });
  });

  it('re-mints an id that clashes with a different bookmark', () => {
    const { bookmarks } = mergeBookmarks([bookmark(1)], [bookmark(2, { id: 'id-1' })]);
    expect(new Set(bookmarks.map((b) => b.id)).size).toBe(2);
  });

  it('importing the same file twice changes nothing the second time', () => {
    const incoming = [bookmark(1), bookmark(2)];
    const first = mergeBookmarks([], incoming);
    const second = mergeBookmarks(first.bookmarks, incoming);
    expect(second.added).toBe(0);
    expect(second.bookmarks).toEqual(first.bookmarks);
  });
});
