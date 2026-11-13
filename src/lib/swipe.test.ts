import { describe, expect, it } from 'vitest';
import { swipeDirection } from './swipe';

const at = (x: number, y: number, time = 0) => ({ x, y, time });

describe('swipeDirection', () => {
  it('turns forward on a swipe to the left and back on a swipe to the right', () => {
    expect(swipeDirection(at(300, 200), at(180, 205, 200))).toBe('next');
    expect(swipeDirection(at(100, 200), at(220, 195, 200))).toBe('prev');
  });

  it('swaps directions for right-to-left books', () => {
    expect(swipeDirection(at(100, 200), at(220, 195, 200), true)).toBe('next');
    expect(swipeDirection(at(300, 200), at(180, 205, 200), true)).toBe('prev');
  });

  it('ignores taps and short drags', () => {
    expect(swipeDirection(at(300, 200), at(300, 200, 80))).toBeNull();
    expect(swipeDirection(at(300, 200), at(270, 200, 150))).toBeNull();
  });

  it('ignores vertical and diagonal movement', () => {
    expect(swipeDirection(at(300, 200), at(290, 400, 200))).toBeNull();
    expect(swipeDirection(at(300, 200), at(200, 290, 200))).toBeNull();
  });

  it('ignores slow drags, which are text selection or reading along', () => {
    expect(swipeDirection(at(300, 200), at(100, 200, 1200))).toBeNull();
  });
});
