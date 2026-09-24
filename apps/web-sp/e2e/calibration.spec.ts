import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";
import { newProject } from "./helpers";

/**
 * Scoped to the viewbar: the uncalibrated banner carries a second "Set scale"
 * button, and its transition makes the generic locator fail Playwright's
 * stability check.
 */
function setScale(page: Page) {
  return page.locator(".viewbar").getByRole("button", { name: /Set scale|Recalibrate/ }).first();
}

const FIXTURE = path.resolve("e2e/fixtures/venue-plan-1200x800.png");

function isPdfjsRequest(url: string) {
  return /pdfjs-dist|pdf\.worker/i.test(url);
}

/**
 * The calibration path is the highest-risk flow in the product: every quantity
 * downstream depends on it, and it happens live on a client
 * call. QA-03 and QA-04 are the guards that stop a silently wrong scale.
 */
test.describe("base map + calibration", () => {
  test.beforeEach(async ({ page }) => {
    await newProject(page, `CAL ${Date.now()}`);
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect(setScale(page)).toBeVisible({ timeout: 20_000 });
  });

  test("an uploaded plan starts uncalibrated and says so", async ({ page }) => {
    await expect(page.getByText(/uncalibrated/i).first()).toBeVisible();
    await expect(page.getByText(/meaningless/i).first()).toBeVisible();
  });

  test("QA-03: the distance field starts EMPTY and Confirm is disabled", async ({ page }) => {
    await setScale(page).click({ force: true });

    const canvas = page.locator(".canvas, canvas").first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height * 0.5);
    await page.mouse.click(box!.x + box!.width * 0.7, box!.y + box!.height * 0.5);

    const distance = page.getByRole("textbox", { name: "Distance" });
    await expect(distance).toBeVisible();
    // A plausible pre-filled default is how a wrong scale reaches a client.
    await expect(distance).toHaveValue("");
    await expect(page.getByRole("button", { name: "Confirm" })).toBeDisabled();

    await distance.fill("50");
    await expect(page.getByRole("button", { name: "Confirm" })).toBeEnabled();
  });

  test("QA-04: an implausible scale soft-warns and offers Use anyway", async ({ page }) => {
    await setScale(page).click({ force: true });
    const canvas = page.locator(".canvas, canvas").first();
    const box = await canvas.boundingBox();
    await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height * 0.5);
    await page.mouse.click(box!.x + box!.width * 0.7, box!.y + box!.height * 0.5);

    // 0.5 m across 40% of a 1200px plan implies a ~1.25 m wide venue.
    await page.getByRole("textbox", { name: "Distance" }).fill("0.5");
    await expect(page.getByRole("button", { name: "Use anyway" })).toBeVisible();

    // A sane distance clears the warning.
    await page.getByRole("textbox", { name: "Distance" }).fill("80");
    await expect(page.getByRole("button", { name: "Use anyway" })).toHaveCount(0);
  });

  test("calibration persists across a reload", async ({ page }) => {
    await setScale(page).click({ force: true });
    const canvas = page.locator(".canvas, canvas").first();
    const box = await canvas.boundingBox();
    await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height * 0.5);
    await page.mouse.click(box!.x + box!.width * 0.7, box!.y + box!.height * 0.5);
    await page.getByRole("textbox", { name: "Distance" }).fill("80");
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByRole("button", { name: "Recalibrate" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Recalibrate" })).toBeVisible();
    await expect(page.getByText(/uncalibrated/i)).toHaveCount(0);
  });
});

test("image upload does not fetch pdfjs", async ({ page }) => {
  await newProject(page, `IMG ${Date.now()}`);
  const hits: { url: string; encoded: number }[] = [];
  page.on("response", (res) => {
    if (!isPdfjsRequest(res.url())) return;
    hits.push({ url: res.url(), encoded: Number(res.headers()["content-length"] ?? 0) });
  });
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await expect(setScale(page)).toBeVisible({ timeout: 20_000 });
  expect(hits, `pdfjs requested on image upload: ${JSON.stringify(hits)}`).toEqual([]);
});

test("QA-18: the confirm step is a dialog, and its message appears once", async ({ page }) => {
  await newProject(page, `QA18 ${Date.now()}`);
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await expect(setScale(page)).toBeVisible({ timeout: 20_000 });
  await setScale(page).click({ force: true });

  const canvas = page.locator(".canvas, canvas").first();
  const box = await canvas.boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.45, box!.y + box!.height * 0.5);
  await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.5);

  const dialog = page.getByRole("dialog", { name: "Set scale" });
  await expect(dialog).toBeVisible();

  // A short reference line over a small distance is implausible.
  await dialog.getByRole("textbox", { name: "Known distance" }).fill("0.4");
  await expect(dialog.getByRole("button", { name: "Use anyway" })).toBeVisible();

  // The warning must render EXACTLY once, not in the dialog AND the mode bar.
  const sentence = /reference line is very short|would make this plan about/i;
  expect(await page.getByText(sentence).count(), "warning must not be duplicated").toBe(1);

  // Everything the user must read has to be inside the viewport.
  for (const el of [dialog.getByRole("textbox", { name: "Known distance" }), dialog.getByRole("button", { name: "Confirm" })]) {
    const b = await el.boundingBox();
    expect(b!.x + b!.width).toBeLessThanOrEqual(1366);
    expect(b!.y + b!.height).toBeLessThanOrEqual(768);
  }
});
