// Installable-app plumbing: the offline service worker and opening .epub
// files the operating system hands to the installed app.

/**
 * Registers the service worker that caches the app for offline use. Only in
 * production builds: the dev server has no service worker to register, and a
 * cache in front of it would fight hot reloading.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => {
    // BASE_URL is relative ('./'), so this resolves next to the page wherever
    // the site is served from, and the worker's scope is that directory.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err: unknown) => {
      // Offline support is a bonus; the reader works without it.
      console.warn('Could not register the service worker', err);
    });
    // The worker that served this page keeps the previous version's cache
    // around for tabs still running it; tell it this page is up, so it can
    // drop that cache if no such tab is left.
    navigator.serviceWorker.controller?.postMessage('page-loaded');
  };
  // After load, so caching the app doesn't compete with showing it.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

interface LaunchParams {
  files?: ReadonlyArray<{ getFile: () => Promise<File> }>;
}

interface LaunchQueue {
  setConsumer: (consumer: (params: LaunchParams) => void) => void;
}

/**
 * Calls `open` with the file when the installed app is launched by opening an
 * .epub from the operating system (File Handling API; Chromium only, declared
 * under `file_handlers` in the web manifest). A no-op elsewhere.
 */
export function onLaunchedWithFile(open: (file: File) => void): void {
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer((params) => {
    const handle = params.files?.[0];
    if (!handle) return;
    handle
      .getFile()
      .then(open)
      .catch((err: unknown) => console.warn('Could not read the launched file', err));
  });
}
