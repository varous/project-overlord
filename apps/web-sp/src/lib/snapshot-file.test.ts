import { describe, expect, it } from "vitest";
import { snapshotFile } from "./snapshot-file.js";

describe("snapshotFile", () => {
  it("copies bytes into a new File that survives after the source is abandoned", async () => {
    const src = new File([new Uint8Array([1, 2, 3, 4])], "plan.png", {
      type: "image/png",
    });
    const copy = await snapshotFile(src);
    expect(copy).not.toBe(src);
    expect(copy.name).toBe("plan.png");
    expect(copy.type).toBe("image/png");
    expect(new Uint8Array(await copy.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});
