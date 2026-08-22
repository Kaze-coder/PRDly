'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'prdgen.theme';

/** Applies the resolved theme to <html> and returns it. Client-only. */
function applyTheme(theme: Theme): Resolved {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  const el = document.documentElement;
  el.classList.toggle('dark', dark);
  el.style.colorScheme = dark ? 'dark' : 'light';
  return dark ? 'dark' : 'light';
}

function readStored(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // localStorage unavailable
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize from what the pre-paint script already decided — no flash, no mismatch.
  const [theme, setThemeState] = useState<Theme>(readStored);
  const [resolved, setResolved] = useState<Resolved>('light');

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore
    }
    setResolved(applyTheme(t));
  }, []);

  const toggle = useCallback(() => {
    setResolved((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      setThemeState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return applyTheme(next);
    });
  }, []);

  // Sync resolved on mount and react to OS changes while in "system".
  useEffect(() => {
    setResolved(applyTheme(theme));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (theme === 'system') setResolved(applyTheme('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/**
 * Blocking inline script — runs in <head> before first paint to set the `.dark`
 * class from storage / OS preference, preventing a flash of the wrong theme.
 * Keep the STORAGE_KEY here in sync with the constant above.
 */
export const themeNoFlashScript = `(function(){try{var k='prdgen.theme';var t=localStorage.getItem(k);var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=t==='dark'||((t==='system'||!t)&&m);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
