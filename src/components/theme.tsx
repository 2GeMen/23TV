'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/** Two explicit themes, persisted across visits. Legacy system selection becomes light. */
export type ThemeChoice = 'light' | 'dark';
const STORAGE_KEY = '23tv-theme';
function readTheme(): ThemeChoice {
  try { return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

interface ThemeContextValue {
  theme: ThemeChoice;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  resolved: 'light',
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function apply(choice: ThemeChoice): ThemeChoice {
  document.documentElement.classList.toggle('dark', choice === 'dark');
  return choice;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>('light');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = readTheme();
    setThemeState(stored);
    setResolved(apply(stored));

  }, []);

  const setTheme = useCallback((t: ThemeChoice) => {
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* Private storage may be unavailable. */ }
    setThemeState(t);
    setResolved(apply(t));
  }, []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

/** Icons describe the action: moon enters dark, sun enters light. */
export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? '切换为暗色模式' : '切换为明亮模式';
  return <button className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
    title={label} aria-label={label} onClick={() => setTheme(next)}>
    {next === 'dark' ? <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg> : <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>}
  </button>;
}
