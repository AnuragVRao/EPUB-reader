import type { Rendition } from 'epubjs';
import type { ReaderSettings, ThemeName } from './types';
import dyslexic400 from '@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2?url';
import dyslexic400Italic from '@fontsource/opendyslexic/files/opendyslexic-latin-400-italic.woff2?url';
import dyslexic700 from '@fontsource/opendyslexic/files/opendyslexic-latin-700-normal.woff2?url';
import dyslexic700Italic from '@fontsource/opendyslexic/files/opendyslexic-latin-700-italic.woff2?url';

// Book content lives in iframes that can't see the app's stylesheets, so the
// bundled OpenDyslexic faces are injected into each one. URLs are made
// absolute because the iframe documents have a different base URL. Browsers
// only download a face once text actually uses it.
const DYSLEXIC_FACES: Array<[url: string, weight: number, style: string]> = [
  [dyslexic400, 400, 'normal'],
  [dyslexic400Italic, 400, 'italic'],
  [dyslexic700, 700, 'normal'],
  [dyslexic700Italic, 700, 'italic'],
];

function dyslexicFontFaceCss(): string {
  return DYSLEXIC_FACES.map(
    ([url, weight, style]) =>
      `@font-face{font-family:"OpenDyslexic";font-style:${style};font-weight:${weight};font-display:swap;` +
      `src:url("${new URL(url, window.location.href).href}") format("woff2");}`,
  ).join('\n');
}

const FONT_STACKS: Record<ReaderSettings['fontFamily'], string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  dyslexic: '"OpenDyslexic", "Comic Sans MS", sans-serif',
};

const THEME_STYLES = {
  light: { body: { background: '#faf8f5', color: '#1c1c1c' } },
  dark: { body: { background: '#1a1a1a', color: '#dcdcdc' } },
  sepia: { body: { background: '#f3e6d0', color: '#3a2f22' } },
};

function scrollbarRules(thumb: string) {
  return {
    html: { 'scrollbar-width': 'thin', 'scrollbar-color': `${thumb} transparent` },
    '::-webkit-scrollbar': { width: '10px', height: '10px' },
    '::-webkit-scrollbar-track': { background: 'transparent' },
    '::-webkit-scrollbar-thumb': { background: thumb, 'border-radius': '8px', 'border': '2px solid transparent' },
    '::-webkit-scrollbar-thumb:hover': { background: thumb },
  };
}

export function registerThemes(rendition: Rendition): void {
  const fontCss = dyslexicFontFaceCss();
  rendition.hooks.content.register((contents: { document: Document }) => {
    const doc = contents.document;
    if (!doc?.head || doc.getElementById('reader-fonts')) return;
    const style = doc.createElement('style');
    style.id = 'reader-fonts';
    style.textContent = fontCss;
    doc.head.appendChild(style);
  });

  rendition.themes.register('light', {
    body: { background: THEME_STYLES.light.body.background, color: THEME_STYLES.light.body.color },
    a: { color: '#3465a4 !important' },
    ...scrollbarRules('rgba(28, 27, 25, 0.28)'),
  });
  rendition.themes.register('dark', {
    body: { background: THEME_STYLES.dark.body.background, color: THEME_STYLES.dark.body.color },
    a: { color: '#8ab4f8 !important' },
    'a:link, a:link *': { color: '#8ab4f8 !important' },
    ...scrollbarRules('rgba(255, 255, 255, 0.22)'),
  });
  rendition.themes.register('sepia', {
    body: { background: THEME_STYLES.sepia.body.background, color: THEME_STYLES.sepia.body.color },
    a: { color: '#7a4a1f !important' },
    ...scrollbarRules('rgba(58, 47, 34, 0.32)'),
  });
}

// `theme` is the resolved theme - `settings.theme` may be 'auto', which
// epub.js has no registered theme for.
export function applyThemeAndFonts(rendition: Rendition, settings: ReaderSettings, theme: ThemeName): void {
  rendition.themes.select(theme);
  rendition.themes.fontSize(`${settings.fontSize}%`);
  rendition.themes.font(FONT_STACKS[settings.fontFamily]);
  rendition.themes.override('line-height', `${settings.lineSpacing}`, true);
  rendition.themes.override('text-align', settings.justify ? 'justify' : 'start', true);
}
