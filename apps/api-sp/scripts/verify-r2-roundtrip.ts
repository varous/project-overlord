/**
 * One-shot real R2 round-trip check. Not part of `npm test` — hits the live
 * showplan-dev bucket. Prints PASS/FAIL only; never prints secrets or signed URLs.
 *
 * Usage: npx tsx packages/api/scripts/verify-r2-roundtrip.ts
 */
import { HeadObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../src/config.js";
import { resolveR2Config, presignPut, presignGet } from "../src/lib/r2.js";

const ORIGIN = "http://localhost:5173";
const KEY = `orgs/_verify/r2-roundtrip-${Date.now()}.png`;

/** 1×1 PNG */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function ok(step: string) {
  console.log(`PASS  ${step}`);
}
function fail(step: string, detail: string): never {
  console.error(`FAIL  ${step}: ${detail}`);
  process.exit(1);
}

async function main() {
  const presence = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_ENDPOINT",
  ].map((k) => `${k}=${config[k as keyof typeof config] ? "set" : "MISSING"}`);
  console.log("env:", presence.join(" "));

  let cfg;
  try {
    cfg = resolveR2Config();
  } catch (err) {
    fail("resolveR2Config", err instanceof Error ? err.message : String(err));
  }
  if (cfg.bucket !== "showplan-dev") {
    console.log(`note: bucket name is set (${cfg.bucket.length} chars) — expected showplan-dev for local`);
  }
  ok("resolveR2Config");

  const signed = await presignPut({
    objectKey: KEY,
    contentType: "image/png",
    contentLength: PNG.length,
  });
  if (!signed.headers["Content-Type"]) fail("presignPut", "missing Content-Type header");
  if (signed.headers["Content-Length"]) {
    fail("presignPut", "must not require Content-Length (CORS allowlist is content-type only)");
  }
  ok("presignPut (Content-Type only)");

  /* CORS preflight — what the browser will send before PUT */
  const preflight = await fetch(signed.url, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const allowOrigin = preflight.headers.get("access-control-allow-origin");
  const allowMethods = preflight.headers.get("access-control-allow-methods") ?? "";
  const allowHeaders = preflight.headers.get("access-control-allow-headers") ?? "";
  if (preflight.status >= 400) {
    fail(
      "CORS preflight",
      `HTTP ${preflight.status}; Allow-Origin=${allowOrigin}; Allow-Methods=${allowMethods}; Allow-Headers=${allowHeaders}`,
    );
  }
  if (!allowOrigin || (allowOrigin !== "*" && allowOrigin !== ORIGIN)) {
    fail("CORS preflight", `Allow-Origin is ${allowOrigin ?? "(missing)"} (need ${ORIGIN} or *)`);
  }
  if (!/PUT/i.test(allowMethods) && allowMethods !== "*") {
    fail("CORS preflight", `Allow-Methods is ${allowMethods || "(missing)"} — PUT not listed`);
  }
  if (!/content-type/i.test(allowHeaders) && allowHeaders !== "*") {
    fail("CORS preflight", `Allow-Headers is ${allowHeaders || "(missing)"} — content-type not listed`);
  }
  ok(`CORS preflight PUT+content-type from ${ORIGIN}`);

  /* Prove Content-Length would be rejected by current policy (informational) */
  const preflightLen = await fetch(signed.url, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type,content-length",
    },
  });
  const allowHeadersLen = preflightLen.headers.get("access-control-allow-headers") ?? "";
  const lengthOk =
    preflightLen.status < 400 &&
    (/content-length/i.test(allowHeadersLen) || allowHeadersLen === "*");
  if (lengthOk) {
    console.log("note: CORS also allows content-length (we still do not set it from JS)");
  } else {
    console.log(
      "note: CORS does not allow content-length (expected) — we only set Content-Type",
    );
  }

  /* Browser-shaped PUT: Origin + Content-Type only */
  const put = await fetch(signed.url, {
    method: "PUT",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "image/png",
    },
    body: PNG,
  });
  if (!put.ok) {
    fail("browser-shaped PUT", `HTTP ${put.status} ${put.statusText}`);
  }
  ok(`PUT object (${PNG.length} bytes)`);

  /* Object present — HeadObject is object-scoped, not ListBucket */
  const s3 = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: cfg.bucket, Key: KEY }),
    );
    if (head.ContentLength !== PNG.length) {
      fail("HeadObject", `size ${head.ContentLength} !== ${PNG.length}`);
    }
    ok("HeadObject (object present in bucket)");
  } catch (err) {
    const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
    if (name === "AccessDenied" || name === "AllAccessDisabled") {
      fail(
        "HeadObject",
        "token denied HeadObject — that is object read, not a bucket-level op; check token scope",
      );
    }
    fail("HeadObject", err instanceof Error ? err.message : String(err));
  }

  const getUrl = await presignGet(KEY);
  const get = await fetch(getUrl, { headers: { Origin: ORIGIN } });
  if (!get.ok) fail("presignGet fetch", `HTTP ${get.status}`);
  const bytes = Buffer.from(await get.arrayBuffer());
  if (bytes.length !== PNG.length) fail("presignGet fetch", `got ${bytes.length} bytes`);
  ok("presignGet → fetch body matches");

  /* CORS GET for canvas <img> / Konva */
  const getPreflight = await fetch(getUrl, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": "GET",
    },
  });
  const getAllowOrigin = getPreflight.headers.get("access-control-allow-origin");
  if (getPreflight.status >= 400) {
    fail("CORS GET preflight", `HTTP ${getPreflight.status}; Allow-Origin=${getAllowOrigin}`);
  }
  ok("CORS GET preflight (canvas load)");

  /* Cleanup — DeleteObject is object write, not CreateBucket */
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: KEY }));
    ok("DeleteObject cleanup");
  } catch (err) {
    console.log(
      "note: cleanup delete failed (object may remain under orgs/_verify/) —",
      err instanceof Error ? err.name : "error",
    );
  }

  console.log("\nAll R2 round-trip checks passed.");
}

main().catch((err) => {
  fail("unhandled", err instanceof Error ? err.message : String(err));
});
