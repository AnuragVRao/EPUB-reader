import { describe, expect, it } from 'vitest';
import { typographyCss } from './typography';

describe('typographyCss', () => {
  it('is empty at the defaults, leaving the book styled as published', () => {
    expect(typographyCss({ paragraphSpacing: null, hyphenate: false })).toBe('');
  });

  it('sets the gap between paragraphs', () => {
    const css = typographyCss({ paragraphSpacing: 1, hyphenate: false });
    expect(css).toContain('margin-bottom:1em !important');
    expect(css).not.toContain('text-indent');
    expect(css).not.toContain('hyphens');
  });

  it('indents paragraphs when the gap is removed', () => {
    const css = typographyCss({ paragraphSpacing: 0, hyphenate: false });
    expect(css).toContain('margin-bottom:0em !important');
    expect(css).toContain('text-indent:1.5em !important');
  });

  it('turns on hyphenation independently of spacing', () => {
    const css = typographyCss({ paragraphSpacing: null, hyphenate: true });
    expect(css).toContain('hyphens:auto !important');
    expect(css).not.toContain('margin-bottom');
  });

  it('combines both settings', () => {
    const css = typographyCss({ paragraphSpacing: 0.5, hyphenate: true });
    expect(css).toContain('margin-bottom:0.5em !important');
    expect(css).toContain('hyphens:auto !important');
  });
});
