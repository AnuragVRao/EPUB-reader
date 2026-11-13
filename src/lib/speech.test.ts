import { describe, expect, it } from 'vitest';
import { pickVoice, splitSentences } from './speech';

const say = (text: string, locale?: string) => splitSentences(text, locale).map((s) => text.slice(s.start, s.end));

describe('splitSentences', () => {
  it('splits ordinary prose into sentences', () => {
    expect(say('The fox ran. Did it stop? No! It kept going.')).toEqual([
      'The fox ran.',
      'Did it stop?',
      'No!',
      'It kept going.',
    ]);
  });

  it('does not break at common abbreviations or decimals', () => {
    expect(say('Mr. Smith paid 3.50 for it. Then he left.', 'en')).toEqual(['Mr. Smith paid 3.50 for it.', 'Then he left.']);
  });

  it('keeps initials with the name they belong to', () => {
    expect(say('A book by J. R. R. Tolkien. It is long.')).toEqual(['A book by J. R. R. Tolkien.', 'It is long.']);
  });

  it('still breaks after a short ordinary word', () => {
    expect(say('I saw it. He did too.')).toEqual(['I saw it.', 'He did too.']);
    expect(say('It was Tom. Then he left.')).toEqual(['It was Tom.', 'Then he left.']);
    expect(say('Dr. No\nNext paragraph.')).toEqual(['Dr. No', 'Next paragraph.']);
  });

  it('always ends a sentence at a paragraph boundary', () => {
    expect(say('Chapter 1\nLorem ipsum dolor sit amet. Second sentence.')).toEqual([
      'Chapter 1',
      'Lorem ipsum dolor sit amet.',
      'Second sentence.',
    ]);
  });

  it('trims whitespace and drops fragments with nothing to say', () => {
    expect(say('  First.   \n\n * \n …  \n Second.  ')).toEqual(['First.', 'Second.']);
  });

  it('reports spans into the original text', () => {
    const text = 'A b.\n  C d.';
    expect(splitSentences(text)).toEqual([
      { start: 0, end: 4 },
      { start: 7, end: 11 },
    ]);
  });

  it('handles other scripts', () => {
    expect(say('これはペンです。あれは本です。', 'ja')).toEqual(['これはペンです。', 'あれは本です。']);
  });

  it('survives an invalid language tag from a book', () => {
    expect(say('One. Two.', 'not a tag!')).toEqual(['One.', 'Two.']);
  });

  it('returns nothing for empty text', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n  ')).toEqual([]);
  });
});

describe('pickVoice', () => {
  const voice = (voiceURI: string, lang: string, extra: { default?: boolean; localService?: boolean } = {}) => ({
    voiceURI,
    lang,
    default: extra.default ?? false,
    localService: extra.localService ?? true,
  });
  const voices = [
    voice('en-GB-1', 'en-GB'),
    voice('en-US-remote', 'en-US', { localService: false }),
    voice('en-US-local', 'en-US'),
    voice('fr-1', 'fr-FR', { default: true }),
  ];

  it('uses the chosen voice when it exists', () => {
    expect(pickVoice(voices, 'fr-1', 'en-US')?.voiceURI).toBe('fr-1');
  });

  it('falls back to the book language when the chosen voice is gone', () => {
    expect(pickVoice(voices, 'missing', 'en-GB')?.voiceURI).toBe('en-GB-1');
  });

  it('prefers an exact language match, then a local voice', () => {
    expect(pickVoice(voices, '', 'en-US')?.voiceURI).toBe('en-US-local');
    expect(pickVoice(voices, '', 'en_us')?.voiceURI).toBe('en-US-local');
  });

  it('accepts a voice for the same base language', () => {
    expect(pickVoice(voices, '', 'fr')?.voiceURI).toBe('fr-1');
    expect(pickVoice(voices, '', 'en-AU')?.voiceURI).toBe('en-GB-1');
  });

  it('leaves it to the browser when nothing matches', () => {
    expect(pickVoice(voices, '', 'de')).toBeNull();
    expect(pickVoice(voices, '', '')).toBeNull();
    expect(pickVoice([], '', 'en')).toBeNull();
  });
});
