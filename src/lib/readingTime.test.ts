import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHARS_PER_LOCATION,
  DEFAULT_CHARS_PER_MINUTE,
  ReadingSpeed,
  formatDuration,
  loadReadingSpeed,
  minutesToRead,
  persistReadingSpeed,
} from './readingTime';

const MINUTE = 60_000;

describe('ReadingSpeed', () => {
  it('starts from the default, or from a previously measured speed', () => {
    expect(new ReadingSpeed().charsPerMinute).toBe(DEFAULT_CHARS_PER_MINUTE);
    expect(new ReadingSpeed(900).charsPerMinute).toBe(900);
    expect(new ReadingSpeed(Number.NaN).charsPerMinute).toBe(DEFAULT_CHARS_PER_MINUTE);
  });

  it('measures speed from steady page turns', () => {
    const speed = new ReadingSpeed();
    // One location (1600 chars) every two minutes = 800 chars/minute.
    for (let i = 0; i <= 3; i++) speed.record(10 + i, i * 2 * MINUTE);
    expect(speed.measured).toBe(true);
    expect(speed.charsPerMinute).toBeCloseTo(800);
  });

  it('keeps the starting value until a minute of reading has been seen', () => {
    const speed = new ReadingSpeed();
    speed.record(1, 0);
    speed.record(2, 30_000);
    expect(speed.measured).toBe(false);
    expect(speed.charsPerMinute).toBe(DEFAULT_CHARS_PER_MINUTE);
  });

  it('ignores flicking through pages, jumps, going back and long pauses', () => {
    const speed = new ReadingSpeed();
    speed.record(10, 0);
    speed.record(11, 500); // too fast to have been read
    speed.record(60, 2 * MINUTE); // a jump through the TOC
    speed.record(55, 4 * MINUTE); // backwards
    speed.record(56, 40 * MINUTE); // walked away
    expect(speed.measured).toBe(false);

    // Real reading afterwards is still picked up.
    speed.record(57, 42 * MINUTE);
    expect(speed.measured).toBe(true);
    expect(speed.charsPerMinute).toBeCloseTo(800);
  });

  it('starts a fresh sample after reset', () => {
    const speed = new ReadingSpeed();
    speed.record(10, 0);
    speed.reset();
    speed.record(11, 2 * MINUTE);
    expect(speed.measured).toBe(false);
  });

  it('keeps an implausible measurement within bounds', () => {
    const speed = new ReadingSpeed();
    // Four locations every 12 seconds would be 32,000 chars/minute.
    for (let i = 0; i <= 10; i++) speed.record(i * 4, i * 12_000);
    expect(speed.charsPerMinute).toBe(6000);
  });
});

describe('minutesToRead', () => {
  it('converts locations to minutes at the given speed', () => {
    expect(minutesToRead(10, CHARS_PER_LOCATION)).toBe(10);
    expect(minutesToRead(0, 1000)).toBe(0);
    expect(minutesToRead(-3, 1000)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0.4)).toBe('under a minute');
    expect(formatDuration(12.3)).toBe('12 min');
    expect(formatDuration(59.6)).toBe('1 h');
    expect(formatDuration(65)).toBe('1 h 5 min');
    expect(formatDuration(180)).toBe('3 h');
  });
});

describe('stored reading speed', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips through localStorage', () => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    });
    expect(loadReadingSpeed()).toBeNull();
    persistReadingSpeed(1234.6);
    expect(loadReadingSpeed()).toBe(1235);
  });

  it('survives storage being unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadReadingSpeed()).toBeNull();
    expect(() => persistReadingSpeed(1000)).not.toThrow();
  });
});
