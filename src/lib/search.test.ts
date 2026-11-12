import { describe, expect, it } from 'vitest';
import { buildSearchRegex, excerptAround, findMatches } from './search';

const TEXT = 'The quick brown Fox jumps over the foxglove. A fox is not a FOX.';
const found = (query: string, options = {}) =>
  findMatches(TEXT, buildSearchRegex(query, options)).map((m) => TEXT.slice(m.start, m.start + m.length));

describe('buildSearchRegex + findMatches', () => {
  it('matches substrings regardless of case by default', () => {
    expect(found('fox')).toEqual(['Fox', 'fox', 'fox', 'FOX']);
  });

  it('respects case when asked', () => {
    expect(found('fox', { caseSensitive: true })).toEqual(['fox', 'fox']);
    expect(found('FOX', { caseSensitive: true })).toEqual(['FOX']);
  });

  it('matches whole words only when asked', () => {
    // "foxglove" no longer counts.
    expect(found('fox', { wholeWord: true })).toEqual(['Fox', 'fox', 'FOX']);
    expect(found('fox', { wholeWord: true, caseSensitive: true })).toEqual(['fox']);
  });

  it('treats the query literally, not as a pattern', () => {
    expect(findMatches('a.b a+b axb (a.b)', buildSearchRegex('a.b'))).toHaveLength(2);
    expect(findMatches('what? what', buildSearchRegex('what?'))).toHaveLength(1);
    expect(() => buildSearchRegex('[unclosed(')).not.toThrow();
  });

  it('applies whole-word boundaries to non-ASCII letters', () => {
    const regex = buildSearchRegex('été', { wholeWord: true });
    expect(findMatches('un été chaud', regex)).toHaveLength(1);
    expect(findMatches('répétée', buildSearchRegex('été', { wholeWord: true }))).toHaveLength(0);
  });

  it('reports positions and can be reused across texts', () => {
    const regex = buildSearchRegex('ab');
    expect(findMatches('ab ab', regex)).toEqual([
      { start: 0, length: 2 },
      { start: 3, length: 2 },
    ]);
    expect(findMatches('xab', regex)).toEqual([{ start: 1, length: 2 }]);
  });
});

describe('excerptAround', () => {
  it('returns short text whole, with the match located', () => {
    const e = excerptAround('A fox ran.', 2, 3);
    expect(e.text).toBe('A fox ran.');
    expect(e.text.slice(e.matchStart, e.matchStart + e.matchLength)).toBe('fox');
  });

  it('trims long text to a window around the match and marks the cuts', () => {
    const text = `${'a '.repeat(100)}NEEDLE${' b'.repeat(100)}`;
    const start = text.indexOf('NEEDLE');
    const e = excerptAround(text, start, 6);
    expect(e.text.startsWith('…')).toBe(true);
    expect(e.text.endsWith('…')).toBe(true);
    expect(e.text.length).toBeLessThan(140);
    expect(e.text.slice(e.matchStart, e.matchStart + e.matchLength)).toBe('NEEDLE');
  });

  it('collapses whitespace without losing track of the match', () => {
    const text = 'one\n\n   two   \n three';
    const e = excerptAround(text, text.indexOf('two'), 3);
    expect(e.text).toBe('one two three');
    expect(e.text.slice(e.matchStart, e.matchStart + e.matchLength)).toBe('two');
  });
});
