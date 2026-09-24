import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { TokenSet } from "openid-client";
import { db } from "../src/lib/db.js";
import { config } from "../src/config.js";
import { verifiedHd, type IdTokenClaims } from "../src/lib/session.js";

const finishGoogleLogin = vi.fn();
const startGoogleLogin = vi.fn();

vi.mock("../src/lib/oidc.js", () => ({
  finishGoogleLogin: (...args: unknown[]) => finishGoogleLogin(...args),
  startGoogleLogin: (...args: unknown[]) => startGoogleLogin(...args),
  redirectUri: () => `${process.env.PUBLIC_BASE_URL}/api/auth/callback`,
  getGoogleClient: vi.fn(),
  setGoogleClientForTests: vi.fn(),
}));

import { buildApp } from "../src/app.js";

function tokenSetWith(claims: IdTokenClaims): TokenSet {
  return {
    claims: () => ({ ...claims, iss: "https://accounts.google.com", aud: "x" }),
  } as unknown as TokenSet;
}

async function loginWithClaims(app: FastifyInstance, claims: IdTokenClaims) {
  startGoogleLogin.mockResolvedValue({
    url: "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    state: "state-x",
    nonce: "nonce-x",
    codeVerifier: "verifier-x",
  });
  finishGoogleLogin.mockResolvedValue(tokenSetWith(claims));

  const login = await app.inject({ method: "GET", url: "/api/auth/login" });
  const oidc = login.cookies.find((c) => c.name === "oidc");
  expect(oidc).toBeTruthy();

  return app.inject({
    method: "GET",
    url: "/api/auth/callback?code=abc&state=state-x",
    cookies: { oidc: oidc!.value },
  });
}

describe("verifiedHd", () => {
  it("rejects missing hd", () => {
    expect(verifiedHd({ sub: "1" })).toBeNull();
  });

  it("rejects wrong hd", () => {
    expect(verifiedHd({ sub: "1", hd: "evil.example" })).toBeNull();
  });

  it("accepts ALLOWED_HD", () => {
    expect(verifiedHd({ sub: "1", hd: config.ALLOWED_HD })).toBe(config.ALLOWED_HD);
  });
});

describe("auth routes", () => {
  let app: FastifyInstance;
  const logLines: string[] = [];

  beforeAll(async () => {
    app = await buildApp({
      logger: {
        level: "debug",
        stream: {
          write(msg: string) {
            logLines.push(msg);
          },
        },
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  beforeEach(async () => {
    logLines.length = 0;
    finishGoogleLogin.mockReset();
    startGoogleLogin.mockReset();
    await db.showItem.deleteMany();
    await db.layout.deleteMany();
    await db.project.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.organisation.deleteMany();
  });

  it("GET /me without cookie returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects wrong hd: no Organisation, no session cookie", async () => {
    const beforeOrgs = await db.organisation.count();
    const cb = await loginWithClaims(app, {
      sub: "google-sub-evil",
      email: "x@evil.example",
      name: "Evil",
      hd: "evil.example",
    });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toContain("error=hd_rejected");
    expect(cb.cookies.find((c) => c.name === "sid")).toBeUndefined();
    expect(await db.organisation.count()).toBe(beforeOrgs);
    expect(await db.session.count()).toBe(0);
  });

  it("rejects missing hd: no Organisation row", async () => {
    const beforeOrgs = await db.organisation.count();
    const cb = await loginWithClaims(app, {
      sub: "google-sub-nohd",
      email: "x@clockwork-av.com",
      name: "NoHd",
    });
    expect(cb.headers.location).toContain("error=hd_rejected");
    expect(await db.organisation.count()).toBe(beforeOrgs);
  });

  it("happy path: upserts org+user, sets sid, /me works", async () => {
    const cb = await loginWithClaims(app, {
      sub: "google-sub-ok",
      email: "joy@clockwork-av.com",
      name: "Joy",
      hd: "clockwork-av.com",
    });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe("http://localhost:5173/");

    const sid = cb.cookies.find((c) => c.name === "sid");
    expect(sid?.value.length).toBeGreaterThan(10);

    const org = await db.organisation.findUnique({ where: { hd: "clockwork-av.com" } });
    expect(org).toBeTruthy();
    expect(await db.user.findUnique({ where: { googleSub: "google-sub-ok" } })).toMatchObject({
      email: "joy@clockwork-av.com",
    });
    expect(await db.session.count()).toBe(1);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { sid: sid!.value },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      email: "joy@clockwork-av.com",
      name: "Joy",
      organisationId: org!.id,
    });
  });

  it("logout destroys session; /me then 401", async () => {
    const cb = await loginWithClaims(app, {
      sub: "google-sub-lo",
      email: "lo@clockwork-av.com",
      name: "Lo",
      hd: "clockwork-av.com",
    });
    const sid = cb.cookies.find((c) => c.name === "sid")!;

    const out = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { sid: sid.value },
    });
    expect(out.statusCode).toBe(204);
    expect(await db.session.count()).toBe(0);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { sid: sid.value },
    });
    expect(me.statusCode).toBe(401);
  });

  it("QA-22: bodyless POST logout with JSON Content-Type", async () => {
    const cb = await loginWithClaims(app, {
      sub: "google-sub-jsonct",
      email: "jsonct@clockwork-av.com",
      name: "JsonCt",
      hd: "clockwork-av.com",
    });
    const sid = cb.cookies.find((c) => c.name === "sid")!;
    const out = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { sid: sid.value },
      headers: { "content-type": "application/json" },
    });
    expect(out.statusCode).toBe(400);
  });

  it("expired session returns 401", async () => {
    const cb = await loginWithClaims(app, {
      sub: "google-sub-exp",
      email: "exp@clockwork-av.com",
      name: "Exp",
      hd: "clockwork-av.com",
    });
    const sid = cb.cookies.find((c) => c.name === "sid")!;
    const row = await db.session.findFirstOrThrow();
    await db.session.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { sid: sid.value },
    });
    expect(me.statusCode).toBe(401);
  });

  it("never logs GOOGLE_CLIENT_SECRET or SESSION_SECRET", async () => {
    await loginWithClaims(app, {
      sub: "google-sub-log",
      email: "log@clockwork-av.com",
      name: "Log",
      hd: "clockwork-av.com",
    });
    await loginWithClaims(app, {
      sub: "google-sub-bad",
      email: "bad@evil.example",
      name: "Bad",
      hd: "evil.example",
    });
    await app.inject({ method: "GET", url: "/api/auth/me" });

    const blob = logLines.join("\n");
    expect(blob).not.toContain(config.GOOGLE_CLIENT_SECRET);
    expect(blob).not.toContain(config.SESSION_SECRET);
    expect(blob).not.toContain(process.env.GOOGLE_CLIENT_SECRET!);
    expect(blob).not.toContain(process.env.SESSION_SECRET!);
  });
});
