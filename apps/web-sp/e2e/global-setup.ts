import { execFileSync } from "node:child_process";

/**
 * Mints a session cookie without Google. NODE_ENV is forced to development —
 * the seam script refuses to run in production, and some shells export
 * NODE_ENV=production globally.
 */
function mint(extra: Record<string, string>): void {
  execFileSync("npx", ["tsx", "packages/api/src/scripts/e2e-session.ts"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development", ...extra },
  });
}

export default function globalSetup(): void {
  mint({});
  // Sacrificial session: Sign out destroys the cookie server-side. Sharing
  // the suite's storageState would 401 every later test.
  mint({
    E2E_SUB: "e2e|logout-victim",
    E2E_EMAIL_LOCAL: "e2e-logout",
    E2E_NAME: "E2E Logout Victim",
    E2E_STATE_FILE: "logout-state.json",
  });
}
