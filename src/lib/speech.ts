/** A sentence as a `[start, end)` span of a section's collected text. */
export interface TextSpan {
  start: number;
  end: number;
}

// A span with nothing worth saying: only whitespace, punctuation or symbols
// (a stray "*", a footnote marker reduced to "."), which some voices read
// out as "asterisk" or "full stop".
const SPEAKABLE = /[\p{L}\p{N}]/u;

/**
 * Splits `text` into sentences using the browser's own segmenter for
 * `locale`, trimmed of surrounding whitespace and with unspeakable fragments
 * dropped. Paragraph boundaries should be marked in `text` with a newline,
 * which always ends a sentence - so a heading without a full stop isn't run
 * into the paragraph after it.
 */
export function splitSentences(text: string, locale?: string): TextSpan[] {
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(locale || undefined, { granularity: 'sentence' });
  } catch {
    // An invalid language tag in the book: fall back to the default rules.
    segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
  }

  const spans: TextSpan[] = [];
  const push = (start: number, end: number) => {
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end > start && SPEAKABLE.test(text.slice(start, end))) spans.push({ start, end });
  };

  for (const { segment, index } of segmenter.segment(text)) {
    // The segmenter keeps trailing newlines with the sentence before them but
    // doesn't always break at one; split on newlines explicitly.
    let offset = index;
    for (const line of segment.split('\n')) {
      push(offset, offset + line.length);
      offset += line.length + 1;
    }
  }
  return mergeAbbreviations(text, spans);
}

// The browser's segmenter has no abbreviation list, so "Mr. Smith" and
// "J. R. R. Tolkien" come out as several sentences - each read with a pause
// and marked separately. Rejoin a span ending in a common abbreviation or
// an initial with the next one, when that continues the
// sentence (starts with a capital or a digit) within the same paragraph.
// A fixed list rather than "any short capitalised word", which would also
// swallow genuine sentence ends like "...said Tom. Then...".
const ABBREVIATION_END =
  /(?:^|[\s(])(?:[A-Z]|Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|Prof|Rev|Gen|Col|Capt|Lt|Sgt|Gov|Hon|Fr|No|Vol|Fig)\.$/;
const CONTINUES = /^[\p{Lu}\p{N}]/u;

function mergeAbbreviations(text: string, spans: TextSpan[]): TextSpan[] {
  const merged: TextSpan[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (
      last &&
      ABBREVIATION_END.test(text.slice(last.start, last.end)) &&
      CONTINUES.test(text.slice(span.start, span.end)) &&
      !text.slice(last.end, span.start).includes('\n')
    ) {
      last.end = span.end;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

export const MIN_SPEECH_RATE = 0.5;
export const MAX_SPEECH_RATE = 2;

/**
 * Picks a voice: the one the reader chose if it still exists, otherwise the
 * best match for the book's language (exact tag, then same base language,
 * preferring the system default and local voices), otherwise null - which
 * leaves the choice to the browser.
 */
export function pickVoice<V extends { voiceURI: string; lang: string; default: boolean; localService: boolean }>(
  voices: readonly V[],
  chosenUri: string,
  bookLanguage: string,
): V | null {
  if (chosenUri) {
    const chosen = voices.find((v) => v.voiceURI === chosenUri);
    if (chosen) return chosen;
  }
  const lang = bookLanguage.toLowerCase().replace('_', '-');
  if (!lang) return null;
  const base = lang.split('-')[0];
  const score = (v: V) => {
    const voiceLang = v.lang.toLowerCase().replace('_', '-');
    if (voiceLang === lang) return 3;
    if (voiceLang.split('-')[0] === base) return 2;
    return 0;
  };
  const candidates = voices.filter((v) => score(v) > 0);
  if (!candidates.length) return null;
  return candidates.sort(
    (a, b) =>
      score(b) - score(a) || Number(b.default) - Number(a.default) || Number(b.localService) - Number(a.localService),
  )[0];
}
