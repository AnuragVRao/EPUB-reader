import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ePub, { EpubCFI } from 'epubjs';
import type { Book, Contents, Rendition, Location, NavItem } from 'epubjs';
import { applyThemeAndFonts, registerCustomTheme, registerThemes } from '../lib/epubThemes';
import { ReadAloudSession, readAloudAvailable, type ReadAloudStatus } from './readAloud';
import {
  clearOtherBooksData,
  deleteBookData,
  exportBackup,
  getBookmarks,
  getLocations,
  getProgress,
  importBackup,
  type ImportSummary,
  listSavedBooks,
  saveBookmarks,
  saveLocations,
  saveProgress,
} from '../lib/db';
import { parseBackup, type BackupFile } from '../lib/backup';
import { FILE_DRAG_EVENT, isFileDrag } from '../lib/fileDrop';
import { pageKeyAction, type PageKeyAction } from '../lib/keys';
import { buildSearchRegex, excerptAround, findMatches, type SearchMatchOptions } from '../lib/search';
import { ReadingSpeed, loadReadingSpeed, minutesToRead, persistReadingSpeed } from '../lib/readingTime';
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

// Removes an epub.js annotation of the given type ('highlight', 'underline').
function eraseAnnotation(rendition: Rendition, cfiRange: string, type: string): void {
  try {
    rendition.annotations.remove(cfiRange, type);
    // epub.js only unlinks the annotation from its per-section index while
    // looping over rendered views. With none on screen the stale entry would
    // make the next render of that section throw, so unlink it here too.
    const index = (rendition.annotations as unknown as { _annotationsBySectionIndex?: Record<string, string[]> })
      ._annotationsBySectionIndex;
    const hash = encodeURI(`${cfiRange}${type}`);
    if (index) {
      for (const key of Object.keys(index)) index[key] = index[key].filter((entry) => entry !== hash);
    }
  } catch (err) {
    console.warn(`Could not remove a ${type} annotation`, err);
  }
}

function eraseHighlight(rendition: Rendition, cfiRange: string): void {
  eraseAnnotation(rendition, cfiRange, 'highlight');
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
      // `length()` is non-zero while the index is still being generated, but
      // until it is done every percentage resolves to the first location.
      const indexed = (book.locations as unknown as { total: number }).total > 0;
      const target = indexed ? book.locations.cfiFromPercentage(1) : book.spine.last()?.href;
      if (target) rendition.display(target).catch(() => {});
      return;
    }
  }
}

const SEARCH_BATCH_SIZE = 4;
const EXCERPT_LENGTH = 120;

// The search match shown on the page. Drawn as an epub.js "underline"
// annotation so it can never collide with (or remove) a "highlight"
// annotation covering the same text.
const SEARCH_MARK_TYPE = 'underline';
const SEARCH_MARK_STYLES = {
  fill: '#f5a623',
  'fill-opacity': '0.35',
  stroke: '#f5a623',
  'stroke-opacity': '0.9',
};

interface SearchableSection {
  href: string;
  document?: Document;
  load: (req: Function) => Promise<unknown>;
  unload: () => void;
  cfiFromRange: (range: Range) => string;
}

// Finds `regex` in each text node of a loaded section. Like epub.js's own
// `section.find`, a match has to sit inside one text node; unlike it, the
// regex carries the case and whole-word options.
function findInSection(section: SearchableSection, regex: RegExp): SearchResult[] {
  const doc = section.document;
  const root = doc?.body ?? doc?.documentElement;
  if (!doc || !root) return [];
  const results: SearchResult[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (const match of findMatches(text, regex)) {
      const range = doc.createRange();
      range.setStart(node, match.start);
      range.setEnd(node, match.start + match.length);
      const excerpt = excerptAround(text, match.start, match.length);
      results.push({
        cfi: section.cfiFromRange(range),
        excerpt: excerpt.text,
        matchStart: excerpt.matchStart,
        matchLength: excerpt.matchLength,
        href: section.href,
      });
    }
  }
  return results;
}

