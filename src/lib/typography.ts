import type { ReaderSettings } from './types';

/** Paragraph spacing choices offered in settings, in em. `null` leaves the book's own spacing alone. */
export const PARAGRAPH_SPACINGS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: null, label: 'Book default' },
  { value: 0, label: 'None' },
  { value: 0.5, label: 'Small' },
  { value: 1, label: 'Medium' },
  { value: 1.5, label: 'Large' },
];

export const MAX_PAGE_MARGIN = 25;

/**
 * CSS injected into each chapter document for the typography settings that
 * need rules on elements other than `body` (which is all epub.js's
 * `themes.override` can target). Empty when every such setting is at its
 * default, so an untouched book renders exactly as its publisher styled it.
 */
export function typographyCss(settings: Pick<ReaderSettings, 'paragraphSpacing' | 'hyphenate'>): string {
  const rules: string[] = [];
  if (settings.paragraphSpacing !== null) {
    // With no gap between paragraphs, indent them instead so they can still
    // be told apart - the usual convention for unspaced text.
    const indent = settings.paragraphSpacing === 0 ? 'text-indent:1.5em !important;' : '';
    rules.push(`p{margin-top:0 !important;margin-bottom:${settings.paragraphSpacing}em !important;${indent}}`);
  }
  if (settings.hyphenate) {
    rules.push('body,p,li,blockquote,dd,td{-webkit-hyphens:auto !important;hyphens:auto !important;}');
  }
  return rules.join('\n');
}
