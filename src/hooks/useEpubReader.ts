import { useCallback, useEffect, useRef, useState } from 'react';
import ePub from 'epubjs';
import type { Book, Rendition, Location, NavItem } from 'epubjs';
import { applyThemeAndFonts, registerThemes } from '../lib/epubThemes';
import {
  clearOtherBooksData,
  getBookmarks,
  getLocations,
  getProgress,
  saveBookmarks,
  saveLocations,
  saveProgress,
} from '../lib/db';
import { FILE_DRAG_EVENT, isFileDrag } from '../lib/fileDrop';
import { pageKeyAction, type PageKeyAction } from '../lib/keys';
import type { Bookmark, ReaderSettings, SearchResult, ThemeName, TocItem } from '../lib/types';

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
  activeRef: { current: boolean },
  rendition: Rendition,
  action: () => void | Promise<unknown>,
): void {
  chainRef.current = chainRef.current.then(
    () =>
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          activeRef.current = false;
          rendition.off('relocated', finish);
          resolve();
        };
        activeRef.current = true;
        // Registered before running the action, since it may relocate
        // synchronously.
        rendition.on('relocated', finish);
        const result = action();
        if (result) {
          // The action finishes with its own async step (e.g. re-displaying
          // the saved position), so wait for that rather than the first
          // `relocated` along the way.
          rendition.off('relocated', finish);
          result.then(finish, finish);
          setTimeout(finish, 3000);
        } else {
          // Safety net for actions that don't touch the current view (e.g. a
          // resize that epub.js decides is a no-op) and so never relocate.
          setTimeout(finish, 300);
        }
      }),
  );
}

// Resolves on the rendition's next `relocated` event, or after `timeoutMs` if
// none arrives. epub.js emits `relocated` *after* display() resolves, so
// awaiting display() alone isn't enough to know the view has settled.
function nextRelocated(rendition: Rendition, timeoutMs = 300): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      rendition.off('relocated', finish);
      resolve();
    };
    rendition.on('relocated', finish);
    setTimeout(finish, timeoutMs);
  });
}

// Shows `cfi` and waits until epub.js has reported the resulting location.
async function displayAndSettle(rendition: Rendition, cfi: string): Promise<void> {
  const settled = nextRelocated(rendition);
  await rendition.display(cfi).catch(() => {});
  await settled;
}

function runPageAction(book: Book, rendition: Rendition, action: PageKeyAction): void {
  switch (action) {
    case 'next':
      rendition.next();
      return;
    case 'prev':
      rendition.prev();
      return;
    case 'start': {
      const first = book.spine.first();
      if (first) rendition.display(first.href).catch(() => {});
      return;
    }
    case 'end': {
      // The location index knows the book's last position; without it, the
      // start of the last section is the closest available target.
      const target = book.locations.length() ? book.locations.cfiFromPercentage(1) : book.spine.last()?.href;
      if (target) rendition.display(target).catch(() => {});
      return;
    }
  }
}

const SEARCH_BATCH_SIZE = 4;
const EXCERPT_LENGTH = 120;

export interface SearchOptions {
  signal?: AbortSignal;
  /** Called after each batch with the chapters searched so far and the total. */
  onProgress?: (searched: number, total: number) => void;
  /** Called with each batch's new matches, so results can stream in. */
  onResults?: (results: SearchResult[]) => void;
}

// Reads a short run of text starting at `cfi` from the currently displayed
// section, for showing alongside a bookmark.
function getExcerpt(rendition: Rendition, cfi: string): string {
  try {
    const start = rendition.getRange(cfi);
    const doc = start?.startContainer?.ownerDocument;
    if (!start || !doc?.body) return '';
    const range = doc.createRange();
    range.setStart(start.startContainer, start.startOffset);
    range.setEnd(doc.body, doc.body.childNodes.length);
    const text = range.toString().slice(0, EXCERPT_LENGTH * 3).replace(/\s+/g, ' ').trim();
    return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text;
  } catch {
    return '';
  }
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
  /** Fraction of the book read (0-1), or null until the location index is ready. */
  percentage: number | null;
  next: () => void;
  prev: () => void;
  /** Runs a page-turn action: next/prev page, or the start/end of the book. */
  turn: (action: PageKeyAction) => void;
  goToHref: (href: string) => void;
  goToCfi: (cfi: string) => void;
  toggleBookmark: () => void;
  removeBookmark: (id: string) => void;
  search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  /** Deletes bookmarks/progress/locations for every book except this one. Returns how many books were cleared. */
  clearOtherBooks: () => Promise<number>;
}

