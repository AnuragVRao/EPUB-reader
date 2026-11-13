import { afterEach, describe, expect, it, vi } from 'vitest';
import { DictionaryError, entryUrl, fetchDefinitions, htmlToText, lookupTerm, parseDefinitions } from './dictionary';

describe('lookupTerm', () => {
  it('strips punctuation and quotes around a word', () => {
    expect(lookupTerm('  “fox,”  ')).toBe('fox');
    expect(lookupTerm('(Ireland)')).toBe('Ireland');
    expect(lookupTerm('fox.')).toBe('fox');
  });

  it("keeps apostrophes and hyphens inside a word, and short phrases", () => {
    expect(lookupTerm("don't")).toBe("don't");
    expect(lookupTerm('well-being')).toBe('well-being');
    expect(lookupTerm('ad   hoc')).toBe('ad hoc');
  });

  it('refuses sentences, numbers and symbols', () => {
    expect(lookupTerm('The quick brown fox jumps.')).toBeNull();
    expect(lookupTerm('1984')).toBeNull();
    expect(lookupTerm(' * ')).toBeNull();
    expect(lookupTerm('')).toBeNull();
    expect(lookupTerm('a'.repeat(41))).toBeNull();
  });

  it('works for other scripts', () => {
    expect(lookupTerm('«מילה»')).toBe('מילה');
    expect(lookupTerm('猫。')).toBe('猫');
  });
});

describe('htmlToText', () => {
  it('drops tags and decodes entities', () => {
    expect(htmlToText('A <a href="/wiki/x">small</a> <i>canid</i> &amp; friend&#39;s &#x2014; pet')).toBe(
      "A small canid & friend's — pet",
    );
  });

  it('never lets markup through', () => {
    expect(htmlToText('<img src=x onerror="alert(1)">text<script>bad()</script>')).toBe('textbad()');
    expect(htmlToText('&lt;b&gt;')).toBe('<b>');
  });
});

describe('parseDefinitions', () => {
  const response = {
    en: [
      { partOfSpeech: 'Noun', language: 'English', definitions: [{ definition: 'A <b>red</b> fox.' }, { definition: '<span></span>' }] },
      { partOfSpeech: 'Verb', language: 'English', definitions: [{ definition: 'To trick.' }] },
    ],
    de: [{ partOfSpeech: 'Noun', language: 'German', definitions: [{ definition: 'fox (in German)' }] }],
  };

  it("prefers entries in the book's language", () => {
    expect(parseDefinitions(response, 'de-DE')).toEqual([
      { language: 'German', partOfSpeech: 'Noun', definitions: ['fox (in German)'] },
    ]);
  });

  it('falls back to every language, dropping empty definitions', () => {
    const all = parseDefinitions(response, 'fr');
    expect(all.map((e) => e.partOfSpeech)).toEqual(['Noun', 'Verb', 'Noun']);
    expect(all[0].definitions).toEqual(['A red fox.']);
  });

  it('copes with malformed responses', () => {
    expect(parseDefinitions(null, 'en')).toEqual([]);
    expect(parseDefinitions({ en: 'nope', xx: [null, { definitions: 'x' }, { definitions: [{ definition: 5 }] }] }, 'en')).toEqual([]);
  });
});

describe('entryUrl', () => {
  it('encodes the term into a Wiktionary page address', () => {
    expect(entryUrl('ad hoc')).toBe('https://en.wiktionary.org/wiki/ad_hoc');
    expect(entryUrl('naïve')).toBe('https://en.wiktionary.org/wiki/na%C3%AFve');
  });
});

describe('fetchDefinitions', () => {
  afterEach(() => vi.unstubAllGlobals());

  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  it('tries the lower-case form when the selected one has no entry, and caches the result', async () => {
    const fetchMock = vi.fn((url: string) =>
      url.endsWith('/Vixen') ? json({}, 404) : json({ en: [{ partOfSpeech: 'Noun', language: 'English', definitions: [{ definition: 'A female fox.' }] }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchDefinitions('Vixen', 'en');
    expect(result.term).toBe('vixen');
    expect(result.entries[0].definitions).toEqual(['A female fox.']);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://en.wiktionary.org/api/rest_v1/page/definition/Vixen',
      'https://en.wiktionary.org/api/rest_v1/page/definition/vixen',
    ]);

    await fetchDefinitions('Vixen', 'en');
    // Second lookup: still a 404 request for "Vixen", but "vixen" comes from the cache.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sends no cookies or referrer', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => json({ en: [{ definitions: [{ definition: 'x' }] }] }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchDefinitions('quokka', 'en');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
  });

  it('reports a missing word and an unreachable service differently', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({}, 404)));
    await expect(fetchDefinitions('qzxqzx', 'en')).rejects.toMatchObject({ kind: 'not-found' });

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const error = await fetchDefinitions('offline', 'en').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DictionaryError);
    expect((error as DictionaryError).kind).toBe('network');
  });
});