export interface SearchOptions extends SearchMatchOptions {
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

// The start point of `cfi` as a plain CFI. Search matches are range CFIs,
// which can't be compared against a page's start and end directly.
function cfiStart(cfi: string): string {
  const parsed = new EpubCFI(cfi);
  parsed.collapse(true);
  return parsed.toString();
}

// True when `target` (a point CFI) falls on the page(s) described by `location`.
function isOnPage(target: string, location: Location): boolean {
  return isInRange(target, location.start.cfi, location.end.cfi);
}

// True when the point CFI `target` lies between `start` and `end` inclusive.
function isInRange(target: string, start: string, end: string): boolean {
  if (!target || !start || !end) return false;
  try {
    const cfi = new EpubCFI();
    return cfi.compare(target, start) >= 0 && cfi.compare(target, end) <= 0;
  } catch {
    return false;
  }
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
function findActiveTocItem(
  book: Book,
  rendition: Rendition,
  location: Location,
  /** The reader's position: the anchored CFI, which stays put across relayouts, rather than the page start. */
  position: string,
): NavItem | undefined {
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
      if (el && cfi.compare(contents.cfiFromNode(el), position) <= 0) active = item;
    }
    if (active) return active;

    // Above the file's first anchor: still inside whatever entry came before.
    const firstIndex = flat.indexOf(inFile[0]);
    return firstIndex > 0 ? flat[firstIndex - 1] : inFile[0];
  } catch {
    return undefined;
  }
}

/** Estimated reading time remaining, in minutes, at the reader's measured pace. */
export interface TimeLeft {
  /** To the end of the current chapter file. */
  chapter: number;
  /** To the end of the book. */
  book: number;
}

/** Where the page on screen sits within its chapter. */
export interface PageInfo {
  page: number;
  total: number;
}

