import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { db } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { createSession, SESSION_COOKIE } from "../src/lib/session.js";

async function seedUser(email: string, hd: string) {
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
    },
    update: { organisationId: org.id },
  });
}

describe("measure marks API", () => {
  let app: FastifyInstance;
  let sid: string;
  let projectId: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  beforeEach(async () => {
    await db.measureMark.deleteMany();
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

    const user = await seedUser("a@clockwork-av.com", "clockwork-av.com");
    const sa = await createSession(user.id, {});
    sid = app.signCookie(sa.id);
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sid },
      payload: { name: "Measure Project" },
    });
    projectId = created.json().id as string;
  });

  it("stores pixel points only — no derived metres, no qty, no amount", async () => {
    const posted = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/measurements`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: {
        points: [
          { x: 10, y: 20 },
          { x: 110, y: 20 },
        ],
      },
    });
    expect(posted.statusCode).toBe(201);
    const mark = posted.json().measurement as Record<string, unknown>;
    expect(mark.points).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
    ]);
    const dumped = JSON.stringify(posted.json());
    expect(dumped).not.toMatch(/metre|meter|qty|amount|paise|rate/i);

    const layout = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/layout`,
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(layout.statusCode).toBe(200);
    const body = layout.json() as { measurements: { points: unknown }[] };
    expect(body.measurements).toHaveLength(1);
    expect(JSON.stringify(body.measurements)).not.toMatch(/metre|amount|qtyRule/i);
  });

  it("rejects a single point", async () => {
    const posted = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/measurements`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { points: [{ x: 1, y: 1 }] },
    });
    expect(posted.statusCode).toBe(400);
  });

  it("DELETE removes the mark", async () => {
    const posted = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/measurements`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: {
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
        ],
      },
    });
    const id = posted.json().measurement.id as string;
    const del = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}/measurements/${id}`,
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(del.statusCode).toBe(204);
    const layout = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/layout`,
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(layout.json().measurements).toEqual([]);
  });

  it("QA-22: empty JSON Content-Type 400s DELETE; GET still works", async () => {
    const posted = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/measurements`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
    });
    const id = posted.json().measurement.id as string;

    const del = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}/measurements/${id}`,
      cookies: { [SESSION_COOKIE]: sid },
      headers: { "content-type": "application/json" },
    });
    expect(del.statusCode).toBe(400);
    expect(del.json()).toMatchObject({ code: "FST_ERR_CTP_EMPTY_JSON_BODY" });

    const get = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/layout`,
      cookies: { [SESSION_COOKIE]: sid },
      headers: { "content-type": "application/json" },
    });
    expect(get.statusCode).toBe(200);
  });
});
