import type { CustomColors } from './customTheme';

/** 'custom' is drawn from the reader's own colours (`ReaderSettings.customColors`). */
export type ThemeName = 'light' | 'dark' | 'sepia' | 'custom';
/** What the user picked: a fixed theme, or 'auto' to follow the OS light/dark preference. */
export type ThemeSetting = ThemeName | 'auto';
export type FontFamily = 'system' | 'serif' | 'sans' | 'dyslexic';
export type FlowMode = 'paginated' | 'scrolled';
/** 'auto' shows two pages side by side when the window is wide enough; 'single' never does. */
export type SpreadMode = 'auto' | 'single';

export interface ReaderSettings {
  theme: ThemeSetting;
  fontSize: number; // percentage, e.g. 100
  fontFamily: FontFamily;
  flow: FlowMode;
  lineSpacing: number; // multiplier, e.g. 1.4
  justify: boolean;
  /** Gap between paragraphs in em, or null to keep the book's own spacing. */
  paragraphSpacing: number | null;
  hyphenate: boolean;
  /** Blank space on each side of the page, as a percentage of the reading area's width. */
  pageMargin: number;
  spread: SpreadMode;
  /** Colours for the 'custom' theme; kept when another theme is chosen. */
  customColors: CustomColors;
  /** Read-aloud speed; 1 is the voice's normal rate. */
  speechRate: number;
  /** `voiceURI` of the chosen read-aloud voice, or '' to match the book's language. */
  speechVoice: string;
  /** Opt-in: look words up on Wiktionary, which sends the word over the network. */
  dictionaryEnabled: boolean;
  tocOpen: boolean;
  tocWidth: number;
}

export interface StoredBook {
  filename: string;
  data: ArrayBuffer;
  savedAt: number;
}

export interface Bookmark {
  id: string;
  cfi: string;
  label: string;
  excerpt: string;
  /** Free-text note added by the reader. Absent on bookmarks without one. */
  note?: string;
  createdAt: number;
}

export interface Progress {
  bookId: string;
  cfi: string;
  percentage: number;
  updatedAt: number;
  /** The book's title, so its saved data can be named without the file. Absent on records from older versions. */
  title?: string;
}

/** What is stored for one book, summarised across the per-book stores. */
export interface SavedBookInfo {
  bookId: string;
  title?: string;
  bookmarkCount: number;
  /** Fraction read (0-1), or null when no reading position is stored. */
  percentage: number | null;
  /** When the reading position was last saved, or null when none is stored. */
  updatedAt: number | null;
  hasLocations: boolean;
}

export interface StoredLocations {
  bookId: string;
  locations: string;
}

export interface TocItem {
  id: string;
  label: string;
  href: string;
  subitems?: TocItem[];
}

export interface SearchResult {
  cfi: string;
  excerpt: string;
  /** Where the matched text sits inside `excerpt`. */
  matchStart: number;
  matchLength: number;
  href: string;
}

/** Stands in for the book file in `currentBook` once the book is on the shelf. */
export interface CurrentBookPointer {
  bookId: string;
}

/** A book kept on the shelf. The file itself is stored separately, under the same key. */
export interface LibraryBook {
  /** epub.js's `book.key()`, the same key the per-book stores use. */
  bookId: string;
  filename: string;
  title: string;
  author: string;
  /** A small copy of the cover image, when the book has one. */
  cover?: { data: ArrayBuffer; type: string };
  /** Size of the stored file in bytes. */
  size: number;
  addedAt: number;
  lastOpenedAt: number;
}

/** A shelf entry together with how far the book has been read. */
export interface LibraryEntry extends LibraryBook {
  /** Fraction read (0-1), or null when no reading position is stored. */
  percentage: number | null;
}

/** How much the shelf may hold before the least recently opened books are dropped. */
export interface LibraryLimits {
  maxBooks: number;
  maxBytes: number;
}

/** A highlighted passage, optionally with a note. */
export interface Highlight {
  id: string;
  /** EPUB CFI range covering the highlighted text. */
  cfiRange: string;
  /** The highlighted text (clipped), for listing without the book loaded. */
  text: string;
  note?: string;
  createdAt: number;
}

/** Text currently selected in the book, ready to be highlighted. */
export interface TextSelection {
  cfiRange: string;
  text: string;
}
