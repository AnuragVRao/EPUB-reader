import type { Rendition } from 'epubjs';
import type { ReaderSettings, ThemeName } from './types';
import { typographyCss } from './typography';
import { customPalette, type CustomColors } from './customTheme';
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

const TYPOGRAPHY_STYLE_ID = 'reader-typography';

// Creates or updates the chapter document's typography stylesheet.
function setTypographyCss(doc: Document | undefined, css: string): void {
  if (!doc?.head) return;
  let style = doc.getElementById(TYPOGRAPHY_STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = TYPOGRAPHY_STYLE_ID;
    doc.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

/**
 * `getSettings` is read each time a chapter document is created, so chapters
 * loaded later pick up the settings in force at that moment. `language` is the
 * book's declared language, used for documents that don't declare their own -
 * browsers only hyphenate text whose language they know.
 */
export interface ThemeContext {
  /** The book's declared language, for documents that don't declare their own. */
  language: () => string;
  /** True for a fixed-layout (pre-paginated) book. */
  fixedLayout: () => boolean;
}

export function registerThemes(rendition: Rendition, getSettings: () => ReaderSettings, context: ThemeContext): void {
  const fontCss = dyslexicFontFaceCss();
  rendition.hooks.content.register((contents: { document: Document }) => {
    const doc = contents.document;
    if (!doc?.head) return;
    if (!doc.getElementById('reader-fonts')) {
      const style = doc.createElement('style');
      style.id = 'reader-fonts';
      style.textContent = fontCss;
      doc.head.appendChild(style);
    }
    const root = doc.documentElement;
    if (context.fixedLayout()) {
      // When it scales a fixed-layout page to fit, epub.js sets the page
      // body's background to transparent (inline, before this hook runs), so
      // the publisher's page colour would vanish and the reader's own page
      // colour show through. Read the book's colour from under that override
      // and put it on <html>, which epub.js leaves alone.
      const body = doc.body;
      const inline = body.style.getPropertyValue('background-color');
      body.style.removeProperty('background-color');
      const background = doc.defaultView?.getComputedStyle(body).backgroundColor;
      if (inline) body.style.setProperty('background-color', inline);
      if (background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
        root.style.backgroundColor = background;
      }
      return;
    }
    const lang = context.language();
    if (lang && !root.getAttribute('lang') && !root.getAttribute('xml:lang')) root.setAttribute('lang', lang);
    setTypographyCss(doc, typographyCss(getSettings()));
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

/**
 * (Re)defines the 'custom' theme from the reader's colours. epub.js appends a
 * re-registered theme's rules to its existing stylesheet rather than replacing
 * them, so the old sheet is removed from each chapter document first -
 * otherwise every colour change would pile up another copy.
 */
export function registerCustomTheme(rendition: Rendition, colors: CustomColors): void {
  const contents = rendition.getContents() as unknown as Array<{ document?: Document }> | undefined;
  for (const content of contents ?? []) content.document?.getElementById('epubjs-inserted-css-custom')?.remove();
  const p = customPalette(colors);
  rendition.themes.register('custom', {
    body: { background: p.page, color: p.text },
    a: { color: `${p.link} !important` },
    'a:link, a:link *': { color: `${p.link} !important` },
    ...scrollbarRules(p.scrollbarThumb),
  });
}

// `theme` is the resolved theme - `settings.theme` may be 'auto', which
// epub.js has no registered theme for.
//
// A fixed-layout book is left exactly as designed: its pages are laid out
// like printed pages, and reader colours, fonts or line spacing would break
// them. Only reflowable books get the theme and text settings.
export function applyThemeAndFonts(
  rendition: Rendition,
  settings: ReaderSettings,
  theme: ThemeName,
  fixedLayout = false,
): void {
  if (fixedLayout) return;
  if (theme === 'custom') registerCustomTheme(rendition, settings.customColors);
  rendition.themes.select(theme);
  rendition.themes.fontSize(`${settings.fontSize}%`);
  rendition.themes.font(FONT_STACKS[settings.fontFamily]);
  rendition.themes.override('line-height', `${settings.lineSpacing}`, true);
  rendition.themes.override('text-align', settings.justify ? 'justify' : 'start', true);

  // Chapters already on screen; ones created later get it from the content hook.
  const css = typographyCss(settings);
  const contents = rendition.getContents() as unknown as Array<{ document?: Document }> | undefined;
  for (const content of contents ?? []) setTypographyCss(content.document, css);
}
