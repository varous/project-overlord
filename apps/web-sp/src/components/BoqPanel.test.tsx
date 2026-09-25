import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { BoqPanel } from "./BoqPanel.js";
import { queryClient } from "../lib/boq-query.js";
import type { BoqResponse } from "../lib/api.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATA: BoqResponse = {
  catalogueVersion: "test_v1",
  findings: [
    { severity: "warning", code: "GEOMETRY_MISSING", message: "TEST_PANEL needs a calibrated scale." },
    { severity: "error", code: "ITEM_UNKNOWN", message: "Unknown package TEST_X." },
  ],
  lines: [
    {
      itemCode: "TEST_GENSET", name: "Generator unit", unit: "nos", qtyBasis: "COUNT",
      section: "POWER", category: "power", qty: 2,
      contributions: [
        { instanceId: "i1", showItemId: null, variantName: "stage genset", qty: 1 },
        { instanceId: "i2", showItemId: null, variantName: "backstage genset", qty: 1 },
      ],
    },
    {
      itemCode: "TEST_PLATFORM", name: "Platform deck", unit: "sqft", qtyBasis: "AREA",
      section: "VC", category: "structure", qty: 120,
      contributions: [{ instanceId: "i3", showItemId: null, variantName: "stage kit", qty: 120 }],
    },
  ],
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  queryClient.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => DATA,
    })),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

async function renderPanel() {
  root = createRoot(container);
  await act(async () => {
    root!.render(<BoqPanel projectId="p1" projectName="Test show" />);
  });
  /* Flush the mocked fetch and react-query's state update. */
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (!(container.textContent ?? "").includes("Building the BOQ")) break;
  }
  return container;
}

describe("BoqPanel", () => {
  it("groups lines under the domain's section labels", async () => {
    const el = await renderPanel();
    expect(el.textContent).toContain("Venue Construction");
    expect(el.textContent).toContain("Power");
    expect(el.textContent).toContain("Platform deck");
    expect(el.textContent).toContain("Generator unit");
  });

  it("shows findings before the lines, errors first", async () => {
    const el = await renderPanel();
    const text = el.textContent ?? "";
    const error = text.indexOf("Unknown package TEST_X.");
    const warning = text.indexOf("TEST_PANEL needs a calibrated scale.");
    const firstLine = text.indexOf("Generator unit");
    expect(error).toBeGreaterThanOrEqual(0);
    expect(error).toBeLessThan(warning);
    expect(warning).toBeLessThan(firstLine);
  });

  it("expands a line's contributions on click", async () => {
    const el = await renderPanel();
    expect(el.textContent).not.toContain("stage genset");
    const button = [...el.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "2 contributions",
    );
    expect(button).toBeDefined();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(el.textContent).toContain("stage genset");
    expect(el.textContent).toContain("backstage genset");
  });

  it("renders no rupee, paise, rate or price text", async () => {
    const el = await renderPanel();
    /* Whole words: "calibrated" is legitimate copy and must not count as "rate". */
    expect(el.textContent ?? "").not.toMatch(/\u20b9|\b(paise|rate|price)\b/i);
  });
});
