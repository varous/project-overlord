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
  const user = await db.user.upsert({
    where: { email },
    create: {
      organisationId: org.id,
      email,
      name: email.split("@")[0]!,
      googleSub: `sub-${email}`,
    },
    update: { organisationId: org.id },
  });
  return user;
}

describe("projects API", () => {
  let app: FastifyInstance;
  let sidA: string;
  let sidB: string;
  let userAId: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  beforeEach(async () => {
    await db.showItem.deleteMany();
    await db.layout.deleteMany();
    await db.project.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.organisation.deleteMany();

    const a = await seedUser("a@clockwork-av.com", "clockwork-av.com");
    const b = await seedUser("b@other-org.test", "other-org.test");
    userAId = a.id;

    const sa = await createSession(a.id, {});
    const sb = await createSession(b.id, {});
    sidA = app.signCookie(sa.id);
    sidB = app.signCookie(sb.id);
  });

  it("rejects unauthenticated list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/projects" });
    expect(res.statusCode).toBe(401);
  });

  it("creates a project with name only; days stay null", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sidA },
      payload: { name: "Diwali Night" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Diwali Night");
    expect(body.vcDays).toBeNull();
    expect(body.opsDays).toBeNull();
    expect(body.defaultRunningHoursPerDay).toBeNull();
    expect(body.ownerId).toBe(userAId);

    expect(await db.layout.count({ where: { projectId: body.id } })).toBe(1);
    const layout = await db.layout.findFirst({ where: { projectId: body.id } });
    expect(await db.level.count({ where: { layoutId: layout!.id } })).toBe(1);
  });

  it("lists org projects; excludes archived by default", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sidA },
      payload: { name: "Live" },
    });
    const id = create.json().id as string;
    await app.inject({
      method: "PATCH",
      url: `/api/projects/${id}`,
      cookies: { [SESSION_COOKIE]: sidA },
      payload: { status: "ARCHIVED" },
    });
    await app.inject({
      method: "POST",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sidA },
      payload: { name: "Active" },
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sidA },
    });
    expect(list.json().projects.map((p: { name: string }) => p.name)).toEqual(["Active"]);
  });

  it("does not leak projects across organisations", async () => {
    await app.inject({
      method: "POST",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sidA },
      payload: { name: "A only" },
    });
    const listB = await app.inject({
      method: "GET",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sidB },
    });
    expect(listB.json().projects).toEqual([]);
  });

  it("get returns 404 for another org's project", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sidA },
      payload: { name: "Secret" },
    });
    const id = create.json().id as string;
    const get = await app.inject({
      method: "GET",
      url: `/api/projects/${id}`,
      cookies: { [SESSION_COOKIE]: sidB },
    });
    expect(get.statusCode).toBe(404);
  });

  it("PATCH stores days as event facts; null days stay null, not zero", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/projects",
      cookies: { [SESSION_COOKIE]: sidA },
      payload: { name: "Fest" },
    });
    const id = create.json().id as string;
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/projects/${id}`,
      cookies: { [SESSION_COOKIE]: sidA },
      payload: { vcDays: 3, opsDays: 5 },
    });
    expect(patched.statusCode).toBe(200);
    const body = patched.json();
    expect(body.vcDays).toBe(3);
    expect(body.opsDays).toBe(5);
    expect(body.defaultRunningHoursPerDay).toBeNull();
  });
});
