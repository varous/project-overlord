import { expect, test } from "@playwright/test";
import { newProject } from "./helpers";

/**
 * QA-23: the smoke spec asserted Sign out was visible and never clicked it.
 * Logout is a bodyless POST — the same pattern as QA-22's DELETE 400.
 * Uses a dedicated storageState so destroying the session cannot 401 the suite.
 */
test.describe("QA-23: Sign out ends the session", () => {
  test.use({ storageState: "e2e/.auth/logout-state.json" });

  test("clicking Sign out clears the session and blocks protected routes", async ({
    page,
  }) => {
    const projectId = await newProject(page, `Logout ${Date.now()}`);
    const projectPath = `/projects/${projectId}`;

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect((await page.request.get("/api/auth/me")).status()).toBe(200);

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

    expect((await page.request.get("/api/auth/me")).status()).toBe(401);

    const protectedGet = await page.request.get(`/api/projects/${projectId}`);
    expect(protectedGet.status()).toBe(401);

    await page.goto(projectPath);
    await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload plan" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Projects" })).toHaveCount(0);
  });
});
