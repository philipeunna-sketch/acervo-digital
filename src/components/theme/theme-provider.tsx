"use client";

import * as React from "react";

/**
 * Provedor de tema (claro/escuro) sem dependencias externas.
 *
 * - `dark` e o tema inicial da aplicacao;
 * - a preferencia fica no localStorage (`acervo-theme`);
 * - um script inline no layout raiz evita o flash de tema incorreto.
 */

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "acervo-theme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [theme, setThemeState] = React.useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">("dark");

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial: Theme = stored ?? "dark";
    setThemeState(initial);
    applyTheme(initial, setResolvedTheme);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next, setResolvedTheme);
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function applyTheme(theme: Theme, setResolved: (value: "light" | "dark") => void): void {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  setResolved(resolved);
}

export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext);
}

/** Script inline para aplicar o tema antes da hidratacao (evita FOUC). */
export const themeScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||'dark';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=d?'dark':'light';document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=r;}catch(e){document.documentElement.classList.add('dark');}})();`;
