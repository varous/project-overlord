import path from "node:path";
import { describe, expect, it } from "vitest";
import { webRootDir } from "../src/app.js";

describe("the static root api-sp serves", () => {
  it("resolves to apps/web-sp/dist, never the Cesium viewer's build", () => {
    const dir = webRootDir().split(path.sep).join("/");
    expect(dir.endsWith("apps/web-sp/dist")).toBe(true);
    expect(dir.endsWith("apps/web/dist")).toBe(false);
  });
});
