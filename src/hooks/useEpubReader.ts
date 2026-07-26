import { useCallback, useEffect, useRef, useState } from 'react';
import ePub from 'epubjs';
import type { Book, Rendition, Location, NavItem } from 'epubjs';
import { applyThemeAndFonts, registerThemes } from '../lib/epubThemes';
import { getBookmarks, getLocations, getProgress, saveBookmarks, saveLocations, saveProgress } from '../lib/db';
import type { Bookmark, ReaderSettings, SearchResult, TocItem } from '../lib/types';

interface FindMatch {
  cfi: string;
  excerpt: string;
}

function toTocItems(items: NavItem[]): TocItem[] {
  return items.map((item, index) => ({
    id: item.id || `${item.href}-${index}`,
    label: item.label.trim(),
    href: item.href,
    subitems: item.subitems && item.subitems.length ? toTocItems(item.subitems) : undefined,
  }));
}

// Serializes operations that tear down and recreate epub.js's rendered
// views (flow changes, container resizes) so a burst of them - e.g. dragging
// the browser window edge, or a resize landing mid flow-change - can't have
// a later step start clearing views while an earlier one is still rendering.
function enqueueRelayout(
  chainRef: { current: Promise<void> },
  rendition: Rendition,
  action: () => void,
): void {
  chainRef.current = chainRef.current.then(
    () =>
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          rendition.off('relocated', finish);
          resolve();
        };
        rendition.on('relocated', finish);
        action();
        // Safety net for actions that don't touch the current view (e.g. a
        // resize that epub.js decides is a no-op) and so never relocate.
        setTimeout(finish, 300);
      }),
  );
}

function findChapterLabel(book: Book, href: string): string {
  if (!href) return '';
  const direct = book.navigation.get(href);
  if (direct) return direct.label.trim();

  const withoutHash = href.split('#')[0];
  const fallback = book.navigation.get(withoutHash);
  if (fallback) return fallback.label.trim();

  let found: NavItem | undefined;
  const search = (items: NavItem[]) => {
    for (const item of items) {
      if (found) return;
      if (item.href && item.href.split('#')[0] === withoutHash) {
        found = item;
        return;
      }
      if (item.subitems?.length) search(item.subitems);
    }
  };
  search(book.navigation.toc);
  return found?.label?.trim() ?? '';
}

export interface EpubReaderApi {
  containerRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  error: string | null;
  title: string;
  author: string;
  toc: TocItem[];
  currentChapterLabel: string;
  currentHref: string;
  bookmarks: Bookmark[];
  isCurrentBookmarked: boolean;
  next: () => void;
  prev: () => void;
  goToHref: (href: string) => void;
  goToCfi: (cfi: string) => void;
  toggleBookmark: () => void;
  removeBookmark: (id: string) => void;
  search: (query: string) => Promise<SearchResult[]>;
}

