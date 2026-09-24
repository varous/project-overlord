import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { db } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { createSession, SESSION_COOKIE } from "../src/lib/session.js";

async function seedUser(email: string, hd: string, role: "ADMIN" | "MEMBER" = "MEMBER") {
  const org = await db.organisation.upsert({
    where: { hd },
    create: { hd, name: hd },
    update: {},
  });
  return db.user.upsert({
    where: { email },
    create: {
      organisationId: org.id,
      email,
      name: email.split("@")[0]!,
      googleSub: `sub-${email}`,
      role,
    },
    update: { organisationId: org.id, role },
  });
}

describe("GET /api/catalogue/packages — no rates, any role", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  beforeEach(async () => {
    await db.showItem.deleteMany();
    await db.instance.deleteMany();
    await db.variantLine.deleteMany();
    await db.variant.deleteMany();
    await db.baseMap.deleteMany();
    await db.level.deleteMany();
    await db.layout.deleteMany();
    await db.project.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.organisation.deleteMany();
  });

  async function cookieFor(role: "ADMIN" | "MEMBER") {
    const user = await seedUser(`${role.toLowerCase()}@clockwork-av.com`, "clockwork-av.com", role);
    const sa = await createSession(user.id, {});
    return app.signCookie(sa.id);
  }

  it("returns packages and the JSON body has no rate fields (MEMBER)", async () => {
    const sid = await cookieFor("MEMBER");
    const res = await app.inject({
      method: "GET",
      url: "/api/catalogue/packages",
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { packages: unknown[] };
    expect(Array.isArray(body.packages)).toBe(true);
    expect(Array.isArray((body as { showItems?: unknown }).showItems)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/valuePaise|"rates"|litresPerHour|amountPaise/i);
  });

  it("still leaks nothing for ADMIN — hiding in the UI is not the boundary", async () => {
    const sid = await cookieFor("ADMIN");
    const res = await app.inject({
      method: "GET",
      url: "/api/catalogue/packages",
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(JSON.stringify(body)).not.toMatch(/valuePaise|"rates"|litresPerHour|amountPaise/i);
  });
});
