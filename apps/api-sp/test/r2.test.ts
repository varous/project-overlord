import { describe, expect, it } from "vitest";
import { R2NotConfiguredError, resolveR2Config } from "../src/lib/r2.js";
import { config } from "../src/config.js";

describe("r2 fail-closed", () => {
  it("names missing env keys", () => {
    const saved = {
      R2_ACCOUNT_ID: config.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: config.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: config.R2_SECRET_ACCESS_KEY,
      R2_BUCKET: config.R2_BUCKET,
    };
    try {
      const c = config as unknown as Record<string, string | undefined>;
      c.R2_ACCOUNT_ID = undefined;
      c.R2_ACCESS_KEY_ID = undefined;
      c.R2_SECRET_ACCESS_KEY = undefined;
      c.R2_BUCKET = undefined;
      expect(() => resolveR2Config()).toThrow(R2NotConfiguredError);
      try {
        resolveR2Config();
      } catch (err) {
        expect(err).toBeInstanceOf(R2NotConfiguredError);
        const e = err as R2NotConfiguredError;
        expect(e.missing).toContain("R2_ACCOUNT_ID");
        expect(e.message).toContain("R2_ACCOUNT_ID");
      }
    } finally {
      const c = config as unknown as Record<string, string | undefined>;
      c.R2_ACCOUNT_ID = saved.R2_ACCOUNT_ID;
      c.R2_ACCESS_KEY_ID = saved.R2_ACCESS_KEY_ID;
      c.R2_SECRET_ACCESS_KEY = saved.R2_SECRET_ACCESS_KEY;
      c.R2_BUCKET = saved.R2_BUCKET;
    }
  });
});
