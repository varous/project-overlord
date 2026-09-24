import { expect, test } from "@playwright/test";
import { newProject, uploadAndCalibrate, VENUE_FIXTURE } from "./helpers";

test.describe("measurement tools", () => {
  test("uncalibrated: measure tools disabled in place with an honest tooltip", async ({ page }) => {
    await newProject(page, `MeasUncal ${Date.now()}`);
    await page.setInputFiles('input[type="file"]', VENUE_FIXTURE);
    await expect(
      page.locator(".viewbar").getByRole("button", { name: /Set scale|Recalibrate/ }).first(),
    ).toBeVisible({ timeout: 20_000 });

    const distance = page.getByRole("button", { name: /Measure distance/ });
    const area = page.getByRole("button", { name: /Measure area/ });
    await expect(distance).toBeDisabled();
    await expect(area).toBeDisabled();
    await expect(distance).toHaveAttribute("title", /Set scale before measuring/);
    await expect(area).toHaveAttribute("title", /Set scale before measuring/);
  });

  test("QA-21: snap toggles are disabled in place until an engine exists", async ({ page }) => {
    await newProject(page, `QA21 ${Date.now()}`);
    const grid = page.getByRole("button", { name: /Snap to grid/ });
    const object = page.getByRole("button", { name: /Snap to object/ });
    await expect(grid).toBeDisabled();
    await expect(object).toBeDisabled();
    await expect(grid).toHaveAttribute("title", /Snapping is not built yet/);
    await expect(object).toHaveAttribute("title", /Snapping is not built yet/);
  });

  test("calibrated distance mark POSTs pixels, survives reload, and is not a quote line", async ({
    page,
  }) => {
    await newProject(page, `Meas ${Date.now()}`);
    const projectId = page.url().split("/").pop() as string;
    await uploadAndCalibrate(page, "80");

    await expect(page.getByRole("button", { name: /^Measure distance$/ })).toBeEnabled();
    const area = page.getByRole("button", { name: /Measure area/ });
    await expect(area).toBeDisabled();
    await expect(area).toHaveAttribute("title", /Area measure follows in a later pass/);

    await page.getByRole("button", { name: /^Measure distance$/ }).click();
    const modebar = page.locator(".modebar");
    await expect(modebar).toContainText(/Click two points/i);
    await expect(modebar).not.toContainText(/Calibrate|Click to place/i);

    const canvas = page.locator("main.canvas canvas").first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const posted = page.waitForRequest(
      (req) =>
        req.method() === "POST" && /\/projects\/[^/]+\/measurements$/.test(new URL(req.url()).pathname),
    );
    await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.4);
    await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.4);
    const req = await posted;
    expect((await req.response())?.ok()).toBeTruthy();
    const body = req.postDataJSON() as { points: unknown };
    expect(Array.isArray(body.points)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/metre|qty|amount|paise/i);

    await expect(page.getByText("Informational — not a quote line.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete measurement", exact: true })).toBeVisible();
    await expect(page.locator(".oip__eyebrow")).toHaveText("Measurement");
    // Dual reading lives in the inspector, not on the canvas mark.
    await expect(page.locator(".oip__title")).toHaveText(/m \(.+ft\)/);
    await expect(page.locator(".panel-right .numeric").first()).toHaveText(/m \(.+ft\)/);

    await page.reload();
    const layout = await page.request.get(`/api/projects/${projectId}/layout`);
    expect(layout.ok()).toBeTruthy();
    const payload = (await layout.json()) as {
      measurements: { id: string; points: unknown }[];
    };
    expect(payload.measurements).toHaveLength(1);
    expect(JSON.stringify(payload.measurements)).not.toMatch(/qtyRule|amount|valuePaise/i);
  });

  test("inspector delete removes the mark", async ({ page }) => {
    await newProject(page, `MeasDel ${Date.now()}`);
    const projectId = page.url().split("/").pop() as string;
    await uploadAndCalibrate(page, "80");
    await page.getByRole("button", { name: /^Measure distance$/ }).click();
    const canvas = page.locator("main.canvas canvas").first();
    const box = await canvas.boundingBox();
    const posted = page.waitForRequest(
      (req) =>
        req.method() === "POST" && /\/projects\/[^/]+\/measurements$/.test(new URL(req.url()).pathname),
    );
    await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.45);
    await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.45);
    await posted;
    await expect(page.getByRole("button", { name: "Delete measurement", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete measurement", exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete measurement", exact: true })).toHaveCount(0);
    const layout = await page.request.get(`/api/projects/${projectId}/layout`);
    expect((await layout.json() as { measurements: unknown[] }).measurements).toHaveLength(0);
  });
});
