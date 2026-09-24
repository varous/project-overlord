/**
 * Full app-path R2 check via Fastify inject + real r2.ts (no stub).
 * Prints PASS/FAIL only — no secrets, no signed URLs.
 *
 * Usage: npx tsx packages/api/scripts/verify-basemap-upload-path.ts
 */
import { HeadObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { createSession, SESSION_COOKIE } from "../src/lib/session.js";
import { resolveR2Config } from "../src/lib/r2.js";

const ORIGIN = "http://localhost:5173";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function ok(s: string) {
  console.log(`PASS  ${s}`);
}
function fail(s: string, d: string): never {
  console.error(`FAIL  ${s}: ${d}`);
  process.exit(1);
}

async function main() {
  const cfg = resolveR2Config();
  ok("R2 configured");

  const app = await buildApp({ logger: false });
  const org = await db.organisation.upsert({
    where: { hd: "clockwork-av.com" },
    create: { hd: "clockwork-av.com", name: "clockwork-av.com" },
    update: {},
  });
  const user = await db.user.upsert({
    where: { email: "r2-verify@clockwork-av.com" },
    create: {
      organisationId: org.id,
      email: "r2-verify@clockwork-av.com",
      name: "r2-verify",
      googleSub: "sub-r2-verify",
    },
    update: { organisationId: org.id },
  });
  const session = await createSession(user.id, {});
  const sid = app.signCookie(session.id);
  const cookie = { [SESSION_COOKIE]: sid };

  const created = await app.inject({
    method: "POST",
    url: "/api/projects",
    cookies: cookie,
    payload: { name: "R2 verify" },
  });
  if (created.statusCode !== 201) fail("create project", String(created.statusCode));
  const projectId = created.json().id as string;
  ok("create project");

  const pre = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/basemap/presign`,
    cookies: cookie,
    payload: { mimeType: "image/png", byteSize: PNG.length },
  });
  if (pre.statusCode !== 200) {
    fail("presign via API", `${pre.statusCode} ${pre.json()?.message ?? ""}`);
  }
  const { objectKey, uploadUrl, headers } = pre.json() as {
    objectKey: string;
    uploadUrl: string;
    headers: Record<string, string>;
  };
  if (headers["Content-Length"]) fail("presign headers", "must not include Content-Length");
  if (!headers["Content-Type"]) fail("presign headers", "missing Content-Type");
  ok("API presign");

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { ...headers, Origin: ORIGIN },
    body: PNG,
  });
  if (!put.ok) fail("browser-shaped PUT", `HTTP ${put.status}`);
  ok("PUT to R2");

  const s3 = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  const head = await s3.send(
    new HeadObjectCommand({ Bucket: cfg.bucket, Key: objectKey }),
  );
  if (head.ContentLength !== PNG.length) fail("HeadObject", `size ${head.ContentLength}`);
  ok("object in bucket");

  const conf = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/basemap/confirm`,
    cookies: cookie,
    payload: {
      objectKey,
      mimeType: "image/png",
      widthPx: 1,
      heightPx: 1,
    },
  });
  if (conf.statusCode !== 201) fail("confirm", `${conf.statusCode} ${conf.json()?.message ?? ""}`);
  ok("confirm basemap");

  const layout = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/layout`,
    cookies: cookie,
  });
  if (layout.statusCode !== 200) fail("layout", String(layout.statusCode));
  const body = layout.json();
  if (body.mapState !== "map_uncalibrated") fail("layout mapState", body.mapState);
  const viewUrl = body.baseMap?.viewUrl as string | undefined;
  if (!viewUrl) fail("layout viewUrl", "missing");
  const img = await fetch(viewUrl, { headers: { Origin: ORIGIN } });
  if (!img.ok) fail("presigned GET", `HTTP ${img.status}`);
  const bytes = Buffer.from(await img.arrayBuffer());
  if (bytes.length !== PNG.length) fail("presigned GET body", `got ${bytes.length}`);
  ok("presigned GET body (canvas source)");

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: objectKey }));
    ok("cleanup DeleteObject");
  } catch {
    console.log("note: cleanup delete skipped");
  }

  await db.project.delete({ where: { id: projectId } }).catch(() => undefined);
  await app.close();
  await db.$disconnect();
  console.log("\nApp-path basemap upload checks passed.");
}

main().catch((err) => {
  fail("unhandled", err instanceof Error ? err.message : String(err));
});
