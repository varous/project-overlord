import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import path from "node:path";

export const VENUE_FIXTURE = path.resolve("e2e/fixtures/venue-plan-1200x800.png");

export async function newProject(page: Page, name: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "New project" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  return page.url().split("/").pop() as string;
}

function setScale(page: Page) {
  return page.locator(".viewbar").getByRole("button", { name: /Set scale|Recalibrate/ }).first();
}

export async function uploadAndCalibrate(
  page: Page,
  distance = "80",
  fixture = VENUE_FIXTURE,
): Promise<void> {
  await page.setInputFiles('input[type="file"]', fixture);
  await expect(setScale(page)).toBeVisible({ timeout: 20_000 });
  await setScale(page).click({ force: true });
  const canvas = page.locator("main.canvas canvas").first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height * 0.5);
  await page.mouse.click(box!.x + box!.width * 0.7, box!.y + box!.height * 0.5);
  await page.getByRole("textbox", { name: "Distance" }).fill(distance);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("button", { name: "Recalibrate" })).toBeVisible();
}
