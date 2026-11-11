import type { FlowMode } from './types';

export type PageKeyAction = 'next' | 'prev' | 'start' | 'end';

/** The parts of a KeyboardEvent this module reads. */
export interface PageKeyEvent {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  target?: EventTarget | null;
}

// Controls that use the navigation keys themselves: moving a text cursor,
// stepping a slider or select, resizing the TOC.
const KEY_CONSUMERS = 'input, textarea, select, [role="separator"]';
// Controls that Space activates.
const SPACE_CONSUMERS = 'button, a[href], summary, [role="button"]';

// Duck-typed rather than `instanceof Element`: events forwarded from the
// book's iframe carry elements from another realm.
function targetMatches(target: EventTarget | null | undefined, selector: string): boolean {
  const el = target as { closest?: (selector: string) => unknown; isContentEditable?: boolean } | null | undefined;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.isContentEditable) || Boolean(el.closest(selector));
}

/**
 * Maps a key press to a page-turn action, or null when the key should be left
 * alone. Arrows work in both flows. Space, PageUp/PageDown and Home/End only
 * act in paginated flow - in scrolled flow they keep their native scrolling.
 */
export function pageKeyAction(event: PageKeyEvent, flow: FlowMode): PageKeyAction | null {
  // Leave browser shortcuts (Alt+Left = back, Ctrl+Home, ...) alone.
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  if (targetMatches(event.target, KEY_CONSUMERS)) return null;

  if (event.key === 'ArrowLeft') return 'prev';
  if (event.key === 'ArrowRight') return 'next';
  if (flow !== 'paginated') return null;

  switch (event.key) {
    case ' ':
    case 'Spacebar':
      if (targetMatches(event.target, SPACE_CONSUMERS)) return null;
      return event.shiftKey ? 'prev' : 'next';
    case 'PageDown':
      return 'next';
    case 'PageUp':
      return 'prev';
    case 'Home':
      return 'start';
    case 'End':
      return 'end';
    default:
      return null;
  }
}
