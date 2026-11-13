/**
 * Registers the service worker in the production build only, so development and tests are never
 * served stale files. Failure is harmless: the app simply works online only.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
