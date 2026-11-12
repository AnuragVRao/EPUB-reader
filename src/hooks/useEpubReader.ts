import { useCallback, useEffect, useRef, useState } from 'react';
import ePub, { EpubCFI } from 'epubjs';
import type { Book, Contents, Rendition, Location, NavItem } from 'epubjs';
import { applyThemeAndFonts, registerThemes } from '../lib/epubThemes';
import {
  clearOtherBooksData,
  deleteBookData,
  getBookmarks,
  getLocations,
  getProgress,
  listSavedBooks,
  saveBookmarks,
  saveLocations,
  saveProgress,
} from '../lib/db';
import { FILE_DRAG_EVENT, isFileDrag } from '../lib/fileDrop';
import { pageKeyAction, type PageKeyAction } from '../lib/keys';
import type { Bookmark, ReaderSettings, SavedBookInfo, SearchResult, ThemeName, TocItem } from '../lib/types';
import { addBookToLibrary } from '../lib/db';
import { prepareCover } from '../lib/cover';
import { getHighlights, saveHighlights } from '../lib/db';
import type { Highlight, TextSelection } from '../lib/types';
import { swipeDirection, type TouchPoint } from '../lib/swipe';
import { extractNoteText, findNoteElement, noteLinkKind } from '../lib/footnotes';
import { markZoomableImages, zoomableImage, type BookImage } from '../lib/bookImages';

// Puts the open book on the shelf (or marks it as just opened) so it can be
// reopened from the start screen without the file.
async function shelveBook(book: Book, bookId: string, data: ArrayBuffer, filename: string): Promise<void> {
  try {
    const { title = '', creator = '' } = book.packaging?.metadata ?? {};
    let cover: Blob | undefined;
    try {
      await book.loaded.cover;
      // `book.cover` is the cover's path inside the archive. Reading it from
      // the archive avoids fetching the blob URL that coverUrl() would make.
      const source = book as unknown as {
        cover?: string;
        archive?: { getBlob: (url: string) => Promise<Blob> | undefined };
      };
      if (source.cover && source.archive) cover = await source.archive.getBlob(source.cover);
    } catch {
      // No readable cover (or the book was closed meanwhile): shelve without.
    }
    await addBookToLibrary({
      bookId,
      filename,
      data,
      title,
      author: creator,
      cover: cover ? await prepareCover(cover) : undefined,
    });
  } catch (err) {
    // Storage full or unavailable. The book stays readable; it just won't be
    // on the shelf.
    console.warn('Could not add the book to the library', err);
  }
}

// Highlights are drawn by epub.js's annotation layer: an SVG laid over each
// section's iframe, in the app document (so App.css styles it, not the book
// themes). The layer redraws them itself whenever a section is re-rendered.
const HIGHLIGHT_CLASS = 'reader-hl';
const HIGHLIGHT_TEXT_LENGTH = 500;

function drawHighlight(rendition: Rendition, highlight: Highlight, onClick: (id: string) => void): void {
  try {
    rendition.annotations.highlight(highlight.cfiRange, { id: highlight.id }, () => onClick(highlight.id), HIGHLIGHT_CLASS);
  } catch (err) {
    console.warn('Could not draw a highlight', err);
  }
}

function eraseHighlight(rendition: Rendition, cfiRange: string): void {
  try {
    rendition.annotations.remove(cfiRange, 'highlight');
    // epub.js only unlinks the annotation from its per-section index while
    // looping over rendered views. With none on screen the stale entry would
    // make the next render of that section throw, so unlink it here too.
    const index = (rendition.annotations as unknown as { _annotationsBySectionIndex?: Record<string, string[]> })
      ._annotationsBySectionIndex;
    const hash = encodeURI(`${cfiRange}highlight`);
    if (index) {
      for (const key of Object.keys(index)) index[key] = index[key].filter((entry) => entry !== hash);
    }
  } catch (err) {
    console.warn('Could not remove a highlight', err);
  }
}

/** A footnote shown in place: its text, and where the link would have gone. */
export interface BookNote {
  text: string;
  /** Pass to `goToHref` to visit the note where it sits in the book. */
  target: string;
}

