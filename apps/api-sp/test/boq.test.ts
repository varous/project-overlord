import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { db } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { createSession, SESSION_COOKIE } from "../src/lib/session.js";
import { writeCatalogue } from "../src/lib/import-catalogue.js";
import { loadSynthetic } from "../../../packages/boq/test/fixtures/synthetic-bundle.js";

const VERSION = "synthetic_test_v1";
const silent = { log() {}, warn() {} };

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

describe("GET /api/projects/:projectId/boq", () => {
  let app: FastifyInstance;
  let sid: string;
  let organisationId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    const loaded = loadSynthetic(VERSION);
    expect(loaded.findings.filter((f) => f.severity === "error")).toEqual([]);
    await writeCatalogue(db, loaded.catalogue, loaded.findings, VERSION, silent, {
      pruneStaleAutos: false,
    });
  });

  afterAll(async () => {
    await db.catalogueVersion.deleteMany({ where: { label: VERSION } });
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

    const user = await seedUser("boq@clockwork-av.com", "clockwork-av.com");
    organisationId = user.organisationId;
    const sa = await createSession(user.id, {});
    sid = app.signCookie(sa.id);

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sid },
      payload: { name: "BOQ Project" },
    });
    projectId = created.json().id as string;
  });

  async function levelOf(): Promise<{ layoutId: string; levelId: string }> {
    const layout = await db.layout.findFirst({ where: { projectId }, orderBy: { createdAt: "asc" } });
    const level = await db.level.findFirst({ where: { layoutId: layout!.id } });
    return { layoutId: layout!.id, levelId: level!.id };
  }

  async function place(packageId: string, params?: Record<string, number>) {
    return app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/instances`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { packageId, xPx: 10, yPx: 20, ...(params ? { params } : {}) },
    });
  }

  async function getBoq() {
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/boq`,
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as {
      catalogueVersion: string;
      lines: Array<{
        itemCode: string;
        name: string;
        unit: string;
        qtyBasis: string;
        qty: number;
        contributions: Array<{ instanceId: string | null; showItemId: string | null; variantName: string; qty: number }>;
      }>;
      findings: Array<{ code: string; severity: string }>;
    };
  }

  it("rejects unauthenticated access", async () => {
    const res = await app.inject({ method: "GET", url: `/api/projects/${projectId}/boq` });
    expect(res.statusCode).toBe(401);
  });

  it("aggregates two instances of the same package into one line at 2x qty", async () => {
    const a = await place("PKG_TEST_GENSET");
    const b = await place("PKG_TEST_GENSET");
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);

    const body = await getBoq();
    expect(body.catalogueVersion).toBe(VERSION);

    const hire = body.lines.find((l) => l.itemCode === "TEST_GENSET");
    expect(hire).toBeDefined();
    expect(hire!.qty).toBe(2);
    expect(hire!.contributions).toHaveLength(2);
    /* One line, two contributions — not two lines a human has to add up. */
    expect(body.lines.filter((l) => l.itemCode === "TEST_GENSET")).toHaveLength(1);
  });

  it("carries a SHOW item with a null instanceId", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/show-items`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { itemCode: "TEST_PEST", qty: 2 },
    });
    expect(res.statusCode).toBe(201);

    const body = await getBoq();
    const pest = body.lines.find((l) => l.itemCode === "TEST_PEST");
    expect(pest).toBeDefined();
    expect(pest!.qty).toBe(2);
    expect(pest!.contributions).toHaveLength(1);
    expect(pest!.contributions[0]!.instanceId).toBeNull();
    expect(pest!.contributions[0]!.showItemId).not.toBeNull();
  });

  it("an uncalibrated base map yields findings, not quantities", async () => {
    const { layoutId, levelId } = await levelOf();
    await db.baseMap.create({
      data: {
        organisationId,
        levelId,
        objectKey: "test/uncalibrated.png",
        mimeType: "image/png",
        widthPx: 1000,
        heightPx: 800,
      },
    });
    void layoutId;

    const placed = await place("PKG_TEST_STAGE", { counters: 1 });
    expect(placed.statusCode).toBe(201);

    const body = await getBoq();
    /* Geometry-dependent lines are omitted, with the reason recorded. */
    expect(body.lines.find((l) => l.itemCode === "TEST_PLATFORM")).toBeUndefined();
    expect(body.findings.some((f) => f.code === "GEOMETRY_MISSING")).toBe(true);
  });

  it("contains no money fields anywhere in the payload", async () => {
    await place("PKG_TEST_GENSET");
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/boq`,
      cookies: { [SESSION_COOKIE]: sid },
    });
    const text = res.body;
    expect(text).not.toMatch(/paise|rupee|valuePaise|priceBoq|amountPaise/i);
  });
});
