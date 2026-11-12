export interface SearchMatchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

/** A snippet of text around a match, with where the match sits inside it. */
export interface Excerpt {
  text: string;
  matchStart: number;
  matchLength: number;
}

const EXCERPT_CONTEXT = 60;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the global regex used to find `query` in a run of text. The query is
 * always taken literally. "Whole word" means the match isn't flanked by a
 * letter, digit or underscore - Unicode-aware, so it works beyond ASCII.
 */
export function buildSearchRegex(query: string, options: SearchMatchOptions = {}): RegExp {
  let pattern = escapeRegExp(query);
  if (options.wholeWord) pattern = `(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`;
  return new RegExp(pattern, options.caseSensitive ? 'gu' : 'giu');
}

/** Every match of `regex` (which must be global) in `text`, as start/length pairs. */
export function findMatches(text: string, regex: RegExp): Array<{ start: number; length: number }> {
  const matches: Array<{ start: number; length: number }> = [];
  regex.lastIndex = 0;
  for (let m = regex.exec(text); m; m = regex.exec(text)) {
    if (m[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    matches.push({ start: m.index, length: m[0].length });
  }
  return matches;
}

/** Cuts a short excerpt out of `text` around the match at `start`, collapsing whitespace. */
export function excerptAround(text: string, start: number, length: number): Excerpt {
  const from = Math.max(0, start - EXCERPT_CONTEXT);
  const to = Math.min(text.length, start + length + EXCERPT_CONTEXT);
  const clean = (part: string) => part.replace(/\s+/g, ' ');

  let before = clean(text.slice(from, start));
  const match = clean(text.slice(start, start + length));
  let after = clean(text.slice(start + length, to));
  before = (from > 0 ? '…' : '') + before.trimStart();
  after = after.trimEnd() + (to < text.length ? '…' : '');

  return { text: before + match + after, matchStart: before.length, matchLength: match.length };
}