interface NoteSection {
  index: number;
  url: string;
  document?: Document;
  load: (request: Function) => Promise<unknown>;
  unload: () => void;
}

// Works out where a footnote link points and, if the target reads as a note,
// its text. `target` is always the place epub.js itself would have navigated
// to, so the caller can fall back to plain navigation.
async function resolveNote(
  book: Book,
  contents: Contents,
  href: string,
  marked: boolean,
): Promise<{ target: string; text: string | null }> {
  let target = href;
  try {
    const current = book.spine.get(contents.sectionIndex) as unknown as NoteSection;
    // Same resolution epub.js applies to links: against the section's own
    // path, then made relative to the package document.
    const url = new URL(href, new URL(current.url, 'http://book.invalid/'));
    const path = (book.path as unknown as { relative: (to: string) => string }).relative(
      decodeURIComponent(url.pathname),
    );
    target = `${path}${url.hash}`;
    const id = decodeURIComponent(url.hash.slice(1));
    const section = book.spine.get(path) as unknown as NoteSection | null;
    if (!section || !id) return { target, text: null };

    if (section.index === current.index) {
      const element = findNoteElement(contents.document, id);
      return { target, text: element ? extractNoteText(element, marked) : null };
    }
    // Notes collected in another file: read it without displaying it.
    await section.load(book.load.bind(book));
    try {
      const element = section.document ? findNoteElement(section.document, id) : null;
      return { target, text: element ? extractNoteText(element, marked) : null };
    } finally {
      section.unload();
    }
  } catch {
    return { target, text: null };
  }
}

function hasTextSelection(rendition: Rendition): boolean {
  try {
    return (rendition.getContents() as unknown as Contents[]).some((contents) => {
      const selection = contents.window?.getSelection();
      return Boolean(selection && !selection.isCollapsed);
    });
  } catch {
    return false;
  }
}

function clearTextSelection(rendition: Rendition): void {
  try {
    for (const contents of rendition.getContents() as unknown as Contents[]) {
      contents.window?.getSelection()?.removeAllRanges();
    }
  } catch {
    // Views are mid-rebuild; there is no selection to clear.
  }
}

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

function flattenToc(items: NavItem[], out: NavItem[] = []): NavItem[] {
  for (const item of items) {
    out.push(item);
    if (item.subitems?.length) flattenToc(item.subitems, out);
  }
  return out;
}

// Finds the TOC entry the reader is currently inside. Several entries can
// point into one chapter file (`ch1.xhtml#a`, `ch1.xhtml#b`), so matching on
// the file alone isn't enough: the entry is the last one whose anchor sits at
// or before the top of the page. Returns undefined when the TOC has nothing
// for this file or the lookup fails, and callers fall back to file matching.
function findActiveTocItem(book: Book, rendition: Rendition, location: Location): NavItem | undefined {
  try {
    const file = location.start.href.split('#')[0];
    const flat = flattenToc(book.navigation.toc);
    const inFile = flat.filter((item) => item.href && item.href.split('#')[0] === file);
    if (inFile.length <= 1) return inFile[0];

    const contents = (rendition.getContents() as unknown as Contents[]).find(
      (c) => c.sectionIndex === location.start.index,
    );
    if (!contents?.document) return undefined;

    const cfi = new EpubCFI();
    let active: NavItem | undefined;
    for (const item of inFile) {
      const anchor = item.href.split('#')[1];
      if (!anchor) {
        // No anchor: the entry starts with the file.
        active = item;
        continue;
      }
      const el =
        contents.document.getElementById(anchor) ?? contents.document.getElementById(decodeURIComponent(anchor));
      if (el && cfi.compare(contents.cfiFromNode(el), location.start.cfi) <= 0) active = item;
    }
    if (active) return active;

    // Above the file's first anchor: still inside whatever entry came before.
    const firstIndex = flat.indexOf(inFile[0]);
    return firstIndex > 0 ? flat[firstIndex - 1] : inFile[0];
  } catch {
    return undefined;
  }
}

export interface SavedBook extends SavedBookInfo {
  /** True for the book currently open in the reader. */
  current: boolean;
}

