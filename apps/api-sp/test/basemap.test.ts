import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { db } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { createSession, SESSION_COOKIE } from "../src/lib/session.js";

vi.mock("../src/lib/r2.js", () => ({
  R2NotConfiguredError: class R2NotConfiguredError extends Error {
    code = "r2_not_configured";
    missing: string[];
    constructor(missing: string[]) {
      super(`R2 is not configured: missing ${missing.join(", ")}`);
      this.missing = missing;
    }
  },
  resolveR2Config: vi.fn(),
  presignPut: vi.fn(async ({ objectKey }: { objectKey: string }) => ({
    url: `https://r2.test/put/${objectKey}`,
    headers: { "Content-Type": "image/png" },
  })),
  presignGet: vi.fn(async (objectKey: string) => `https://r2.test/get/${objectKey}`),
}));

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

describe("basemap + calibration API", () => {
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
      payload: { name: "Cal Project" },
    });
    projectId = created.json().id as string;
  });

  it("returns no_map layout for a fresh project", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/layout`,
      cookies: { [SESSION_COOKIE]: sid },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mapState).toBe("no_map");
    expect(body.baseMap).toBeNull();
    expect(body.level.name).toBe("Ground");
  });

  it("rejects wrong type and oversized presign", async () => {
    const badType = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/basemap/presign`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { mimeType: "application/zip", byteSize: 100 },
    });
    expect(badType.statusCode).toBe(400);
    expect(badType.json().error).toBe("wrong_type");

    const big = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/basemap/presign`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { mimeType: "image/png", byteSize: 26 * 1024 * 1024 },
    });
    expect(big.statusCode).toBe(400);
    expect(big.json().error).toBe("too_large");
  });

  it("presign → confirm stores map uncalibrated; replace clears calibration", async () => {
    const pre = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/basemap/presign`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { mimeType: "image/png", byteSize: 100 },
    });
    expect(pre.statusCode).toBe(200);
    const { objectKey } = pre.json();

    const conf = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/basemap/confirm`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: {
        objectKey,
        mimeType: "image/png",
        widthPx: 2000,
        heightPx: 1000,
        pageCount: 4,
        sourcePage: 1,
      },
    });
    expect(conf.statusCode).toBe(201);
    expect(conf.json().mapState).toBe("map_uncalibrated");
    expect(conf.json().baseMap.pageCount).toBe(4);

    const cal = await app.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/basemap/calibration`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: {
        pointA: { x: 0, y: 0 },
        pointB: { x: 100, y: 0 },
        knownDistance: 10,
        knownUnit: "m",
      },
    });
    expect(cal.statusCode).toBe(200);
    expect(cal.json().mapState).toBe("calibrated");
    expect(cal.json().baseMap.scale.mmPerPixel).toBeCloseTo(100);

    const before = await db.baseMap.findFirst({
      where: { level: { layout: { projectId } } },
    });
    expect(before?.objectKey).toBe(objectKey);
    expect(before?.calAx).not.toBeNull();

    const pre2 = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/basemap/presign`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { mimeType: "image/png", byteSize: 120 },
    });
    const newKey = pre2.json().objectKey as string;
    expect(newKey).not.toBe(objectKey);

    const conf2 = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/basemap/confirm`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: {
        objectKey: newKey,
        mimeType: "image/png",
        widthPx: 1000,
        heightPx: 800,
      },
    });
    expect(conf2.statusCode).toBe(201);
    expect(conf2.json().calibrationCleared).toBe(true);
    expect(conf2.json().mapState).toBe("map_uncalibrated");
    expect(conf2.json().baseMap.calibration).toBeNull();

    const after = await db.baseMap.findFirst({
      where: { level: { layout: { projectId } } },
    });
    expect(after?.objectKey).toBe(newKey);
    expect(after?.objectKey).not.toBe(objectKey);
    expect(after?.calAx).toBeNull();
    expect(after?.calAy).toBeNull();
    expect(after?.calBx).toBeNull();
    expect(after?.calBy).toBeNull();
    expect(after?.calKnownValue).toBeNull();
    expect(after?.calKnownUnit).toBeNull();
  });

  it("soft-blocks implausible scale until acceptImplausible", async () => {
    const pre = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/basemap/presign`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: { mimeType: "image/png", byteSize: 50 },
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/basemap/confirm`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: {
        objectKey: pre.json().objectKey,
        mimeType: "image/png",
        widthPx: 1000,
        heightPx: 500,
      },
    });

    /* 1 px = 10 m → implied width 10 km */
    const blocked = await app.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/basemap/calibration`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: {
        pointA: { x: 0, y: 0 },
        pointB: { x: 1, y: 0 },
        knownDistance: 10,
        knownUnit: "m",
      },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe("implausible_scale");

    const ok = await app.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/basemap/calibration`,
      cookies: { [SESSION_COOKIE]: sid },
      payload: {
        pointA: { x: 0, y: 0 },
        pointB: { x: 1, y: 0 },
        knownDistance: 10,
        knownUnit: "m",
        acceptImplausible: true,
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().implausible).toBe(true);
  });
});
