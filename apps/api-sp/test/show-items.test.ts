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

describe("show-items API", () => {
  let app: FastifyInstance;
  let sid: string;
  let projectId: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await db.dayCurve.upsert({
      where: { id: "FULL" },
      create: { id: "FULL", table: { "1": 1 } },
      update: {},
    });
    await db.item.upsert({
      where: { code: "HK_TEST_PEST" },
      create: {
        code: "HK_TEST_PEST",
        name: "Test pest control",
        category: "Housekeeping",
        section: "OPS",
        unit: "nos/duty",
        qtyBasis: "COUNT_PER_DAY",
        dayCurveId: "FULL",
        tags: [],
        sortOrder: 1,
        placement: "SHOW",
      },
      update: { placement: "SHOW" },
    });
    await db.item.upsert({
      where: { code: "GEN_TEST_CANVAS" },
      create: {
        code: "GEN_TEST_CANVAS",
        name: "Test canvas genset",
        category: "Generators",
        section: "POWER",
        unit: "day",
        qtyBasis: "COUNT_PER_DAY",
        dayCurveId: "FULL",
        tags: [],
        sortOrder: 2,
        placement: "CANVAS",
      },
      update: { placement: "CANVAS" },
    });
  });

  afterAll(async () => {
    await db.showItem.deleteMany({ where: { itemCode: { in: ["HK_TEST_PEST", "GEN_TEST_CANVAS"] } } });
    await db.item.deleteMany({ where: { code: { in: ["HK_TEST_PEST", "GEN_TEST_CANVAS"] } } });
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

    const user = await seedUser("a@clockwork-av.com", "clockwork-av.com");
    const sa = await createSession(user.id, {});
    sid = app.signCookie(sa.id);
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sid },
      payload: { name: "Show tray" },
    });
    projectId = created.json().id as string;
  });

  it("adds a show item, second add of the same code increments qty", async () => {
    const a = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/show-items`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { itemCode: "HK_TEST_PEST", qty: 2 },
    });
    expect(a.statusCode).toBe(201);
    expect(a.json().showItem.qty).toBe(2);

    const b = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/show-items`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { itemCode: "HK_TEST_PEST", qty: 3 },
    });
    expect(b.statusCode).toBe(200);
    expect(b.json().showItem.qty).toBe(5);
    expect(b.json().showItem.id).toBe(a.json().showItem.id);
  });

  it("refuses a CANVAS item on the show tray", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/show-items`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { itemCode: "GEN_TEST_CANVAS" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("not_show_item");
  });

  it("PATCH qty and DELETE, and layout GET lists them", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/show-items`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { itemCode: "HK_TEST_PEST", qty: 1 },
    });
    const id = created.json().showItem.id as string;

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/show-items/${id}`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { qty: 4 },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().showItem.qty).toBe(4);

    const layout = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/layout`,
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(layout.json().showItems).toHaveLength(1);
    expect(layout.json().showItems[0].qty).toBe(4);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}/show-items/${id}`,
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(del.statusCode).toBe(204);
  });
});
