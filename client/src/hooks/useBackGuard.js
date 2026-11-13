import { useCallback, useEffect, useRef } from 'react';

/**
 * Makes the phone's Back button (and the browser's) ask first instead of leaving a screen.
 *
 * While `active`, one extra history entry sits on top of the page. Pressing Back removes it, so
 * the hook puts it back and calls `onBack`, and the player stays on the page. To really leave,
 * call the returned `exit(then)` instead of navigating directly: it removes the extra entry
 * first and then runs `then`, so no stray copy of the page is left in the history.
 *
 * @param {boolean} active
 * @param {(exit: (then: () => void) => void) => void} onBack called when Back is pressed; gets `exit`
 * @returns {(then: () => void) => void} exit
 */
export function useBackGuard(active, onBack) {
  const onBackRef = useRef(onBack);
  const armed = useRef(false);

  const exit = useCallback((then) => {
    if (!window.history.state?.ffGuard) {
      then();
      return;
    }
    armed.current = false;
    window.addEventListener('popstate', () => then(), { once: true });
    window.history.back();
  }, []);

  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!active) return undefined;
    // React's StrictMode runs effects twice in development; one guard entry is enough.
    if (!window.history.state?.ffGuard) {
      window.history.pushState({ ...window.history.state, ffGuard: true }, '');
    }
    armed.current = true;
    const onPop = () => {
      if (!armed.current) return;
      window.history.pushState({ ...window.history.state, ffGuard: true }, '');
      onBackRef.current(exit);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      armed.current = false;
    };
  }, [active, exit]);

  return exit;
}
