import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { serviceWorker } from './pwa/vite-plugin-sw.ts'
import { DICTIONARY_ORIGIN } from './src/lib/dictionary.ts'

// EPUBs are untrusted HTML rendered in same-origin iframes, which inherit this
// policy. It keeps the "nothing leaves the browser" promise enforceable: no
// script but the app's own bundle, and no request to any other origin - a
// book cannot load a remote image, font or stylesheet, or phone home. The
// only remote address allowed is the dictionary's, for `fetch` alone.
// `blob:`/`data:` are needed because epub.js rewrites a book's own images,
// fonts and stylesheets to blob URLs, and 'unsafe-inline' styles because book
// markup and epub.js's theme injection both rely on inline CSS.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' blob: data:",
  "img-src 'self' blob: data:",
  "font-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  // The opt-in dictionary is the one exception to "nothing leaves the
  // browser". Book iframes inherit this too, but can't run script to use it.
  `connect-src 'self' blob: data: ${DICTIONARY_ORIGIN}`,
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

// Build only: the dev server needs inline scripts and a websocket for HMR,
// both of which this policy forbids.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'reader-content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative, so the built site works from any path - the root of a domain or
  // a GitHub Pages project sub-path - without being told which.
  base: './',
  plugins: [react(), contentSecurityPolicy(), serviceWorker()],
  test: {
    // The tests cover the storage layer only, so plain Node is enough; the
    // browser storage APIs they need are stubbed per test file.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