// How far the reader is from the end of the chapter and of the book, measured
// in entries of the location index. `location` is the reader's own index.
function locationsLeft(book: Book, sectionIndex: number, location: number): { chapter: number; book: number } {
  const total = (book.locations as unknown as { total: number }).total;
  let chapterEnd = total;
  const next = book.spine.get(sectionIndex + 1) as { cfiBase?: string } | null;
  if (next?.cfiBase) {
    // A CFI at the very top of the next section's document: the location
    // index resolves it to that section's first entry.
    const end = book.locations.locationFromCfi(`epubcfi(${next.cfiBase}!/2)`) as unknown as number;
    if (end >= location) chapterEnd = end;
  }
  return { chapter: Math.max(0, chapterEnd - location), book: Math.max(0, total - location) };
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
  /** Estimated reading time left, or null until the location index is ready. */
  timeLeft: TimeLeft | null;
  /** Page number within the chapter, or null when epub.js doesn't report one. */
  pageInfo: PageInfo | null;
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
  /** Goes to a search match and marks it on the page, replacing any earlier mark. */
  showSearchMatch: (cfi: string) => void;
  /** Removes the search mark from the page. */
  clearSearchMatch: () => void;
  /** Deletes bookmarks/progress/locations for every book except this one. Returns how many books were cleared. */
  clearOtherBooks: () => Promise<number>;
  /** Bookmarks, highlights and reading positions for every book, as an export file. */
  exportData: () => Promise<BackupFile>;
  /**
   * Merges a parsed export file into the saved data. Throws with a
   * user-facing message if the value is not an export file.
   */
  importData: (raw: unknown) => Promise<ImportSummary>;
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
  /** The book's declared language (BCP 47 tag), or ''. */
  language: string;
  /** Page progression: 'rtl' turns pages leftwards, so controls are mirrored. */
  direction: 'ltr' | 'rtl';
  /** True for a fixed-layout book, whose pages are left as designed. */
  fixedLayout: boolean;
  readAloud: {
    /** False when the browser has no speech synthesis. */
    available: boolean;
    status: ReadAloudStatus;
    /** Starts reading at the current position. */
    start: () => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
  };
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
  // A position the reader has just asked to go to (a TOC entry, bookmark or
  // search match). It usually lands partway down a page, and it - not the top
  // of that page - is where the reader now is: every `relocated` that shows it
  // adopts it as the anchor, so the chapter label and TOC highlight name the
  // place that was chosen rather than whatever section the page happens to
  // start in. Cleared once the reader moves to a page that doesn't show it.
  const pendingAnchorRef = useRef<string>('');
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
  // CFI of the search match currently marked on the page, if any.
  const searchMarkRef = useRef('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentChapterLabel, setCurrentChapterLabel] = useState('');
  const [currentHref, setCurrentHref] = useState('');
  const [currentTocHref, setCurrentTocHref] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  // The CFIs at the start and end of what is on screen.
  const [currentPage, setCurrentPage] = useState({ start: '', end: '' });
  const [percentage, setPercentage] = useState<number | null>(null);
  const [language, setLanguage] = useState('');
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [fixedLayout, setFixedLayout] = useState(false);
  const fixedLayoutRef = useRef(false);
  const [readAloudStatus, setReadAloudStatus] = useState<ReadAloudStatus>('idle');
  const readAloudRef = useRef<ReadAloudSession | null>(null);
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
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
    setTimeLeft(null);
    setDirection('ltr');
    setFixedLayout(false);
    fixedLayoutRef.current = false;
    setPageInfo(null);

    const speed = new ReadingSpeed(loadReadingSpeed());
    let sectionIndex = 0;
    // Recomputes the time-left estimate for the anchored position. `sample`
    // is false when the position didn't change through reading (a relayout,
    // or the location index only just becoming available).
    const updateTimeLeft = (position: string, sample: boolean) => {
      // `total` stays 0 while the index is still being generated, even though
      // entries are already accumulating.
      const total = (book.locations as unknown as { total: number }).total;
      if (!position || !total) return;
      const location = book.locations.locationFromCfi(position) as unknown as number;
      if (sample) {
        speed.record(location, Date.now());
        if (speed.measured) persistReadingSpeed(speed.charsPerMinute);
      }
      const left = locationsLeft(book, sectionIndex, location);
      setTimeLeft({
        chapter: minutesToRead(left.chapter, speed.charsPerMinute),
        book: minutesToRead(left.book, speed.charsPerMinute),
      });
    };

    const book = ePub(data.slice(0));
    bookRef.current = book;

    const rendition = book.renderTo(containerRef.current, {
      width: '100%',
      height: '100%',
      flow: settingsRef.current.flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
      spread: settingsRef.current.spread === 'single' ? 'none' : 'auto',
    });
    renditionRef.current = rendition;
    const isFixedLayout = () => book.packaging?.metadata?.layout === 'pre-paginated';
    // epub.js reads the spine's page-progression-direction into the metadata
    // but its typings don't declare the field.
    const isRtl = () =>
      (book.packaging?.metadata as unknown as { direction?: string } | undefined)?.direction === 'rtl';
    registerThemes(rendition, () => settingsRef.current, {
      language: () => book.packaging?.metadata?.language ?? '',
      fixedLayout: isFixedLayout,
    });
    // Theme and text settings are applied once the book's metadata is known
    // (below): epub.js applies them to every page it renders afterwards, and
    // a fixed-layout book must not get them at all.

    const readAloud = new ReadAloudSession(rendition, book, {
      language: () => book.packaging?.metadata?.language ?? '',
      rate: () => settingsRef.current.speechRate,
      voiceUri: () => settingsRef.current.speechVoice,
      onStatus: (status) => {
        if (!cancelled) setReadAloudStatus(status);
      },
      erase: (cfiRange, type) => eraseAnnotation(rendition, cfiRange, type),
    });
    readAloudRef.current = readAloud;

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
      const direction = swipeDirection(start, { x: touch.clientX, y: touch.clientY, time: Date.now() }, isRtl());
      if (direction) runPageAction(book, rendition, direction);
    };
    rendition.on('touchstart', onTouchStart);
    rendition.on('touchend', onTouchEnd);

    const onRelocated = (location: Location) => {
      const cfi = location.start.cfi;
      // A footnote popup belongs to the page it was opened on.
      if (cfi !== currentCfiRef.current) setNote(null);
      currentCfiRef.current = cfi;
      const target = pendingAnchorRef.current;
      if (target && isOnPage(target, location)) {
        // An explicit jump wins even mid-relayout. Choosing a bookmark closes
        // its panel, which resizes the container: if the anchor stayed frozen
        // on the old position, the resize would re-anchor there and undo the
        // jump. The target stays in force while it is on screen: epub.js
        // reports the same page more than once after a jump, and only a move
        // to a page without it (a page turn, a scroll) ends it.
        anchorCfiRef.current = target;
      } else if (!relayoutActiveRef.current && !resizePendingRef.current) {
        anchorCfiRef.current = cfi;
        pendingAnchorRef.current = '';
      }
      setCurrentPage({ start: cfi, end: location.end.cfi });
      readAloud.onRelocated(location, relayoutActiveRef.current || resizePendingRef.current);
      setCurrentHref(location.start.href);
      // Report and persist the anchored position rather than this page's
      // start: the anchor is on screen either way, but it doesn't shift with
      // panel width or font size, so the %, the chapter label and the TOC
      // highlight stay stable and a reload under a different layout reopens
      // at the same text.
      const position = anchorCfiRef.current || cfi;
      const tocItem = findActiveTocItem(book, rendition, location, position);
      setCurrentTocHref(tocItem?.href ?? '');
      setCurrentChapterLabel(tocItem?.label.trim() || findChapterLabel(book, location.start.href));
      const pct = book.locations.length() ? book.locations.percentageFromCfi(position) : null;
      setPercentage(pct);
      sectionIndex = location.start.index;
      updateTimeLeft(position, !relayoutActiveRef.current && !resizePendingRef.current);
      const displayed = location.start.displayed;
      setPageInfo(displayed?.total ? { page: displayed.page, total: displayed.total } : null);
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
      const action = pageKeyAction(event, settingsRef.current.flow, isRtl());
      if (action) runPageAction(book, rendition, action);
    };
    rendition.on('keyup', onKeyUp);

    // epub.js only re-measures the container when width/height are explicitly
    // `null` (auto-detect); a bare `resize()` call is a no-op for sizing.
    // Must stay a method call (not a detached reference) to keep `this` bound.
    const remeasure = async () => {
      const generation = resizeGenerationRef.current;
      // epub.js answers a resize with its own asynchronous re-display of the
      // current page start, which drifts backwards (see anchorCfiRef). Let
      // that land, then return to the page containing the anchored position.
      const resized = nextRelocated(rendition);
      (rendition as unknown as { resize: (width: number | null, height: number | null) => void }).resize(
        null,
        null,
      );
      await resized;
      // Read only now: a jump made while the resize was pending may have
      // moved the anchor, or be about to (its target is still pending).
      const anchor = pendingAnchorRef.current || anchorCfiRef.current || currentCfiRef.current;
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
        setLanguage(metadata.language || '');
        setDirection(isRtl() ? 'rtl' : 'ltr');
        setFixedLayout(isFixedLayout());
        fixedLayoutRef.current = isFixedLayout();
        applyThemeAndFonts(rendition, settingsRef.current, themeRef.current, fixedLayoutRef.current);
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
          updateTimeLeft(position, false);
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
      readAloud.stop();
      readAloudRef.current = null;
      rendition.destroy();
      book.destroy();
      bookRef.current = null;
      renditionRef.current = null;
      bookIdRef.current = '';
      currentCfiRef.current = '';
      anchorCfiRef.current = '';
      pendingAnchorRef.current = '';
      searchMarkRef.current = '';
      resizePendingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    // Until the book is ready, the opening code applies the current settings
    // itself (it reads them through refs).
    if (!bookIdRef.current || fixedLayoutRef.current) return;
    // Font/size/spacing changes reflow the text, and epub.js keeps the old
    // pixel offset - landing on different text. Queue it like a resize so it
    // can't race one, and return to the anchored position afterwards.
    enqueueRelayout(relayoutChainRef, relayoutActiveRef, rendition, async () => {
      const reflowed = nextRelocated(rendition);
      applyThemeAndFonts(rendition, settings, theme, fixedLayoutRef.current);
      await reflowed;
      const anchor = anchorCfiRef.current;
      if (anchor && bookIdRef.current) await displayAndSettle(rendition, anchor);
    });
  }, [
    theme,
    settings.fontSize,
    settings.fontFamily,
    settings.lineSpacing,
    settings.justify,
    settings.paragraphSpacing,
    settings.hyphenate,
  ]);

  // Changing the custom colours only recolours the page - no reflow, so no
  // relayout. (Switching to or from the custom theme goes through the effect
  // above like any other theme change.)
  const { background, text, accent } = settings.customColors;
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || themeRef.current !== 'custom' || fixedLayoutRef.current) return;
    registerCustomTheme(rendition, { background, text, accent });
    rendition.themes.select('custom');
  }, [background, text, accent]);

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

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    clearTimeout(resizeTimeoutRef.current);
    enqueueRelayout(relayoutChainRef, relayoutActiveRef, rendition, async () => {
      rendition.spread(settings.spread === 'single' ? 'none' : 'auto');
      // As with a flow change, views on screen keep the old column layout
      // until they are recreated.
      const cfi = anchorCfiRef.current || currentCfiRef.current;
      if (bookIdRef.current && cfi) {
        rendition.clear();
        await displayAndSettle(rendition, cfi);
      }
    });
  }, [settings.spread]);

  const turn = useCallback((action: PageKeyAction) => {
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (book && rendition) runPageAction(book, rendition, action);
  }, []);

  const next = useCallback(() => turn('next'), [turn]);
  const prev = useCallback(() => turn('prev'), [turn]);

  // Shows `target` (an href or CFI) and records where exactly the reader asked
  // to be. epub.js reports the new location a frame after display() resolves,
  // so the pending anchor set here is in place by the time `relocated` fires.
  //
  // The `relocated` events of the jump itself can arrive before or after
  // display() resolves, and choosing a bookmark or search result usually
  // closes a panel at the same moment, starting a resize. So a target known up
  // front (a CFI) is recorded before displaying, and once the jump has landed
  // the location is reported again: the anchor is then adopted however those
  // events were ordered, instead of a resize re-anchoring on the old page.
  const displayTarget = useCallback(
    (target: string, resolveAnchor: (rendition: Rendition) => string, knownAnchor = '') => {
      const rendition = renditionRef.current;
      if (!rendition) return Promise.resolve();
      pendingAnchorRef.current = knownAnchor;
      return rendition.display(target).then(() => {
        if (renditionRef.current !== rendition) return;
        try {
          pendingAnchorRef.current = knownAnchor || resolveAnchor(rendition);
        } catch {
          pendingAnchorRef.current = '';
        }
        if (pendingAnchorRef.current) (rendition as unknown as { reportLocation: () => void }).reportLocation();
      });
    },
    [],
  );

  const goToHref = useCallback(
    (href: string) => {
      displayTarget(href, (rendition) => {
        const id = href.split('#')[1];
        if (!id) return '';
        // The element the link points at, in whichever chapter document is on screen.
        for (const contents of rendition.getContents() as unknown as Contents[]) {
          const el = contents.document?.getElementById(id) ?? contents.document?.getElementById(decodeURIComponent(id));
          if (el) return contents.cfiFromNode(el);
        }
        return '';
      }).catch(() => {});
    },
    [displayTarget],
  );

  const goToCfi = useCallback(
    (cfi: string) => {
      displayTarget(cfi, () => '', cfiStart(cfi)).catch(() => {});
    },
    [displayTarget],
  );

  // Toggles the bookmark for the page on screen. A new bookmark marks the
  // reader's anchored position - the place the chapter label names, which
  // after a jump can be partway down the page - so returning to it lands on
  // the same text. Any bookmark that falls on the visible page counts as this
  // page's, including ones saved at a page start by earlier versions.
  const toggleBookmark = useCallback(() => {
    const bookId = bookIdRef.current;
    const cfi = anchorCfiRef.current || currentCfiRef.current;
    const rendition = renditionRef.current;
    if (!bookId || !cfi || !rendition) return;
    const { start, end } = currentPage;
    const onPage = (b: Bookmark) => b.cfi === cfi || isInRange(b.cfi, start, end);

    const isBookmarked = bookmarksRef.current.some(onPage);
    // Read the excerpt outside the state updater so the updater stays pure.
    const excerpt = isBookmarked ? '' : getExcerpt(rendition, cfi);

    setBookmarks((prev) => {
      let next: Bookmark[];
      if (prev.some(onPage)) {
        next = prev.filter((b) => !onPage(b));
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
  }, [currentChapterLabel, currentPage]);

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
    const regex = buildSearchRegex(trimmed, options);

    const sections: SearchableSection[] = [];
    book.spine.each((section: SearchableSection) => sections.push(section));

    const searchSection = async (section: SearchableSection): Promise<SearchResult[]> => {
      try {
        await section.load(book.load.bind(book));
        return findInSection(section, regex);
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

  const clearSearchMatch = useCallback(() => {
    const cfi = searchMarkRef.current;
    searchMarkRef.current = '';
    const rendition = renditionRef.current;
    if (cfi && rendition) eraseAnnotation(rendition, cfi, SEARCH_MARK_TYPE);
  }, []);

  const showSearchMatch = useCallback(
    (cfi: string) => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      clearSearchMatch();
      searchMarkRef.current = cfi;
      displayTarget(cfi, () => '', cfiStart(cfi))
        .then(() => {
          // Skip if the book closed or another match was chosen meanwhile.
          if (renditionRef.current !== rendition || searchMarkRef.current !== cfi) return;
          rendition.annotations.add(SEARCH_MARK_TYPE, cfi, {}, undefined, 'search-match', SEARCH_MARK_STYLES);
        })
        .catch(() => {});
    },
    [clearSearchMatch, displayTarget],
  );

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

  const importData = useCallback(async (raw: unknown): Promise<ImportSummary> => {
    const summary = await importBackup(parseBackup(raw));
    // The open book's bookmarks and highlights are held in state; pick up any
    // that arrived, and draw the new highlights on the page.
    const bookId = bookIdRef.current;
    if (bookId) {
      const [storedBookmarks, storedHighlights] = await Promise.all([getBookmarks(bookId), getHighlights(bookId)]);
      if (bookIdRef.current === bookId) {
        setBookmarks(storedBookmarks);
        const rendition = renditionRef.current;
        const known = new Set(highlightsRef.current.map((h) => h.cfiRange));
        if (rendition) {
          for (const highlight of storedHighlights) {
            if (!known.has(highlight.cfiRange)) drawHighlight(rendition, highlight, onHighlightClick);
          }
        }
        highlightsRef.current = storedHighlights;
        setHighlights(storedHighlights);
      }
    }
    return summary;
  }, [onHighlightClick]);

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

  const readAloud = useMemo(
    () => ({
      available: readAloudAvailable(),
      status: readAloudStatus,
      start: () => void readAloudRef.current?.start(anchorCfiRef.current || currentCfiRef.current),
      pause: () => readAloudRef.current?.pause(),
      resume: () => void readAloudRef.current?.resume(),
      stop: () => readAloudRef.current?.stop(),
    }),
    [readAloudStatus],
  );

  const isCurrentBookmarked = bookmarks.some((b) => isInRange(b.cfi, currentPage.start, currentPage.end));

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
    timeLeft,
    pageInfo,
    next,
    prev,
    turn,
    goToHref,
    goToCfi,
    toggleBookmark,
    removeBookmark,
    updateBookmark,
    search,
    showSearchMatch,
    clearSearchMatch,
    clearOtherBooks,
    exportData: exportBackup,
    importData,
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
    language,
    direction,
    fixedLayout,
    readAloud,
  };
}
