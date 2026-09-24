/**
 * E2E auth seam — mints a signed session cookie WITHOUT Google.
 *
 * Deliberately a script, not an HTTP route: there is no endpoint to exploit in
 * a running server, so this adds zero production attack surface. It refuses to
 * run when NODE_ENV=production.
 *
 * Writes a Playwright storageState file. Never prints secrets.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { db } from "../lib/db.js";
import { createSession, SESSION_COOKIE } from "../lib/session.js";

const require = createRequire(import.meta.url);
const { Signer } = require("@fastify/cookie/signer") as {
  Signer: new (secret: string) => { sign: (v: string) => string };
};

if (config.NODE_ENV === "production") {
  console.error("[e2e-session] refusing to run with NODE_ENV=production");
  process.exit(1);
}

const E2E_SUB = process.env.E2E_SUB ?? "e2e|playwright-test-user";
const E2E_EMAIL_LOCAL = process.env.E2E_EMAIL_LOCAL ?? "e2e";
const E2E_NAME = process.env.E2E_NAME ?? "E2E Test User";
const E2E_STATE_FILE = process.env.E2E_STATE_FILE ?? "state.json";

async function main(): Promise<void> {
  const hd = config.ALLOWED_HD;

  const org = await db.organisation.upsert({
    where: { hd },
    create: { hd, name: hd },
    update: {},
  });

  const user = await db.user.upsert({
    where: { googleSub: E2E_SUB },
    create: {
      organisationId: org.id,
      email: `${E2E_EMAIL_LOCAL}@${hd}`,
      name: E2E_NAME,
      googleSub: E2E_SUB,
      lastSeenAt: new Date(),
    },
    update: { lastSeenAt: new Date() },
    select: { id: true, email: true },
  });

  /**
   * QA-15: projects are ORG-scoped, so every test run piled its throwaway
   * projects into the same dashboard a real person uses. Clear this user's
   * projects each run — only ever this user's, never anyone else's.
   */
  const purged = await db.project.deleteMany({ where: { ownerId: user.id } });

  const session = await createSession(user.id, { userAgent: "playwright-e2e" });
  const signed = new Signer(config.SESSION_SECRET).sign(session.id);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../../../..");
  const outDir = path.join(root, "e2e", ".auth");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    path.join(outDir, E2E_STATE_FILE),
    JSON.stringify(
      {
        cookies: [
          {
            name: SESSION_COOKIE,
            value: signed,
            domain: "localhost",
            path: "/",
            expires: Math.floor(session.expiresAt.getTime() / 1000),
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
      null,
      2,
    ) + "\n",
  );

  console.log(
    `[e2e-session] storageState written for ${user.email} (org ${org.hd}); ` +
      `purged ${purged.count} previous test project(s)`,
  );
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("[e2e-session] failed:", err instanceof Error ? err.message : err);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
