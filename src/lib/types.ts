export type ThemeName = 'light' | 'dark' | 'sepia';
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
