/** A touch position and the time it was recorded. */
export interface TouchPoint {
  x: number;
  y: number;
  time: number;
}

const MIN_DISTANCE = 48;
const MAX_DURATION = 700;
// How much more horizontal than vertical a movement has to be. Keeps a
// slanted vertical drag from turning the page.
const MIN_SLOPE = 1.5;

/**
 * Decides whether a finished touch was a page-turning swipe. Swiping left
 * pulls the next page in, as in a paper book; swiping right goes back.
 */
export function swipeDirection(start: TouchPoint, end: TouchPoint): 'next' | 'prev' | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (end.time - start.time > MAX_DURATION) return null;
  if (Math.abs(dx) < MIN_DISTANCE) return null;
  if (Math.abs(dx) < Math.abs(dy) * MIN_SLOPE) return null;
  return dx < 0 ? 'next' : 'prev';
}
