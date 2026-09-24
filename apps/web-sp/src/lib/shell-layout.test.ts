import { describe, expect, it } from "vitest";
import { SHELL, canvasWidthAt, shellFitsMinimum } from "./shell-layout.js";

describe("shell layout @ 1366×768", () => {
  it("keeps side panels fixed; only canvas shrinks", () => {
    expect(SHELL.leftPanelW + SHELL.rightPanelW).toBe(596);
    expect(canvasWidthAt(1366)).toBe(770);
    expect(canvasWidthAt(1371)).toBe(775);
    expect(shellFitsMinimum(1366)).toBe(true);
    expect(shellFitsMinimum(1365)).toBe(false);
  });
});