export type BookmarkPatch = Partial<Pick<Bookmark, 'label' | 'note'>>;

export interface EpubReaderApi {
  containerRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  error: string | null;
  title: string;
  author: string;
  toc: TocItem[];
  currentChapterLabel: string;
  currentHref: string;
  /** Href of the TOC entry the reader is inside, or '' when it can't be told apart from its siblings. */
  currentTocHref: string;
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
  /** Renames a bookmark and/or sets its note. An empty note removes it. */
  updateBookmark: (id: string, patch: BookmarkPatch) => void;
  search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  /** Deletes bookmarks/progress/locations for every book except this one. Returns how many books were cleared. */
  clearOtherBooks: () => Promise<number>;
  /** Lists every book with saved data, flagging the one that is open. */
  listSavedBooks: () => Promise<SavedBook[]>;
  /** Deletes one other book's bookmarks/progress/locations. The open book is refused. */
  removeSavedBook: (bookId: string) => Promise<void>;
  highlights: Highlight[];
  /** Text selected in the book right now, or null. */
  selection: TextSelection | null;
  /** The highlight last clicked on the page; `seq` changes with every click. */
  clickedHighlight: { id: string; seq: number } | null;
  /** Highlights `selection`, optionally with a note, and clears the selection. */
  addHighlight: (selection: TextSelection, note?: string) => void;
  removeHighlight: (id: string) => void;
  /** Sets a highlight's note. An empty note removes it. */
  updateHighlightNote: (id: string, note: string) => void;
  /** Drops the current text selection without highlighting it. */
  clearSelection: () => void;
  /** The footnote whose reference was just clicked, or null. */
  note: BookNote | null;
  dismissNote: () => void;
  /** The illustration that was just clicked, to show full size, or null. */
  zoomedImage: BookImage | null;
  dismissZoom: () => void;
}

