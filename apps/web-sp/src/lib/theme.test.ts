import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { THEME_STORAGE_KEY, getTheme, applyTheme, bootTheme } from "./theme.js";

describe("theme (QA-05)", () => {
  const original = globalThis.document;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    localStorage.clear();
    void original;
  });

  it("defaults to light when nothing is stored (ignores OS preference)", () => {
    expect(getTheme()).toBe("light");
  });

  it("bootTheme applies light to <html>", () => {
    expect(bootTheme()).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("applyTheme persists and is read back app-wide", () => {
    applyTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(getTheme()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
