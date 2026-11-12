/** Characters per entry in the location index (see `book.locations.generate` in useEpubReader). */
export const CHARS_PER_LOCATION = 1600;

/** Assumed until the reader's own pace has been measured: roughly 220 words a minute. */
export const DEFAULT_CHARS_PER_MINUTE = 1300;

const SPEED_KEY = 'epub-reader-speed';
const MIN_CHARS_PER_MINUTE = 200;
const MAX_CHARS_PER_MINUTE = 6000;

// A page turn only counts as reading if it took a believable amount of time
// and moved a believable distance; anything else is flicking through, a jump
// via the TOC, or the reader having walked away.
const MIN_SAMPLE_MS = 3_000;
const MAX_SAMPLE_MS = 10 * 60_000;
const MAX_SAMPLE_LOCATIONS = 4;
// Don't trust the measurement until it covers this much reading.
const MIN_MEASURED_MS = 60_000;
// Cap on accumulated history, so the estimate keeps adapting to the current pace.
const MAX_MEASURED_MS = 30 * 60_000;

function clampSpeed(value: number): number {
  return Math.min(MAX_CHARS_PER_MINUTE, Math.max(MIN_CHARS_PER_MINUTE, value));
}

/**
 * Measures reading speed from successive positions in the location index.
 * Feed it every position the reader lands on; it keeps a running total of the
 * characters and time covered by turns that look like actual reading.
 */
export class ReadingSpeed {
  private chars = 0;
  private ms = 0;
  private last: { location: number; time: number } | null = null;
  private readonly fallback: number;

  /** `initial` is a previously measured speed (chars/minute) to start from, if any. */
  constructor(initial?: number | null) {
    this.fallback =
      typeof initial === 'number' && Number.isFinite(initial) ? clampSpeed(initial) : DEFAULT_CHARS_PER_MINUTE;
  }

  /** Records that the reader is at `location` (an index into the location index) at `time` (ms). */
  record(location: number, time: number): void {
    const previous = this.last;
    this.last = { location, time };
    if (!previous) return;

    const moved = location - previous.location;
    const elapsed = time - previous.time;
    if (moved <= 0 || moved > MAX_SAMPLE_LOCATIONS) return;
    if (elapsed < MIN_SAMPLE_MS * moved || elapsed > MAX_SAMPLE_MS) return;

    this.chars += moved * CHARS_PER_LOCATION;
    this.ms += elapsed;
    if (this.ms > MAX_MEASURED_MS) {
      const scale = MAX_MEASURED_MS / this.ms;
      this.chars *= scale;
      this.ms *= scale;
    }
  }

  /** Forgets the last position, so the next one starts a fresh sample (e.g. after a jump). */
  reset(): void {
    this.last = null;
  }

  /** True once enough reading has been observed to replace the starting value. */
  get measured(): boolean {
    return this.ms >= MIN_MEASURED_MS;
  }

  get charsPerMinute(): number {
    if (!this.measured) return this.fallback;
    return clampSpeed((this.chars / this.ms) * 60_000);
  }
}

/** Minutes needed to read `locations` entries of the location index at `charsPerMinute`. */
export function minutesToRead(locations: number, charsPerMinute: number): number {
  if (locations <= 0 || charsPerMinute <= 0) return 0;
  return (locations * CHARS_PER_LOCATION) / charsPerMinute;
}

/** "under a minute", "12 min", "1 h 5 min", "3 h". */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'under a minute';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function loadReadingSpeed(): number | null {
  try {
    const value = Number(localStorage.getItem(SPEED_KEY));
    return Number.isFinite(value) && value > 0 ? clampSpeed(value) : null;
  } catch {
    return null;
  }
}

export function persistReadingSpeed(charsPerMinute: number): void {
  try {
    localStorage.setItem(SPEED_KEY, String(Math.round(charsPerMinute)));
  } catch {
    // Storage unavailable: the speed is simply measured again next session.
  }
}
