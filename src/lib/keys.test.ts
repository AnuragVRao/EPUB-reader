import { describe, expect, it } from 'vitest';
import { pageKeyAction } from './keys';

// Stands in for a DOM element: `closest` answers for the selectors listed.
function target(...matching: string[]): EventTarget {
  return {
    closest: (selector: string) => (matching.some((m) => selector.split(', ').includes(m)) ? {} : null),
  } as unknown as EventTarget;
}

describe('pageKeyAction', () => {
  it('turns pages with the arrow keys in both flows', () => {
    expect(pageKeyAction({ key: 'ArrowLeft' }, 'paginated')).toBe('prev');
    expect(pageKeyAction({ key: 'ArrowRight' }, 'paginated')).toBe('next');
    expect(pageKeyAction({ key: 'ArrowLeft' }, 'scrolled')).toBe('prev');
    expect(pageKeyAction({ key: 'ArrowRight' }, 'scrolled')).toBe('next');
  });

  it('maps Space, PageUp/PageDown and Home/End in paginated flow', () => {
    expect(pageKeyAction({ key: ' ' }, 'paginated')).toBe('next');
    expect(pageKeyAction({ key: ' ', shiftKey: true }, 'paginated')).toBe('prev');
    expect(pageKeyAction({ key: 'PageDown' }, 'paginated')).toBe('next');
    expect(pageKeyAction({ key: 'PageUp' }, 'paginated')).toBe('prev');
    expect(pageKeyAction({ key: 'Home' }, 'paginated')).toBe('start');
    expect(pageKeyAction({ key: 'End' }, 'paginated')).toBe('end');
  });

  it('leaves the scrolling keys to the browser in scrolled flow', () => {
    for (const key of [' ', 'PageDown', 'PageUp', 'Home', 'End']) {
      expect(pageKeyAction({ key }, 'scrolled')).toBeNull();
    }
  });

  it('ignores unrelated keys', () => {
    expect(pageKeyAction({ key: 'a' }, 'paginated')).toBeNull();
    expect(pageKeyAction({ key: 'Enter' }, 'paginated')).toBeNull();
  });

  it('ignores keys combined with Ctrl, Alt or Meta', () => {
    expect(pageKeyAction({ key: 'ArrowLeft', altKey: true }, 'paginated')).toBeNull();
    expect(pageKeyAction({ key: 'Home', ctrlKey: true }, 'paginated')).toBeNull();
    expect(pageKeyAction({ key: 'ArrowRight', metaKey: true }, 'paginated')).toBeNull();
  });

  it('ignores every key while a text field, select or the TOC resizer has focus', () => {
    for (const selector of ['input', 'textarea', 'select', '[role="separator"]']) {
      for (const key of ['ArrowLeft', 'ArrowRight', ' ', 'Home', 'End', 'PageDown']) {
        expect(pageKeyAction({ key, target: target(selector) }, 'paginated')).toBeNull();
      }
    }
  });

  it('ignores keys inside editable content', () => {
    const editable = { isContentEditable: true, closest: () => null } as unknown as EventTarget;
    expect(pageKeyAction({ key: 'ArrowRight', target: editable }, 'paginated')).toBeNull();
  });

  it('lets Space activate a focused button or link, but still turns pages with other keys', () => {
    expect(pageKeyAction({ key: ' ', target: target('button') }, 'paginated')).toBeNull();
    expect(pageKeyAction({ key: ' ', target: target('a[href]') }, 'paginated')).toBeNull();
    expect(pageKeyAction({ key: 'ArrowRight', target: target('button') }, 'paginated')).toBe('next');
    expect(pageKeyAction({ key: 'PageDown', target: target('button') }, 'paginated')).toBe('next');
  });

  it('copes with targets that are not elements', () => {
    expect(pageKeyAction({ key: 'ArrowRight', target: null }, 'paginated')).toBe('next');
    expect(pageKeyAction({ key: 'ArrowRight', target: {} as EventTarget }, 'paginated')).toBe('next');
  });

  it('swaps the arrows for right-to-left books, leaving the other keys alone', () => {
    expect(pageKeyAction({ key: 'ArrowLeft' }, 'paginated', true)).toBe('next');
    expect(pageKeyAction({ key: 'ArrowRight' }, 'paginated', true)).toBe('prev');
    expect(pageKeyAction({ key: 'ArrowLeft' }, 'scrolled', true)).toBe('next');
    expect(pageKeyAction({ key: 'PageDown' }, 'paginated', true)).toBe('next');
    expect(pageKeyAction({ key: ' ' }, 'paginated', true)).toBe('next');
    expect(pageKeyAction({ key: 'Home' }, 'paginated', true)).toBe('start');
  });
});