export function useEpubReader(data: ArrayBuffer | null, settings: ReaderSettings): EpubReaderApi {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookIdRef = useRef<string>('');
  const currentCfiRef = useRef<string>('');
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const relayoutChainRef = useRef<Promise<void>>(Promise.resolve());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentChapterLabel, setCurrentChapterLabel] = useState('');
  const [currentHref, setCurrentHref] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [currentCfi, setCurrentCfi] = useState('');

  useEffect(() => {
    if (!data || !containerRef.current) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setToc([]);
    setBookmarks([]);
    setCurrentChapterLabel('');

    const book = ePub(data.slice(0));
    bookRef.current = book;

    const rendition = book.renderTo(containerRef.current, {
      width: '100%',
      height: '100%',
      flow: settingsRef.current.flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
      spread: 'auto',
    });
    renditionRef.current = rendition;
    registerThemes(rendition);
    applyThemeAndFonts(rendition, settingsRef.current);

    const onRelocated = (location: Location) => {
      const cfi = location.start.cfi;
      currentCfiRef.current = cfi;
      setCurrentCfi(cfi);
      setCurrentHref(location.start.href);
      setCurrentChapterLabel(findChapterLabel(book, location.start.href));
      const pct = book.locations.length() ? book.locations.percentageFromCfi(cfi) : 0;
      const bid = bookIdRef.current;
      if (bid) {
        saveProgress({ bookId: bid, cfi, percentage: pct, updatedAt: Date.now() });
      }
    };
    rendition.on('relocated', onRelocated);

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') rendition.prev();
      if (event.key === 'ArrowRight') rendition.next();
    };
    rendition.on('keyup', onKeyUp);

    // epub.js only re-measures the container when width/height are explicitly
    // `null` (auto-detect); a bare `resize()` call is a no-op for sizing.
    // Must stay a method call (not a detached reference) to keep `this` bound.
    const remeasure = () => {
      (rendition as unknown as { resize: (width: number | null, height: number | null) => void }).resize(
        null,
        null,
      );
    };

    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(
        () => enqueueRelayout(relayoutChainRef, rendition, remeasure),
        120,
      );
    });
    resizeObserver.observe(containerRef.current);

    (async () => {
      try {
        await book.ready;
        if (cancelled) return;

        const bookId = book.key();
        bookIdRef.current = bookId;
        const metadata = book.packaging.metadata;
        setTitle(metadata.title || 'Untitled');
        setAuthor(metadata.creator || 'Unknown author');
        setToc(toTocItems(book.navigation.toc));

        const [storedBookmarks, storedProgress, storedLocations] = await Promise.all([
          getBookmarks(bookId),
          getProgress(bookId),
          getLocations(bookId),
        ]);
        if (cancelled) return;
        setBookmarks(storedBookmarks);

        if (storedLocations) {
          book.locations.load(storedLocations);
        } else {
          book.locations.generate(1600).then(() => {
            if (!cancelled) saveLocations(bookId, book.locations.save());
          });
        }

        await rendition.display(storedProgress?.cfi || undefined);
        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error('Failed to open EPUB', err);
        if (!cancelled) {
          setError('This file could not be opened. It may not be a valid EPUB.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(resizeTimeoutRef.current);
      resizeObserver.disconnect();
      rendition.off('relocated', onRelocated);
      rendition.off('keyup', onKeyUp);
      rendition.destroy();
      book.destroy();
      bookRef.current = null;
      renditionRef.current = null;
      bookIdRef.current = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    applyThemeAndFonts(rendition, settings);
  }, [settings.theme, settings.fontSize, settings.fontFamily, settings.lineSpacing, settings.justify]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    // Cancel any pending debounced resize so it can't race this rebuild;
    // enqueueRelayout still serializes against one already in flight.
    clearTimeout(resizeTimeoutRef.current);
    enqueueRelayout(relayoutChainRef, rendition, () => {
      rendition.flow(settings.flow === 'scrolled' ? 'scrolled-doc' : 'paginated');
      // Views already on screen keep their old column/scroll CSS after a
      // flow change unless they're torn down and recreated against the new
      // layout.
      if (bookIdRef.current && currentCfiRef.current) {
        rendition.clear();
        rendition.display(currentCfiRef.current);
      }
    });
  }, [settings.flow]);

  const next = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const prev = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const goToHref = useCallback((href: string) => {
    renditionRef.current?.display(href);
  }, []);

  const goToCfi = useCallback((cfi: string) => {
    renditionRef.current?.display(cfi);
  }, []);

  const toggleBookmark = useCallback(() => {
    const bookId = bookIdRef.current;
    const cfi = currentCfiRef.current;
    if (!bookId || !cfi) return;

    setBookmarks((prev) => {
      const existing = prev.find((b) => b.cfi === cfi);
      let next: Bookmark[];
      if (existing) {
        next = prev.filter((b) => b.id !== existing.id);
      } else {
        const bookmark: Bookmark = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          cfi,
          label: currentChapterLabel || 'Bookmark',
          excerpt: '',
          createdAt: Date.now(),
        };
        next = [...prev, bookmark].sort((a, b) => a.createdAt - b.createdAt);
      }
      saveBookmarks(bookId, next);
      return next;
    });
  }, [currentChapterLabel]);

  const removeBookmark = useCallback((id: string) => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    setBookmarks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      saveBookmarks(bookId, next);
      return next;
    });
  }, []);

  const search = useCallback(async (query: string): Promise<SearchResult[]> => {
    const book = bookRef.current;
    const trimmed = query.trim();
    if (!book || !trimmed) return [];

    const sections: Array<{
      href: string;
      load: (req: Function) => Promise<Document>;
      unload: () => void;
      find: (q: string) => FindMatch[];
    }> = [];
    book.spine.each((section: (typeof sections)[number]) => sections.push(section));

    const results = await Promise.all(
      sections.map(async (section) => {
        try {
          await section.load(book.load.bind(book));
          const matches = section.find(trimmed);
          section.unload();
          return matches.map((match) => ({ cfi: match.cfi, excerpt: match.excerpt, href: section.href }));
        } catch {
          return [] as SearchResult[];
        }
      }),
    );

    return results.flat();
  }, []);

  const isCurrentBookmarked = bookmarks.some((b) => b.cfi === currentCfi);

  return {
    containerRef,
    loading,
    error,
    title,
    author,
    toc,
    currentChapterLabel,
    currentHref,
    bookmarks,
    isCurrentBookmarked,
    next,
    prev,
    goToHref,
    goToCfi,
    toggleBookmark,
    removeBookmark,
    search,
  };
}
