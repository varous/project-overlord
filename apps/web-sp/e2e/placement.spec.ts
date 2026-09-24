import { expect, test } from "@playwright/test";
import path from "node:path";
import { newProject } from "./helpers";

const FIXTURE = path.resolve("e2e/fixtures/venue-plan-1200x800.png");

test.describe("package placement", () => {
  test("GET /api/catalogue/packages never serialises a rate", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.get("/api/catalogue/packages");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.packages)).toBe(true);
    const dumped = JSON.stringify(body);
    expect(dumped).not.toMatch(/valuePaise/i);
    expect(dumped).not.toMatch(/"rates"/);
    expect(dumped).not.toMatch(/litresPerHour/i);
  });

  test("QA-19: picking a package after upload leaves the mode bar out of calibrate", async ({ page }) => {
    await newProject(page, `QA19 ${Date.now()}`);
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect(
      page.locator(".viewbar").getByRole("button", { name: /Set scale|Recalibrate/ }).first(),
    ).toBeVisible({ timeout: 20_000 });

    const modebar = page.locator(".modebar");
    await expect(modebar).toContainText(/Calibrate/);
    await expect(modebar).toContainText(/first point of a known distance/i);

    await page.getByRole("tab", { name: "Assets" }).click();
    await page.getByTitle("Genset 125 kVA Drop").click();

    await expect(modebar).not.toContainText(/Calibrate/);
    await expect(modebar).not.toContainText(/first point|second point/i);
    await expect(modebar).toContainText(/Click to place Genset/);
  });

  test("FIXED click after uploading a plan POSTs an instance that survives reload", async ({ page }) => {
    await newProject(page, `MapPlace ${Date.now()}`);
    const projectId = page.url().split("/").pop() as string;
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect(
      page.locator(".viewbar").getByRole("button", { name: /Set scale|Recalibrate/ }).first(),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("tab", { name: "Assets" }).click();
    await page.getByTitle("Genset 125 kVA Drop").click();
    await expect(page.getByText("Place Genset 125 kVA Drop", { exact: true })).toBeVisible();
    await expect(page.getByText(/Click to place Genset/)).toBeVisible();

    const canvas = page.locator("main.canvas canvas").first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const posted = page.waitForRequest(
      (req) => req.method() === "POST" && /\/projects\/[^/]+\/instances$/.test(new URL(req.url()).pathname),
    );
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    const req = await posted;
    expect(req.method()).toBe("POST");
    expect((await req.response())?.ok()).toBeTruthy();

    await expect(page.getByText(/placement uses this kit/)).toBeVisible();

    await page.reload();
    const layout = await page.request.get(`/api/projects/${projectId}/layout`);
    expect(layout.ok()).toBeTruthy();
    const body = (await layout.json()) as { instances: unknown[] };
    expect(body.instances).toHaveLength(1);
  });

  test("FIXED package places with no map; two drops share a variant", async ({ page }) => {
    await newProject(page, `Place ${Date.now()}`);
    await page.getByRole("tab", { name: "Assets" }).click();
    await page.getByTitle("Genset 125 kVA Drop").click();
    const canvas = page.locator("main.canvas canvas").first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.getByText(/placement uses this kit|placements use this kit/)).toBeVisible({
      timeout: 10_000,
    });
    await page.mouse.click(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2);
    await expect(page.getByText("2 placements use this kit")).toBeVisible({ timeout: 10_000 });
  });

  test("PER_AREA drop is allowed uncalibrated and marked unquantifiable", async ({ page }) => {
    await newProject(page, `Area ${Date.now()}`);
    await page.getByRole("tab", { name: "Assets" }).click();
    await page.getByTitle("Box Office").click();
    const canvas = page.locator("main.canvas canvas").first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.getByText("Unquantifiable").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Required")).toBeVisible();
  });
});
