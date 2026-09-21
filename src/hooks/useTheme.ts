import { useEffect, useState } from "react";

type Theme = "light" | "dark";

// The preference is shared with the www marketing site through a cookie on the
// parent domain. localStorage cannot cross the www.openscorm.com /
// app.openscorm.com origin boundary, so the cookie is the carrier and
// localStorage is only a same-origin fallback for when cookies are refused.
const KEY = "theme";
const MAX_AGE = 60 * 60 * 24 * 365;

function readCookie(): Theme | null {
  const match = document.cookie.match(/(?:^|;\s*)theme=(dark|light)\b/);
  return match ? (match[1] as Theme) : null;
}

function writeCookie(theme: Theme) {
  // The domain attribute only applies on the real site. localhost rejects a
  // .openscorm.com cookie outright, so dev falls back to a host-only cookie.
  const domain = location.hostname.endsWith("openscorm.com") ? "; domain=.openscorm.com" : "";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${KEY}=${theme}; path=/; max-age=${MAX_AGE}; SameSite=Lax${domain}${secure}`;
}

// Resolution order must stay in sync with the inline bootstrap in index.html,
// which runs first to avoid a flash of the wrong theme before React mounts.
function readInitial(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = readCookie() ?? (localStorage.getItem(KEY) as Theme | null);
  if (stored === "light" || stored === "dark") return stored;
  // No explicit choice anywhere: follow the OS, matching the www 'system'
  // default (config.yaml ui.theme).
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  // Persist only on an explicit choice, the same way www writes localStorage
  // only from its toggle handler. Writing on mount would freeze an OS-derived
  // default into stored state and stop the app tracking later OS changes.
  function choose(next: Theme) {
    setTheme(next);
    localStorage.setItem(KEY, next);
    writeCookie(next);
  }

  return {
    theme,
    toggle: () => choose(theme === "dark" ? "light" : "dark"),
    set: choose,
  };
}
