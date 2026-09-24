import { describe, expect, it } from "vitest";
import { REFERENCE_PATH, isDevReferenceRoute } from "./reference-route.js";

describe("isDevReferenceRoute (ADR-008)", () => {
  it("is available in DEV", () => {
    expect(isDevReferenceRoute(REFERENCE_PATH, true)).toBe(true);
  });

  it("is stripped from production builds", () => {
    expect(isDevReferenceRoute(REFERENCE_PATH, false)).toBe(false);
  });

  it("ignores any other path", () => {
    expect(isDevReferenceRoute("/", true)).toBe(false);
    expect(isDevReferenceRoute("/projects/abc", true)).toBe(false);
  });
});
