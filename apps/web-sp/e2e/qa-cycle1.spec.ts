import { expect, test } from "@playwright/test";
import path from "node:path";
import { newProject } from "./helpers";

const FIXTURE_FOR_QA20 = path.resolve("e2e/fixtures/venue-plan-1200x800.png");

/**
 * Cycle 1 regressions. Each test names the QA-LOG id it locks down.
 * See .agent/QA-LOG.md for repro history.
 */

test("smoke: signed-in user lands on the projects dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("QA-11: clicking the project NAME opens the project", async ({ page }) => {
  const name = `QA11 ${Date.now()}`;
  await newProject(page, name);

  await page.goto("/");
  // Click the name text itself, not the row padding — this is what regressed.
  await page.getByText(name, { exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
});

test("QA-11b: the create field must not steal focus on load", async ({ page }) => {
  await page.goto("/");
  const focused = await page.evaluate(() => document.activeElement?.tagName ?? "");
  expect(focused).not.toBe("INPUT");
});

test("QA-10: a missing project keeps the app chrome", async ({ page }) => {
  await page.goto("/projects/definitely-not-a-real-id");
  await expect(page.getByText(/not found/i)).toBeVisible();
  // The failure mode was a bare page with no shell at all.
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("QA-02: at 1366x768 the inspector panel is fully on screen", async ({ page }) => {
  await newProject(page, `QA02 ${Date.now()}`);

  // These labels sat outside the viewport and were unreachable.
  for (const label of ["Depth", "Scale"]) {
    const el = page.getByText(label, { exact: true }).first();
    await expect(el).toBeVisible();
    const box = await el.boundingBox();
    expect(box, `${label} has no box`).not.toBeNull();
    expect.soft(box!.x + box!.width, `${label} overflows the viewport`).toBeLessThanOrEqual(1366);
  }

  // Nothing may scroll horizontally: the shell fits, the canvas shrinks.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("QA-05: theme is one app-wide decision, defaulting to light", async ({ page }) => {
  await page.goto("/");
  const dashboardTheme = await page.evaluate(
    () => document.documentElement.dataset.theme ?? "light",
  );
  expect(dashboardTheme).toBe("light");

  await newProject(page, `QA05 ${Date.now()}`);
  const editorTheme = await page.evaluate(
    () => document.documentElement.dataset.theme ?? "light",
  );
  expect(editorTheme, "editor and dashboard must not render different themes").toBe(
    dashboardTheme,
  );
});

test("QA-06: select mode does not show calibrate copy", async ({ page }) => {
  await newProject(page, `QA06 ${Date.now()}`);
  await expect(page.getByText(/click to place points/i)).toHaveCount(0);
});

test("QA-13: a legacy OS-derived theme value must not survive", async ({ page }) => {
  await page.goto("/");
  // Simulate a browser that used the app before the QA-05 fix.
  await page.evaluate(() => {
    localStorage.removeItem("showplan.theme.v2");
    localStorage.setItem("showplan.theme", "dark");
  });
  await page.reload();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? "light");
  expect(theme, "an inherited OS preference must not become a sticky choice").toBe("light");
});

test("QA-16: unbuilt shell slots are disabled in place, not dead buttons", async ({ page }) => {
  await newProject(page, `QA16 ${Date.now()}`);
  for (const name of ["File", "Edit", "View", "Modify", "Model", "Tools", "Text", "Window", "Help"]) {
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
      `${name} menu must be disabled until it does something`,
    ).toBeDisabled();
  }
  // Share is slice 8.
  await expect(page.getByRole("button", { name: "Share" })).toBeDisabled();
});

test("view-bar dropdown and segmented controls are operable from the keyboard", async ({ page }) => {
  await page.goto("/_reference");

  const view = page.locator(".viewbar").getByRole("button", { name: "View:" });
  await expect(view).toBeEnabled();
  await view.focus();
  await page.keyboard.press("ArrowDown");
  const saved = page.getByRole("menuitem", { name: "Saved Views", exact: true });
  await expect(saved).toBeVisible();
  await expect(saved).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "None", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(saved).toBeHidden();
  await expect(view).toBeFocused();

  const plan = page.locator(".viewbar").getByRole("radio", { name: "2D" });
  await expect(plan).toBeEnabled();
  await plan.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".viewbar").getByRole("radio", { name: "3D" })).toBeFocused();

  const light = page.locator(".menubar").getByRole("radio", { name: "☀" });
  await expect(light).toBeEnabled();
  await light.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".menubar").getByRole("radio", { name: "☾" })).toBeFocused();
  await page.evaluate(() => {
    localStorage.setItem("showplan.theme.v2", "light");
    document.documentElement.setAttribute("data-theme", "light");
  });
});

test("app menubar is operable from the keyboard on /_reference", async ({ page }) => {
  await page.goto("/_reference");
  const file = page.getByRole("menuitem", { name: "File", exact: true });
  await expect(file).toBeEnabled();
  await file.focus();
  await page.keyboard.press("ArrowDown");
  const first = page.getByRole("menuitem", { name: "New", exact: true });
  await expect(first).toBeVisible();
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Open…", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(first).toBeHidden();
  await expect(file).toBeFocused();
});

test("QA-17: the canvas cursor follows the selected tool", async ({ page }) => {
  await newProject(page, `QA17 ${Date.now()}`);
  const cursorFor = async (tool: string) => {
    await page.locator(".tool-rail").getByRole("button", { name: tool, exact: true }).click({ force: true });
    await page.waitForTimeout(150);
    return page.evaluate(
      () => getComputedStyle(document.querySelector("main.canvas") as Element).cursor,
    );
  };
  expect(await cursorFor("Pan")).toBe("grab");
  expect(await cursorFor("Zoom")).toBe("zoom-in");
  expect(await cursorFor("Select")).toBe("default");
});

test("QA-20: undo/redo keep their verb in the accessible name", async ({ page }) => {
  await newProject(page, `QA20 ${Date.now()}`);
  // With nothing to undo they are plain and disabled.
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();

  // Once there is history the label must still START with the verb — a control
  // announced as "Place Box Office" reads as one that places, not one that undoes.
  await page.setInputFiles('input[type="file"]', FIXTURE_FOR_QA20);
  await page.waitForTimeout(2000);
  await page.getByText("Assets", { exact: true }).first().click({ force: true });
  await page.getByText("Genset 125 kVA Drop", { exact: false }).first().click({ force: true });
  const box = (await page.locator(".canvas").first().boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.waitForTimeout(1200);

  const undo = page.locator(".viewbar button").first();
  const name = (await undo.getAttribute("aria-label")) ?? "";
  expect(name.startsWith("Undo"), `undo label was "${name}"`).toBe(true);
});
