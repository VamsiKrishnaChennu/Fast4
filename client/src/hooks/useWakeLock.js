import { useEffect } from 'react';

/**
 * Keeps the screen on while `active` (a round is being written). Where the Screen Wake Lock API
 * does not exist, or refuses, nothing happens. The lock is taken again when the player returns
 * to the tab, because the browser drops it in the background.
 * @param {boolean} active
 */
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let stopped = false;
    const take = async () => {
      try {
        const next = await navigator.wakeLock.request('screen');
        if (stopped) next.release().catch(() => {});
        else lock = next;
      } catch {
        // Refused (low battery, permissions policy): the screen may dim, nothing else.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) take();
    };
    take();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
