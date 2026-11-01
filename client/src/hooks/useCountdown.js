import { useEffect, useState } from 'react';
import { serverNow } from '../utils/serverClock.js';

/**
 * Milliseconds left until `endsAt` (ISO string or ms), by the server's clock. Ticks every 250 ms
 * and stops at zero. Cleans up its timer.
 * @param {string|number|null} endsAt
 * @returns {number}
 */
export function useCountdown(endsAt) {
  const target = endsAt ? new Date(endsAt).getTime() : null;
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (target === null) return undefined;
    const tick = () => {
      const current = serverNow();
      setNow(current);
      if (current >= target) clearInterval(id);
    };
    const id = setInterval(tick, 250);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [target]);
  return target === null ? 0 : Math.max(0, target - now);
}

/** True when the player asked their device for less motion. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
