import { EpubCFI } from 'epubjs';
import type { Book, Contents, Location, Rendition } from 'epubjs';
import { pickVoice } from '../lib/speech';
import { documentSentences } from '../lib/speechText';

export type ReadAloudStatus = 'idle' | 'playing' | 'paused';

interface Sentence {
  text: string;
  cfiRange: string;
  /** Point CFIs at the sentence's two ends. */
  start: string;
  end: string;
}

export interface ReadAloudOptions {
  language: () => string;
  rate: () => number;
  voiceUri: () => string;
  onStatus: (status: ReadAloudStatus) => void;
  /** Removes an annotation of this type from the rendition. */
  erase: (cfiRange: string, type: string) => void;
}

// The sentence being read is marked like a search match, in its own class.
const MARK_TYPE = 'underline';
const MARK_STYLES = { fill: '#3b82f6', 'fill-opacity': '0.25', stroke: '#3b82f6', 'stroke-opacity': '0.6' };

export function readAloudAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
}

function collapse(cfiRange: string, toStart: boolean): string {
  const cfi = new EpubCFI(cfiRange);
  cfi.collapse(toStart);
  return cfi.toString();
}

// Where one of the session's own page turns is headed: a sentence (by its
// start CFI), or the beginning of a section.
type Destination = { cfi: string } | { section: number };

function arrivedAt(destination: Destination, location: Location): boolean {
  return 'cfi' in destination ? onPage(destination.cfi, location) : location.start.index === destination.section;
}

function onPage(target: string, location: Location): boolean {
  try {
    const cfi = new EpubCFI();
    return cfi.compare(target, location.start.cfi) >= 0 && cfi.compare(target, location.end.cfi) <= 0;
  } catch {
    return false;
  }
}

/**
 * Reads the book aloud with the Web Speech API, one sentence at a time from a
 * starting position: marking each sentence on the page, turning the page when
 * the next sentence isn't on screen, and moving on through the spine at the
 * end of a chapter. Speech happens in the browser; nothing is sent anywhere
 * (though some browsers' built-in voices are themselves network services).
 *
 * Every asynchronous step checks `token`, which stop/pause/resume bump, so a
 * callback from a cancelled utterance or an earlier page turn can never act.
 */
export class ReadAloudSession {
  private sentences: Sentence[] = [];
  private index = 0;
  private sectionIndex = -1;
  private marked = '';
  private token = 0;
  // Set while the session turns the page itself, so the resulting `relocated`
  // is recognised as its own rather than the reader moving.
  private destination: Destination | null = null;
  status: ReadAloudStatus = 'idle';
  private readonly rendition: Rendition;
  private readonly book: Book;
  private readonly options: ReadAloudOptions;

  constructor(rendition: Rendition, book: Book, options: ReadAloudOptions) {
    this.rendition = rendition;
    this.book = book;
    this.options = options;
  }

  /** Starts reading at the first sentence that ends at or after `fromCfi`. */
  async start(fromCfi: string): Promise<void> {
    this.stop();
    const token = ++this.token;
    const location = this.currentLocation();
    if (!location) return;
    this.setStatus('playing');

    if (!this.loadSection(location.start.index)) {
      await this.speakFromNextSection(token);
      return;
    }
    const cfi = new EpubCFI();
    const from = fromCfi || location.start.cfi;
    const index = this.sentences.findIndex((s) => {
      try {
        return cfi.compare(s.end, from) >= 0;
      } catch {
        return false;
      }
    });
    if (index === -1) {
      await this.speakFromNextSection(token);
      return;
    }
    this.index = index;
    await this.speakCurrent(token);
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.token++;
    speechSynthesis.cancel();
    this.setStatus('paused');
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return;
    const token = ++this.token;
    this.setStatus('playing');
    await this.speakCurrent(token);
  }

  stop(): void {
    this.token++;
    this.destination = null;
    if (readAloudAvailable()) speechSynthesis.cancel();
    this.unmark();
    this.sentences = [];
    this.sectionIndex = -1;
    this.setStatus('idle');
  }