export function useEpubReader(
  data: ArrayBuffer | null,
  settings: ReaderSettings,
  /** The resolved theme to render (`settings.theme` may be 'auto'). */
  theme: ThemeName,
): EpubReaderApi {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookIdRef = useRef<string>('');
  const currentCfiRef = useRef<string>('');
  // Where the reader actually is, for re-anchoring after a relayout. Unlike
  // currentCfiRef it ignores relocations caused by relayouts themselves: the
  // old page's first line sits partway down a page in the new layout, so
  // anchoring on the new page start would drift back a little every time a
  // panel is toggled or the window resized.
  const anchorCfiRef = useRef<string>('');
  const relayoutActiveRef = useRef(false);
  // Set from the first resize signal until the debounced re-anchor finishes.
  // epub.js reacts to window resizes itself, outside the relayout queue, and
  // those relocations must not overwrite the anchor either.
  const resizePendingRef = useRef(false);
  const resizeGenerationRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const themeRef = useRef(theme);
  themeRef.current = theme;
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
  const [percentage, setPercentage] = useState<number | null>(null);
  const bookmarksRef = useRef<Bookmark[]>([]);
  bookmarksRef.current = bookmarks;

  useEffect(() => {
    if (!data || !containerRef.current) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setToc([]);
    setBookmarks([]);
    setCurrentChapterLabel('');
    setPercentage(null);

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
    applyThemeAndFonts(rendition, settingsRef.current, themeRef.current);

    // Drag events over the book stay inside its iframe. Tell the app when a
    // file is dragged in so it can raise its drop overlay, and stop the
    // browser's default of navigating to a file dropped on the page.
    rendition.hooks.content.register((contents: { document: Document }) => {
      const doc = contents.document;
      if (!doc) return;
      doc.addEventListener('dragenter', (event) => {
        if (isFileDrag(event)) window.dispatchEvent(new Event(FILE_DRAG_EVENT));
      });
      const blockFileDrop = (event: DragEvent) => {
        if (isFileDrag(event)) event.preventDefault();
      };
      doc.addEventListener('dragover', blockFileDrop);
      doc.addEventListener('drop', blockFileDrop);
    });

    const onRelocated = (location: Location) => {
      const cfi = location.start.cfi;
      currentCfiRef.current = cfi;
      if (!relayoutActiveRef.current && !resizePendingRef.current) anchorCfiRef.current = cfi;
      setCurrentCfi(cfi);
      setCurrentHref(location.start.href);
      setCurrentChapterLabel(findChapterLabel(book, location.start.href));
      // Report and persist the anchored position rather than this page's
      // start: the anchor is on screen either way, but it doesn't shift with
      // panel width or font size, so the % stays stable and a reload under a
      // different layout reopens at the same text.
      const position = anchorCfiRef.current || cfi;
      const pct = book.locations.length() ? book.locations.percentageFromCfi(position) : null;
      setPercentage(pct);
      const bid = bookIdRef.current;
      if (bid) {
        saveProgress({ bookId: bid, cfi: position, percentage: pct ?? 0, updatedAt: Date.now() });
      }
    };
    rendition.on('relocated', onRelocated);

    // Keys pressed while focus is inside the book's iframe; ReaderView handles
    // the same keys for the app shell.
    const onKeyUp = (event: KeyboardEvent) => {
      const action = pageKeyAction(event, settingsRef.current.flow);
      if (action) runPageAction(book, rendition, action);
    };
    rendition.on('keyup', onKeyUp);

    // epub.js only re-measures the container when width/height are explicitly
    // `null` (auto-detect); a bare `resize()` call is a no-op for sizing.
    // Must stay a method call (not a detached reference) to keep `this` bound.
    const remeasure = async () => {
      const generation = resizeGenerationRef.current;
      const anchor = anchorCfiRef.current || currentCfiRef.current;
      // epub.js answers a resize with its own asynchronous re-display of the
      // current page start, which drifts backwards (see anchorCfiRef). Let
      // that land, then return to the page containing the anchored position.
      const resized = nextRelocated(rendition);
      (rendition as unknown as { resize: (width: number | null, height: number | null) => void }).resize(
        null,
        null,
      );
      await resized;
      if (anchor && bookIdRef.current) await displayAndSettle(rendition, anchor);
      // Unfreeze the anchor unless another resize arrived meanwhile (its own
      // remeasure is already queued and will do this).
      if (generation === resizeGenerationRef.current) {
        resizePendingRef.current = false;
        if (!anchorCfiRef.current) anchorCfiRef.current = currentCfiRef.current;
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      resizeGenerationRef.current += 1;
      resizePendingRef.current = true;
      clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(
        () => enqueueRelayout(relayoutChainRef, relayoutActiveRef, rendition, remeasure),
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

        // Once the location index exists, back-fill the percentage for the
        // page already on screen (relocated may have fired before it).
        const refreshPercentage = () => {
          const position = anchorCfiRef.current || currentCfiRef.current;
          if (cancelled || !position || !book.locations.length()) return;
          setPercentage(book.locations.percentageFromCfi(position));
        };

        if (storedLocations) {
          book.locations.load(storedLocations);
        } else {
          book.locations
            .generate(1600)
            .then(() => {
              if (cancelled) return;
              saveLocations(bookId, book.locations.save());
              refreshPercentage();
            })
            .catch((err: unknown) => {
              // Percentages just stay unavailable; reading is unaffected.
              if (!cancelled) console.warn('Failed to generate EPUB locations', err);
            });
        }

        await rendition.display(storedProgress?.cfi || undefined);
        if (cancelled) return;
        refreshPercentage();
        setLoading(false);
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
      currentCfiRef.current = '';
      anchorCfiRef.current = '';
      resizePendingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    if (!bookIdRef.current) {
      applyThemeAndFonts(rendition, settings, theme);
      return;
    }
    // Font/size/spacing changes reflow the text, and epub.js keeps the old
    // pixel offset - landing on different text. Queue it like a resize so it
    // can't race one, and return to the anchored position afterwards.
    enqueueRelayout(relayoutChainRef, relayoutActiveRef, rendition, async () => {
      const reflowed = nextRelocated(rendition);
      applyThemeAndFonts(rendition, settings, theme);
      await reflowed;
      const anchor = anchorCfiRef.current;
      if (anchor && bookIdRef.current) await displayAndSettle(rendition, anchor);
    });
  }, [theme, settings.fontSize, settings.fontFamily, settings.lineSpacing, settings.justify]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    // Cancel any pending debounced resize so it can't race this rebuild;
    // enqueueRelayout still serializes against one already in flight.
    clearTimeout(resizeTimeoutRef.current);
    enqueueRelayout(relayoutChainRef, relayoutActiveRef, rendition, async () => {
      rendition.flow(settings.flow === 'scrolled' ? 'scrolled-doc' : 'paginated');
      // Views already on screen keep their old column/scroll CSS after a
      // flow change unless they're torn down and recreated against the new
      // layout.
      const cfi = anchorCfiRef.current || currentCfiRef.current;
      if (bookIdRef.current && cfi) {
        rendition.clear();
        await displayAndSettle(rendition, cfi);
      }
    });
  }, [settings.flow]);

  const turn = useCallback((action: PageKeyAction) => {
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (book && rendition) runPageAction(book, rendition, action);
  }, []);

  const next = useCallback(() => turn('next'), [turn]);
  const prev = useCallback(() => turn('prev'), [turn]);

  const goToHref = useCallback((href: string) => {
    renditionRef.current?.display(href);
  }, []);

  const goToCfi = useCallback((cfi: string) => {
    renditionRef.current?.display(cfi);
  }, []);

  const toggleBookmark = useCallback(() => {
    const bookId = bookIdRef.current;
    const cfi = currentCfiRef.current;
    const rendition = renditionRef.current;
    if (!bookId || !cfi || !rendition) return;

    const isBookmarked = bookmarksRef.current.some((b) => b.cfi === cfi);
    // Read the excerpt outside the state updater so the updater stays pure.
    const excerpt = isBookmarked ? '' : getExcerpt(rendition, cfi);

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
          excerpt,
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

  const search = useCallback(async (query: string, options: SearchOptions = {}): Promise<SearchResult[]> => {
    const { signal, onProgress, onResults } = options;
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

    const searchSection = async (section: (typeof sections)[number]): Promise<SearchResult[]> => {
      try {
        await section.load(book.load.bind(book));
        const matches = section.find(trimmed);
        return matches.map((match) => ({ cfi: match.cfi, excerpt: match.excerpt, href: section.href }));
      } catch {
        // One unreadable chapter shouldn't fail the whole search.
        return [];
      } finally {
        try {
          section.unload();
        } catch {
          // Already unloaded or never loaded.
        }
      }
    };

    // Small batches keep only a few chapter documents in memory at once
    // (loading the whole spine in parallel is heavy on large books) and give
    // natural points to report progress and honour cancellation.
    const all: SearchResult[] = [];
    onProgress?.(0, sections.length);
    for (let i = 0; i < sections.length; i += SEARCH_BATCH_SIZE) {
      if (signal?.aborted || bookRef.current !== book) return all;
      const batch = await Promise.all(sections.slice(i, i + SEARCH_BATCH_SIZE).map(searchSection));
      if (signal?.aborted || bookRef.current !== book) return all;
      const found = batch.flat();
      all.push(...found);
      if (found.length) onResults?.(found);
      onProgress?.(Math.min(i + SEARCH_BATCH_SIZE, sections.length), sections.length);
    }
    return all;
  }, []);

  const clearOtherBooks = useCallback(async () => {
    const bookId = bookIdRef.current;
    if (!bookId) return 0;
    return clearOtherBooksData(bookId);
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
    percentage,
    next,
    prev,
    turn,
    goToHref,
    goToCfi,
    toggleBookmark,
    removeBookmark,
    search,
    clearOtherBooks,
  };
}