export function useEpubReader(
  data: ArrayBuffer | null,
  settings: ReaderSettings,
  /** The resolved theme to render (`settings.theme` may be 'auto'). */
  theme: ThemeName,
  /** Name of the file `data` came from, recorded with the book on the shelf. */
  filename: string = '',
): EpubReaderApi {
  const filenameRef = useRef(filename);
  filenameRef.current = filename;
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
  const [currentTocHref, setCurrentTocHref] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [currentCfi, setCurrentCfi] = useState('');
  const [percentage, setPercentage] = useState<number | null>(null);
  const bookmarksRef = useRef<Bookmark[]>([]);
  bookmarksRef.current = bookmarks;
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const highlightsRef = useRef<Highlight[]>([]);
  highlightsRef.current = highlights;
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [clickedHighlight, setClickedHighlight] = useState<{ id: string; seq: number } | null>(null);
  const [note, setNote] = useState<BookNote | null>(null);
  const [zoomedImage, setZoomedImage] = useState<BookImage | null>(null);
  // Stable for the life of the hook: epub.js keeps the callback for as long
  // as the highlight exists.
  const onHighlightClick = useCallback((id: string) => {
    const rendition = renditionRef.current;
    // A click that ends a drag-selection over a highlight is a selection,
    // not a request to open the highlight.
    if (rendition && hasTextSelection(rendition)) return;
    setClickedHighlight((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!data || !containerRef.current) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setToc([]);
    setBookmarks([]);
    setCurrentChapterLabel('');
    setCurrentTocHref('');
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

    setHighlights([]);
    setSelection(null);
    setClickedHighlight(null);

    // epub.js reports a finished text selection (debounced) as a CFI range.
    const onSelected = (cfiRange: string, contents: Contents) => {
      const text = contents.window?.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '';
      if (!text) return;
      setSelection({
        cfiRange,
        text: text.length > HIGHLIGHT_TEXT_LENGTH ? `${text.slice(0, HIGHLIGHT_TEXT_LENGTH).trimEnd()}…` : text,
      });
    };
    rendition.on('selected', onSelected);
    // It never reports the selection going away, so watch for that directly.
    rendition.hooks.content.register((contents: Contents) => {
      const doc = contents.document;
      if (!doc) return;
      doc.addEventListener('selectionchange', () => {
        const current = doc.getSelection();
        if (!current || current.isCollapsed) setSelection(null);
      });
    });

    setNote(null);
    setZoomedImage(null);

    // Clicks on footnote references show the note in place of following the
    // link. Listening in the capture phase gets in ahead of the handler
    // epub.js puts on every link, which would navigate.
    const openNote = async (contents: Contents, href: string, marked: boolean) => {
      const { target, text } = await resolveNote(book, contents, href, marked);
      if (cancelled) return;
      if (text) setNote({ text, target });
      // Not a note after all: do what the link would have done.
      else rendition.display(target).catch(() => {});
    };
    rendition.hooks.content.register((contents: Contents) => {
      const doc = contents.document;
      if (!doc) return;
      markZoomableImages(doc);
      doc.addEventListener(
        'click',
        (event) => {
          const element = event.target as Element | null;
          if (!element?.closest) return;
          const link = element.closest('a[href]');
          if (!link) {
            // Not a link: an illustration opens full size instead.
            const image = zoomableImage(element);
            if (image && !hasTextSelection(rendition)) setZoomedImage(image);
            return;
          }
          const kind = noteLinkKind(link);
          if (!kind) return;
          event.preventDefault();
          event.stopPropagation();
          void openNote(contents, link.getAttribute('href') ?? '', kind === 'marked');
        },
        true,
      );
    });

    // Swipes land inside the book's iframe, so they are picked up through
    // epub.js's relayed touch events, the same way keys are below.
    let touchStart: TouchPoint | null = null;
    const onTouchStart = (event: TouchEvent) => {
      // A second finger means a pinch, not a swipe.
      const touch = event.touches.length === 1 ? event.touches[0] : null;
      touchStart = touch ? { x: touch.clientX, y: touch.clientY, time: Date.now() } : null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const start = touchStart;
      touchStart = null;
      const touch = event.changedTouches[0];
      // Scrolled mode uses horizontal drags for nothing, but a stray one
      // jumping a whole chapter would be worse than doing nothing.
      if (!start || !touch || settingsRef.current.flow !== 'paginated') return;
      // Dragging a selection handle is not a page turn.
      if (hasTextSelection(rendition)) return;
      const direction = swipeDirection(start, { x: touch.clientX, y: touch.clientY, time: Date.now() });
      if (direction) runPageAction(book, rendition, direction);
    };
    rendition.on('touchstart', onTouchStart);
    rendition.on('touchend', onTouchEnd);

    const onRelocated = (location: Location) => {
      const cfi = location.start.cfi;
      // A footnote popup belongs to the page it was opened on.
      if (cfi !== currentCfiRef.current) setNote(null);
      currentCfiRef.current = cfi;
      if (!relayoutActiveRef.current && !resizePendingRef.current) anchorCfiRef.current = cfi;
      setCurrentCfi(cfi);
      setCurrentHref(location.start.href);
      const tocItem = findActiveTocItem(book, rendition, location);
      setCurrentTocHref(tocItem?.href ?? '');
      setCurrentChapterLabel(tocItem?.label.trim() || findChapterLabel(book, location.start.href));
      // Report and persist the anchored position rather than this page's
      // start: the anchor is on screen either way, but it doesn't shift with
      // panel width or font size, so the % stays stable and a reload under a
      // different layout reopens at the same text.
      const position = anchorCfiRef.current || cfi;
      const pct = book.locations.length() ? book.locations.percentageFromCfi(position) : null;
      setPercentage(pct);
      const bid = bookIdRef.current;
      if (bid) {
        saveProgress({
          bookId: bid,
          cfi: position,
          percentage: pct ?? 0,
          updatedAt: Date.now(),
          title: book.packaging?.metadata?.title || undefined,
        });
      }
    };
    rendition.on('relocated', onRelocated);

    // Keys pressed while focus is inside the book's iframe; ReaderView handles
    // the same keys for the app shell.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNote(null);
        setZoomedImage(null);
      }
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
        getHighlights(bookId)
          .then((stored) => {
            if (cancelled) return;
            setHighlights(stored);
            for (const highlight of stored) drawHighlight(rendition, highlight, onHighlightClick);
          })
          .catch((err: unknown) => console.warn('Could not load highlights', err));

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
        // Only once a page has rendered, so a broken EPUB never reaches the shelf.
        void shelveBook(book, bookId, data, filenameRef.current);
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
      rendition.off('selected', onSelected);
      rendition.off('touchstart', onTouchStart);
      rendition.off('touchend', onTouchEnd);
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

  const updateBookmark = useCallback((id: string, patch: BookmarkPatch) => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    setBookmarks((prev) => {
      const next = prev.map((b) => {
        if (b.id !== id) return b;
        const updated: Bookmark = { ...b };
        // An emptied label would leave nothing to click on; keep the old one.
        if (patch.label?.trim()) updated.label = patch.label.trim();
        if (patch.note !== undefined) {
          const note = patch.note.trim();
          if (note) updated.note = note;
          else delete updated.note;
        }
        return updated;
      });
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

  const listSaved = useCallback(async (): Promise<SavedBook[]> => {
    const books = await listSavedBooks();
    return books.map((book) => ({ ...book, current: book.bookId === bookIdRef.current }));
  }, []);

  const removeSavedBook = useCallback(async (bookId: string) => {
    // The open book keeps writing its position; deleting it here would only
    // have it reappear on the next page turn.
    if (!bookId || bookId === bookIdRef.current) return;
    await deleteBookData(bookId);
  }, []);

  const clearSelection = useCallback(() => {
    const rendition = renditionRef.current;
    if (rendition) clearTextSelection(rendition);
    setSelection(null);
  }, []);

  const addHighlight = useCallback(
    (target: TextSelection, note?: string) => {
      const bookId = bookIdRef.current;
      const rendition = renditionRef.current;
      if (!bookId || !rendition || !target.cfiRange) return;
      const trimmedNote = note?.trim();
      const existing = highlightsRef.current.find((h) => h.cfiRange === target.cfiRange);
      let next: Highlight[];
      if (existing) {
        // Same passage again: nothing new to draw, but a note can be added.
        next = trimmedNote
          ? highlightsRef.current.map((h) => (h.id === existing.id ? { ...h, note: trimmedNote } : h))
          : highlightsRef.current;
      } else {
        const highlight: Highlight = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          cfiRange: target.cfiRange,
          text: target.text,
          createdAt: Date.now(),
        };
        if (trimmedNote) highlight.note = trimmedNote;
        drawHighlight(rendition, highlight, onHighlightClick);
        next = [...highlightsRef.current, highlight];
      }
      highlightsRef.current = next;
      setHighlights(next);
      saveHighlights(bookId, next);
      clearSelection();
    },
    [clearSelection, onHighlightClick],
  );

  const removeHighlight = useCallback((id: string) => {
    const bookId = bookIdRef.current;
    const rendition = renditionRef.current;
    const target = highlightsRef.current.find((h) => h.id === id);
    if (!bookId || !target) return;
    if (rendition) eraseHighlight(rendition, target.cfiRange);
    const next = highlightsRef.current.filter((h) => h.id !== id);
    highlightsRef.current = next;
    setHighlights(next);
    saveHighlights(bookId, next);
  }, []);

  const updateHighlightNote = useCallback((id: string, note: string) => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    const trimmed = note.trim();
    const next = highlightsRef.current.map((h) => {
      if (h.id !== id) return h;
      const updated: Highlight = { ...h };
      if (trimmed) updated.note = trimmed;
      else delete updated.note;
      return updated;
    });
    highlightsRef.current = next;
    setHighlights(next);
    saveHighlights(bookId, next);
  }, []);

  const dismissNote = useCallback(() => setNote(null), []);
  const dismissZoom = useCallback(() => setZoomedImage(null), []);

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
    currentTocHref,
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
    updateBookmark,
    search,
    clearOtherBooks,
    listSavedBooks: listSaved,
    removeSavedBook,
    highlights,
    selection,
    clickedHighlight,
    addHighlight,
    removeHighlight,
    updateHighlightNote,
    clearSelection,
    note,
    dismissNote,
    zoomedImage,
    dismissZoom,
  };
}
