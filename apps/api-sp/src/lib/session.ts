import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role, User } from "@prisma/client";
import { config, isProd } from "../config.js";
import { db } from "./db.js";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 14;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "organisationId">;

export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionCookieOpts(maxAgeSec: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    signed: true,
    maxAge: maxAgeSec,
  };
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<{ id: string; expiresAt: Date }> {
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: {
      id,
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
      ip: meta.ip?.slice(0, 64) ?? null,
    },
  });
  return { id, expiresAt };
}

export function setSessionCookie(reply: FastifyReply, sessionId: string, expiresAt: Date): void {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  void reply.setCookie(SESSION_COOKIE, sessionId, sessionCookieOpts(maxAge));
}

export function clearSessionCookie(reply: FastifyReply): void {
  void reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

export function readSessionId(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const parsed = req.unsignCookie(raw);
  if (!parsed.valid || !parsed.value) return null;
  return parsed.value;
}

export async function userFromRequest(req: FastifyRequest): Promise<SessionUser | null> {
  const sid = readSessionId(req);
  if (!sid) return null;
  const row = await db.session.findUnique({
    where: { id: sid },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, organisationId: true } },
    },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    if (row) await db.session.delete({ where: { id: sid } }).catch(() => undefined);
    return null;
  }
  return row.user;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

/** Attach req.user or 401. Use on mutating / tenant-scoped routes. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await userFromRequest(req);
  if (!user) {
    return reply.code(401).send({ error: "unauthenticated", message: "Sign in required" });
  }
  req.user = user;
}

export type IdTokenClaims = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  hd?: string;
};

/**
 * Server-side hosted-domain gate. Call BEFORE any Organisation/User upsert.
 * Returns the verified hd string, or null if the claim is missing/wrong.
 */
export function verifiedHd(claims: IdTokenClaims): string | null {
  if (typeof claims.hd !== "string" || claims.hd.length === 0) return null;
  if (claims.hd !== config.ALLOWED_HD) return null;
  return claims.hd;
}

/**
 * Upsert org (keyed on verified hd) and user (keyed on Google sub).
 * Must only be called after verifiedHd() succeeds.
 */
export async function upsertUserFromClaims(
  claims: IdTokenClaims,
  hd: string,
): Promise<{ user: SessionUser; role: Role }> {
  const org = await db.organisation.upsert({
    where: { hd },
    create: { hd, name: hd },
    update: {},
  });

  const email = claims.email ?? `${claims.sub}@${hd}`;
  const name = claims.name ?? email;

  const user = await db.user.upsert({
    where: { googleSub: claims.sub },
    create: {
      organisationId: org.id,
      email,
      name,
      pictureUrl: claims.picture ?? null,
      googleSub: claims.sub,
      lastSeenAt: new Date(),
    },
    update: {
      email,
      name,
      pictureUrl: claims.picture ?? null,
      lastSeenAt: new Date(),
    },
    select: { id: true, email: true, name: true, role: true, organisationId: true },
  });

  return { user, role: user.role };
}
