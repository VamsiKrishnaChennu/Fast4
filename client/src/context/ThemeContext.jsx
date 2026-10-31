import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'ff-theme';
const ThemeContext = createContext(null);

function readSaved() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-bs-theme', theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#121633' : '#EEF3FF');
}

/** Light or dark. Follows the phone until the player flips the switch; then remembers the choice. */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readSaved() ?? systemTheme());

  useEffect(() => {
    apply(theme);
  }, [theme]);

  useEffect(() => {
    if (readSaved()) return undefined;
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return undefined;
    const onChange = () => !readSaved() && setThemeState(systemTheme());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage can be unavailable; the choice then lasts for this visit only.
    }
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }),
    [theme, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
