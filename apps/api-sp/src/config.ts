import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/**
 * Local `.env` lives at the monorepo root. Workspace `npm run` does not load it
 * into process.env — without this, every clone fails boot with missing keys.
 * Production (Render) injects real env vars; never let a file override them.
 */
if (process.env.NODE_ENV !== "production") {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  loadDotenv({ path: path.join(root, ".env"), override: false, quiet: true });
}

/**
 * Fail fast and loudly on missing configuration. A container that starts with
 * a half-configured environment is worse than one that refuses to start.
 * Every value here is set in Render > Environment in production.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  PUBLIC_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  /** Hosted-domain gate. Only ID tokens with this hd claim are accepted. */
  ALLOWED_HD: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be >= 32 chars"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Print the failing KEYS only. Never print values - they are secrets.
  const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  console.error(`[config] invalid or missing environment variables: ${keys}`);
  console.error("[config] see .env.example; in production set these in Render > Environment");
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === "production";
