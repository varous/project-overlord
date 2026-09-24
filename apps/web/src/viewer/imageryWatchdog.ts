/**
 * Post-mount imagery watchdog. Independent of the availability probe: even a provider that
 * probed fine can reject every tile afterwards (a referrer-restricted key, for example), and the
 * user would see a silent black globe. This counts imagery tile errors for the active stack and
 * decides when to fall back down the chain.
 *
 * PURE module: no Cesium, no DOM.
 */

export interface WatchdogInput {
  /** Tiles that have loaded successfully since the stack became active. */
  successes: number;
  /** Imagery tile errors since the stack became active. */
  failures: number;
  /** Milliseconds since the stack became active. */
  elapsedMs: number;
}

/** More than this many failures with zero successes inside the window means "unavailable". */
export const WATCHDOG_MAX_FAILURES = 5;
/** The watchdog window in milliseconds. */
export const WATCHDOG_WINDOW_MS = 10_000;

/** True when the active stack should be treated as unavailable and the chain should fall back. */
export function shouldFallBack(input: WatchdogInput): boolean {
  return (
    input.failures > WATCHDOG_MAX_FAILURES &&
    input.successes === 0 &&
    input.elapsedMs <= WATCHDOG_WINDOW_MS
  );
}
