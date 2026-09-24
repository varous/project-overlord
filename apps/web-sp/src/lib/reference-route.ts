/**
 * `/_reference` is a visual-regression shell with every capability on.
 * ADR-008: it exists only in Vite DEV. Production builds must not serve it —
 * share links (slice 8) would otherwise leak the unfinished V2 chrome.
 */
export const REFERENCE_PATH = "/_reference";

export function isDevReferenceRoute(path: string, isDev: boolean): boolean {
  return isDev && path === REFERENCE_PATH;
}
