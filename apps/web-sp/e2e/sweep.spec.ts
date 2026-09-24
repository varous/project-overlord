import { expect, test } from "@playwright/test";
import path from "node:path";
import { newProject } from "./helpers";

const FIXTURE = path.resolve("e2e/fixtures/venue-plan-1200x800.png");
const SHOTS = "e2e/.shots";

/** Visual sweep. Not assertions — screenshots for a human/agent to look at. */
test.describe("sweep", () => {
  test("sign-in page theme (unauthenticated)", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("http://localhost:5173/");
    await expect(page.getByText(/sign in with google/i)).toBeVisible();
    const theme = await page.evaluate(() => ({
      attr: document.documentElement.dataset.theme ?? "(unset)",
      bg: getComputedStyle(document.body).backgroundColor,
    }));
    console.log(`SIGNIN THEME: ${JSON.stringify(theme)}`);
    await page.screenshot({ path: `${SHOTS}/01-signin.png` });
    await ctx.close();
  });

  test("dashboard + editor, light and dark", async ({ page }) => {
    await page.goto("/");
    await page.screenshot({ path: `${SHOTS}/02-dashboard-light.png` });

    await newProject(page, `SWEEP ${Date.now()}`);
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/03-editor-light.png` });

    // Flip theme however the app exposes it, then check every screen follows.
    const toggled = await page.evaluate(() => {
      const el = document.documentElement;
      el.dataset.theme = "dark";
      try {
        localStorage.setItem("showplan.theme.v2", "dark");
      } catch {
        /* ignore */
      }
      return el.dataset.theme;
    });
    console.log(`FORCED THEME: ${toggled}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/04-editor-dark.png` });

    await page.goto("/");
    await page.waitForTimeout(600);
    const dashTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? "(unset)");
    console.log(`DASHBOARD THEME AFTER DARK: ${dashTheme}`);
    await page.screenshot({ path: `${SHOTS}/05-dashboard-dark.png` });
  });
});
