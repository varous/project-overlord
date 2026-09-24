/**
 * Theme is a single attribute on <html>; everything else cascades from the
 * custom properties in design-system.css (§7). No component reads a colour.
 *
 * App-wide (QA-05): one localStorage key, default light, OS preference ignored.
 * The editor toggle must change every screen — never a per-route theme.
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "showplan.theme.v2";

/**
 * QA-13: the pre-QA-05 build derived the theme from the OS and persisted it
 * under this key. Those users never chose dark — they inherited it — so the
 * value must not survive into the app-wide, default-light behaviour. Versioning
 * the key retires the poisoned value once, without touching a real preference
 * set after the fix.
 */
const LEGACY_THEME_STORAGE_KEY = "showplan.theme";

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    // One-time retirement of the OS-derived legacy value.
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    /* private mode / SSR — fall through */
  }
  return "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
  // Konva does not observe CSS. Tell it explicitly.
  window.dispatchEvent(new CustomEvent("showplan:themechange", { detail: theme }));
}

/** Call once at app boot so dashboard, sign-in and editor share one decision. */
export function bootTheme(): Theme {
  const theme = getTheme();
  applyTheme(theme);
  return theme;
}
