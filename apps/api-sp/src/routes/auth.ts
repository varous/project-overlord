import type { FastifyInstance } from "fastify";
import { config, isProd } from "../config.js";
import { finishGoogleLogin, startGoogleLogin } from "../lib/oidc.js";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  readSessionId,
  setSessionCookie,
  upsertUserFromClaims,
  userFromRequest,
  verifiedHd,
  type IdTokenClaims,
} from "../lib/session.js";

const OIDC_COOKIE = "oidc";
const OIDC_MAX_AGE = 10 * 60; // 10 minutes to complete the round trip

function webOrigin(): string {
  return isProd ? config.PUBLIC_BASE_URL : "http://localhost:5173";
}

function loginPage(error?: string): string {
  const q = error ? `?error=${encodeURIComponent(error)}` : "";
  return `${webOrigin()}/login${q}`;
}

type OidcCookie = { state: string; nonce: string; codeVerifier: string };

/**
 * Google OIDC via openid-client. ~routes only — session/hd helpers live in lib/.
 * Paths: /api/auth/login | /callback | /logout | /me
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/login", async (_req, reply) => {
    const started = await startGoogleLogin();
    const payload: OidcCookie = {
      state: started.state,
      nonce: started.nonce,
      codeVerifier: started.codeVerifier,
    };
    void reply.setCookie(OIDC_COOKIE, JSON.stringify(payload), {
      path: "/api/auth",
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      signed: true,
      maxAge: OIDC_MAX_AGE,
    });
    return reply.redirect(started.url);
  });

  app.get("/callback", async (req, reply) => {
    const raw = req.cookies[OIDC_COOKIE];
    void reply.clearCookie(OIDC_COOKIE, { path: "/api/auth" });

    if (!raw) {
      return reply.redirect(loginPage("oidc_state"));
    }
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) {
      return reply.redirect(loginPage("oidc_state"));
    }

    let checks: OidcCookie;
    try {
      checks = JSON.parse(unsigned.value) as OidcCookie;
    } catch {
      return reply.redirect(loginPage("oidc_state"));
    }

    let claims: IdTokenClaims;
    try {
      const callbackUrl = new URL(req.url, config.PUBLIC_BASE_URL).toString();
      const tokenSet = await finishGoogleLogin(callbackUrl, checks);
      const c = tokenSet.claims();
      claims = { sub: String(c.sub) };
      if (typeof c.email === "string") claims.email = c.email;
      if (typeof c.name === "string") claims.name = c.name;
      if (typeof c.picture === "string") claims.picture = c.picture;
      if (typeof c.hd === "string") claims.hd = c.hd;
    } catch (err) {
      req.log.warn({ err: err instanceof Error ? err.message : "oidc_callback_failed" }, "oidc callback failed");
      return reply.redirect(loginPage("oidc_failed"));
    }

    // Security boundary: hd gate BEFORE any Organisation / User write.
    const hd = verifiedHd(claims);
    if (!hd) {
      return reply.redirect(loginPage("hd_rejected"));
    }

    const { user } = await upsertUserFromClaims(claims, hd);
    const meta: { userAgent?: string; ip?: string } = {};
    const ua = req.headers["user-agent"];
    if (typeof ua === "string") meta.userAgent = ua;
    if (req.ip) meta.ip = req.ip;
    const session = await createSession(user.id, meta);
    setSessionCookie(reply, session.id, session.expiresAt);
    return reply.redirect(webOrigin() + "/");
  });

  app.post("/logout", async (req, reply) => {
    const sid = readSessionId(req);
    if (sid) await destroySession(sid);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get("/me", async (req, reply) => {
    const user = await userFromRequest(req);
    if (!user) {
      return reply.code(401).send({ error: "unauthenticated", message: "Sign in required" });
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organisationId: user.organisationId,
    };
  });
}
