/**
 * Cloudflare R2 via the S3 API. Bytes never transit the app server —
 * clients PUT/GET with short-lived presigned URLs.
 *
 * Fail closed when env is incomplete: name the missing keys so setup is obvious.
 * Tests stub this module; they must never hit a real bucket.
 */
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

export class R2NotConfiguredError extends Error {
  readonly code = "r2_not_configured";
  constructor(readonly missing: readonly string[]) {
    super(
      `R2 is not configured: missing ${missing.join(", ")}. ` +
        `Set these in .env (local) or Render → Environment (prod).`,
    );
    this.name = "R2NotConfiguredError";
  }
}

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

export function resolveR2Config(): R2Config {
  const missing: string[] = [];
  for (const key of REQUIRED) {
    if (!config[key]) missing.push(key);
  }
  if (missing.length > 0) throw new R2NotConfiguredError(missing);

  const accountId = config.R2_ACCOUNT_ID!;
  const endpoint =
    config.R2_ENDPOINT?.trim() ||
    `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    accountId,
    accessKeyId: config.R2_ACCESS_KEY_ID!,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY!,
    bucket: config.R2_BUCKET!,
    endpoint,
  };
}

function client(cfg: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

const PUT_TTL_SEC = 15 * 60;
const GET_TTL_SEC = 60 * 60;

export async function presignPut(args: {
  objectKey: string;
  contentType: string;
  /** Validated for size limits only — not signed. Browser CORS allows Content-Type alone. */
  contentLength: number;
}): Promise<{ url: string; headers: Record<string, string> }> {
  void args.contentLength; /* size checked by the route; do not sign or require this header */
  const cfg = resolveR2Config();
  const url = await getSignedUrl(
    client(cfg),
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: args.objectKey,
      ContentType: args.contentType,
      /* Do NOT set ContentLength: browsers set it automatically, and our R2 CORS
         allowlist is Content-Type only — signing/requiring Content-Length breaks
         the preflight. */
    }),
    { expiresIn: PUT_TTL_SEC },
  );
  return {
    url,
    /* Only headers the browser is allowed to set under current CORS. */
    headers: {
      "Content-Type": args.contentType,
    },
  };
}

export async function presignGet(objectKey: string): Promise<string> {
  const cfg = resolveR2Config();
  return getSignedUrl(
    client(cfg),
    new GetObjectCommand({ Bucket: cfg.bucket, Key: objectKey }),
    { expiresIn: GET_TTL_SEC },
  );
}