  /**
   * Called for every `relocated`. If the reader moved away from the sentence
   * being read (a page turn or jump of their own, not one of ours and not a
   * relayout), reading stops rather than dragging them back.
   */
  onRelocated(location: Location, layoutChange: boolean): void {
    if (this.status === 'idle' || layoutChange) return;
    if (this.destination) {
      // Arriving where the session was going is its own page turn. Arriving
      // anywhere else means the reader jumped while it was on its way.
      if (!arrivedAt(this.destination, location)) this.stop();
      return;
    }
    const sentence = this.sentences[this.index];
    if (!sentence) return;
    if (!onPage(sentence.start, location) && !onPage(sentence.end, location)) this.stop();
  }

  private setStatus(status: ReadAloudStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }

  private currentLocation(): Location | null {
    const location = this.rendition.currentLocation() as unknown as Location | undefined;
    return location?.start && location.end ? location : null;
  }

  // Builds the sentence list for a section that is currently rendered.
  private loadSection(sectionIndex: number): boolean {
    const contents = (this.rendition.getContents() as unknown as Contents[]).find(
      (c) => c.sectionIndex === sectionIndex,
    );
    this.sectionIndex = sectionIndex;
    this.sentences = [];
    this.index = 0;
    if (!contents?.document) return false;
    for (const { text, range } of documentSentences(contents.document, this.options.language())) {
      try {
        const cfiRange = contents.cfiFromRange(range);
        this.sentences.push({ text, cfiRange, start: collapse(cfiRange, true), end: collapse(cfiRange, false) });
      } catch {
        // A range epub.js can't express as a CFI; skip that sentence.
      }
    }
    return this.sentences.length > 0;
  }

  // Shows `target` and waits for epub.js to report arriving at `destination`.
  //
  // Recognising its own page turn by where it lands, not by timing, matters:
  // a jump the reader makes while a turn is in flight must stop reading, not
  // be ignored and then undone by the turn completing.
  private async show(target: string, destination: Destination): Promise<void> {
    this.destination = destination;
    const arrived = new Promise<void>((resolve) => {
      const done = (location?: Location) => {
        if (location && !arrivedAt(destination, location)) return;
        this.rendition.off('relocated', done);
        resolve();
      };
      this.rendition.on('relocated', done);
      setTimeout(done, 1000);
    });
    try {
      await this.rendition.display(target);
      await arrived;
    } finally {
      if (this.destination === destination) this.destination = null;
    }
  }

  // Moves through the spine to the next section with something to read.
  private async speakFromNextSection(token: number): Promise<void> {
    let next = this.sectionIndex + 1;
    for (;;) {
      const section = this.book.spine.get(next) as unknown as { href: string; index: number } | null;
      if (!section) {
        this.stop();
        return;
      }
      await this.show(section.href, { section: section.index }).catch(() => {});
      if (token !== this.token) return;
      if (this.loadSection(section.index)) break;
      next = section.index + 1;
    }
    await this.speakCurrent(token);
  }

  private async speakCurrent(token: number): Promise<void> {
    if (token !== this.token) return;
    const sentence = this.sentences[this.index];
    if (!sentence) {
      await this.speakFromNextSection(token);
      return;
    }

    const location = this.currentLocation();
    if (location && !onPage(sentence.start, location)) {
      await this.show(sentence.start, { cfi: sentence.start }).catch(() => {});
      if (token !== this.token) return;
    }

    this.mark(sentence.cfiRange);
    const utterance = new SpeechSynthesisUtterance(sentence.text);
    const language = this.options.language();
    const voice = pickVoice(speechSynthesis.getVoices(), this.options.voiceUri(), language);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || language;
    utterance.rate = this.options.rate();
    utterance.onend = () => {
      if (token !== this.token) return;
      this.index += 1;
      void this.speakCurrent(token);
    };
    utterance.onerror = (event) => {
      if (token !== this.token) return;
      // Our own cancel() reports these; anything else ends the session.
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      console.warn('Read aloud stopped:', event.error);
      this.stop();
    };
    speechSynthesis.speak(utterance);
  }

  private mark(cfiRange: string): void {
    this.unmark();
    try {
      this.rendition.annotations.add(MARK_TYPE, cfiRange, {}, undefined, 'tts-sentence', MARK_STYLES);
      this.marked = cfiRange;
    } catch {
      // Not drawable (section not on screen); reading continues regardless.
    }
  }

  private unmark(): void {
    if (!this.marked) return;
    this.options.erase(this.marked, MARK_TYPE);
    this.marked = '';
  }
}
