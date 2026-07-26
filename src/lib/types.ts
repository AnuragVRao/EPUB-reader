export type ThemeName = 'light' | 'dark' | 'sepia';
export type FontFamily = 'system' | 'serif' | 'sans' | 'dyslexic';
export type FlowMode = 'paginated' | 'scrolled';

export interface ReaderSettings {
  theme: ThemeName;
  fontSize: number; // percentage, e.g. 100
  fontFamily: FontFamily;
  flow: FlowMode;
  lineSpacing: number; // multiplier, e.g. 1.4
  justify: boolean;
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
  createdAt: number;
}

export interface Progress {
  bookId: string;
  cfi: string;
  percentage: number;
  updatedAt: number;
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
  href: string;
}
