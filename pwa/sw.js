// Service worker: makes the reader work with no connection.
//
// This file is a template. The build (pwa/vite-plugin-sw.ts) replaces the two
// placeholders below with the list of files in dist/ and a hash of their
// contents, and writes the result to dist/sw.js. Any change to the site
// therefore changes this file, which is what makes browsers pick up a new
// version. It is not used by the dev server.
//
// Everything is addressed relative to the worker's own scope, so the site
// works from a sub-path (e.g. GitHub Pages) without configuration.

const VERSION = '__SW_VERSION__';
const PRECACHE = __SW_PRECACHE__;

const CACHE_PREFIX = 'epub-reader-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;
const SCOPE = self.registration.scope;
const INDEX = new URL('index.html', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload` bypasses the HTTP cache, so a new version never precaches a
      // stale copy of a file.
      await cache.addAll(PRECACHE.map((path) => new Request(new URL(path, SCOPE).href, { cache: 'reload' })));
      // Take over without waiting for every tab to close. Pages still running
      // the previous version keep working: its cache is left in place (see
      // removeOldCaches) and lookups below search every cache.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Deletes caches from earlier versions. Each page asks for this once it has
// loaded (src/lib/pwa.ts), and it only happens when that page is the only
// one open: it was served from the current cache, whereas a second, older
// tab may still need to lazy-load files that only exist in the old one.
self.addEventListener('message', (event) => {
  if (event.data === 'page-loaded') event.waitUntil(removeOldCaches());
});

async function removeOldCaches() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (windows.length > 1) return;
  for (const key of await caches.keys()) {
    if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // Only the site's own files. blob: and data: URLs (book content) never
  // reach here, and nothing else is ever requested.
  if (!request.url.startsWith(SCOPE)) return;

  const isPageLoad = request.mode === 'navigate';

  event.respondWith(
    (async () => {
      const current = await caches.open(CACHE);
      const url = new URL(request.url);
      // The app is a single page: the scope root is index.html.
      const key = isPageLoad && (url.href === SCOPE || url.pathname.endsWith('/')) ? INDEX : request;
      const cached = (await current.match(key)) ?? (await caches.match(key));
      return cached ?? fetch(request);
    })(),
  );
});
