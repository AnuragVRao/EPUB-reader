/**
 * Word lookups against Wiktionary's REST API. This is the only network
 * request the app ever makes, it is off until the reader turns it on, and it
 * sends nothing but the looked-up word. The origin must stay in step with
 * `connect-src` in the Content Security Policy (vite.config.ts).
 */
export const DICTIONARY_ORIGIN = 'https://en.wiktionary.org';
export const DICTIONARY_NAME = 'Wiktionary';

const MAX_TERM_LENGTH = 40;
const MAX_TERM_WORDS = 3;
const MAX_ENTRIES = 6;
const MAX_DEFINITIONS = 5;

export interface DictionaryEntry {
  /** The language the entry is for, as Wiktionary names it ("English"). */
  language: string;
  partOfSpeech: string;
  definitions: string[];
}

export interface DictionaryResult {
  /** The form that was found (may be lower-cased from what was selected). */
  term: string;
  entries: DictionaryEntry[];
  /** The entry's page, for reading more. */
  url: string;
}

export type DictionaryErrorKind = 'not-found' | 'network';

export class DictionaryError extends Error {
  readonly kind: DictionaryErrorKind;
  constructor(kind: DictionaryErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/**
 * Turns selected text into something worth looking up: a word or a short
 * phrase, without surrounding punctuation or quotes. Returns null for
 * anything else (a whole sentence, a number, a stray symbol).
 */
export function lookupTerm(selected: string): string | null {
  const term = selected
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');
  if (!term || term.length > MAX_TERM_LENGTH) return null;
  if (term.split(' ').length > MAX_TERM_WORDS) return null;
  if (!/\p{L}/u.test(term)) return null;
  return term;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * Wiktionary's definitions are HTML. They are only ever shown as text, so
 * tags are dropped and entities decoded; nothing from the response is
 * inserted as markup.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

interface RawEntry {
  partOfSpeech?: unknown;
  language?: unknown;
  definitions?: Array<{ definition?: unknown }>;
}

/**
 * Picks the entries to show from a Wiktionary definition response: those for
 * the book's language if there are any, otherwise all of them. The response
 * is untrusted and only read defensively.
 */
export function parseDefinitions(raw: unknown, bookLanguage: string): DictionaryEntry[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const byLanguage = raw as Record<string, unknown>;
  const base = bookLanguage.toLowerCase().split(/[-_]/)[0];

  const toEntries = (list: unknown): DictionaryEntry[] =>
    (Array.isArray(list) ? (list as RawEntry[]) : []).flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const definitions = (Array.isArray(entry.definitions) ? entry.definitions : [])
        .map((d) => (typeof d?.definition === 'string' ? htmlToText(d.definition) : ''))
        .filter(Boolean)
        .slice(0, MAX_DEFINITIONS);
      if (!definitions.length) return [];
      return [
        {
          language: typeof entry.language === 'string' ? entry.language : '',
          partOfSpeech: typeof entry.partOfSpeech === 'string' ? entry.partOfSpeech : '',
          definitions,
        },
      ];
    });

  const preferred = base ? toEntries(byLanguage[base]) : [];
  const entries = preferred.length ? preferred : Object.values(byLanguage).flatMap(toEntries);
  return entries.slice(0, MAX_ENTRIES);
}

export function entryUrl(term: string): string {
  return `${DICTIONARY_ORIGIN}/wiki/${encodeURIComponent(term.replace(/ /g, '_'))}`;
}

const cache = new Map<string, DictionaryResult>();

/**
 * Looks `term` up, trying it as selected and then in lower case (a word at
 * the start of a sentence is capitalised; its entry usually isn't). Results
 * are kept for the session so a second lookup makes no request.
 */
export async function fetchDefinitions(
  term: string,
  bookLanguage: string,
  signal?: AbortSignal,
): Promise<DictionaryResult> {
  const candidates = [...new Set([term, term.toLowerCase()])];
  for (const candidate of candidates) {
    const key = `${bookLanguage}|${candidate}`;
    const cached = cache.get(key);
    if (cached) return cached;

    let response: Response;
    try {
      response = await fetch(
        `${DICTIONARY_ORIGIN}/api/rest_v1/page/definition/${encodeURIComponent(candidate.replace(/ /g, '_'))}`,
        { signal, headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' },
      );
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new DictionaryError('network', `Could not reach ${DICTIONARY_NAME}.`);
    }
    if (response.status === 404) continue;
    if (!response.ok) throw new DictionaryError('network', `${DICTIONARY_NAME} did not answer (${response.status}).`);

    const entries = parseDefinitions(await response.json().catch(() => null), bookLanguage);
    if (!entries.length) continue;
    const result = { term: candidate, entries, url: entryUrl(candidate) };
    cache.set(key, result);
    return result;
  }
  throw new DictionaryError('not-found', `No ${DICTIONARY_NAME} entry for “${term}”.`);
}
