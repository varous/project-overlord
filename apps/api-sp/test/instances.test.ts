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

describe("instances API", () => {
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
      where: { code: "GEN_TEST" },
      create: {
        code: "GEN_TEST",
        name: "Test genset",
        category: "Power",
        section: "POWER",
        unit: "nos",
        qtyBasis: "COUNT",
        dayCurveId: "FULL",
        tags: [],
        sortOrder: 9999,
      },
      update: {},
    });
    await db.item.upsert({
      where: { code: "BAR_TEST" },
      create: {
        code: "BAR_TEST",
        name: "Test barricade",
        category: "Security",
        section: "VC",
        unit: "rft",
        qtyBasis: "COUNT",
        dayCurveId: "FULL",
        tags: [],
        sortOrder: 9998,
      },
      update: {},
    });
    await db.packageTemplate.upsert({
      where: { packageId: "PKG_TEST_GEN" },
      create: {
        packageId: "PKG_TEST_GEN",
        name: "Test Genset",
        params: [],
        version: 1,
        lines: {
          create: [{
            itemCode: "GEN_TEST",
            qtyRule: "FIXED",
            qtyValue: 1,
            flag: "MANDATORY",
          }],
        },
      },
      update: {},
    });
    await db.packageTemplate.upsert({
      where: { packageId: "PKG_TEST_GATE" },
      create: {
        packageId: "PKG_TEST_GATE",
        name: "Test Gate",
        params: ["lanes"],
        version: 1,
        lines: {
          create: [{
            itemCode: "BAR_TEST",
            qtyRule: "PER_COUNT_PARAM:lanes",
            qtyValue: 4,
            flag: "MANDATORY",
          }],
        },
      },
      update: {},
    });
  });

  afterAll(async () => {
    await db.instance.deleteMany({
      where: { variant: { packageId: { in: ["PKG_TEST_GEN", "PKG_TEST_GATE"] } } },
    });
    await db.variantLine.deleteMany({
      where: { variant: { packageId: { in: ["PKG_TEST_GEN", "PKG_TEST_GATE"] } } },
    });
    await db.variant.deleteMany({
      where: { packageId: { in: ["PKG_TEST_GEN", "PKG_TEST_GATE"] } },
    });
    await db.packageItem.deleteMany({
      where: { packageId: { in: ["PKG_TEST_GEN", "PKG_TEST_GATE"] } },
    });
    await db.packageTemplate.deleteMany({
      where: { packageId: { in: ["PKG_TEST_GEN", "PKG_TEST_GATE"] } },
    });
    await db.item.deleteMany({ where: { code: { in: ["GEN_TEST", "BAR_TEST"] } } });
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
      payload: { name: "Place Project" },
    });
    projectId = created.json().id as string;
  });

  it("first drop creates a variant; second drop of the same package reuses it", async () => {
    const a = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/instances`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { packageId: "PKG_TEST_GEN", xPx: 10, yPx: 20 },
    });
    expect(a.statusCode).toBe(201);
    const first = a.json() as { instance: { variantId: string }; variant: { instanceCount: number } };
    expect(first.variant.instanceCount).toBe(1);

    const b = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/instances`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { packageId: "PKG_TEST_GEN", xPx: 40, yPx: 20 },
    });
    expect(b.statusCode).toBe(201);
    const second = b.json() as { instance: { variantId: string }; variant: { instanceCount: number } };
    expect(second.instance.variantId).toBe(first.instance.variantId);
    expect(second.variant.instanceCount).toBe(2);
  });

  it("stores lanes on the instance, not shared across placements", async () => {
    const a = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/instances`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { packageId: "PKG_TEST_GATE", xPx: 0, yPx: 0, params: { lanes: 6 } },
    });
    const b = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/instances`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { packageId: "PKG_TEST_GATE", xPx: 50, yPx: 0, params: { lanes: 2 } },
    });
    expect(a.json().instance.params.lanes).toBe(6);
    expect(b.json().instance.params.lanes).toBe(2);
    expect(a.json().instance.variantId).toBe(b.json().instance.variantId);
  });

  it("layout GET returns variants and instances", async () => {
    await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/instances`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { packageId: "PKG_TEST_GEN", xPx: 5, yPx: 5 },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/layout`,
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { variants: unknown[]; instances: unknown[]; showItems: unknown[] };
    expect(body.variants).toHaveLength(1);
    expect(body.instances).toHaveLength(1);
    expect(body.showItems).toEqual([]);
  });

  it("PATCH moves; DELETE removes", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/instances`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { packageId: "PKG_TEST_GEN", xPx: 1, yPx: 1 },
    });
    const id = created.json().instance.id as string;
    const moved = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/instances/${id}`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { xPx: 99, yPx: 88, rotationDeg: 15 },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().instance.xPx).toBe(99);
    expect(moved.json().instance.rotationDeg).toBe(15);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}/instances/${id}`,
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(del.statusCode).toBe(204);
  });
});
