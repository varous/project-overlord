import { expect, test, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { newProject } from "../helpers";

const MENUS = ["File", "Edit", "View", "Modify", "Model", "Tools", "Text", "Window", "Help"] as const;

function attachConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Chromium logs these as console.error. Neither is an app failure:
    // missing favicon, and the unauthenticated /api/auth/me probe (401).
    if (/favicon|401 \(Unauthorized\)/i.test(text)) return;
    errors.push(text);
  });
  return errors;
}

/** Gzip -9 of the files a cold first paint actually fetches (html + index js/css). */
function firstLoadGzipFromDist(): { bytes: number; files: { file: string; gzip: number }[] } {
  const dist = join("packages/web/dist");
  if (!existsSync(dist)) return { bytes: 0, files: [] };
  const files: { file: string; gzip: number }[] = [];
  const html = join(dist, "index.html");
  if (existsSync(html)) {
    files.push({ file: "index.html", gzip: gzipSync(readFileSync(html), { level: 9 }).length });
  }
  const assets = join(dist, "assets");
  if (existsSync(assets)) {
    for (const name of readdirSync(assets)) {
      if (!/^index-.*\.(js|css)$/.test(name)) continue;
      files.push({
        file: `assets/${name}`,
        gzip: gzipSync(readFileSync(join(assets, name)), { level: 9 }).length,
      });
    }
  }
  return { bytes: files.reduce((s, f) => s + f.gzip, 0), files };
}

async function firstLoadBytes(page: Page): Promise<{ transfer: number; decoded: number }> {
  return page.evaluate(() => {
    const entries = [
      ...performance.getEntriesByType("navigation"),
      ...performance.getEntriesByType("resource"),
    ] as PerformanceResourceTiming[];
    const rows = entries
      .filter((e) => e.entryType === "navigation" || /\.(js|css)(\?|$)/.test(e.name))
      .filter((e) => !/pdf\.worker|\/pdf-/i.test(e.name))
      .map((e) => ({ transferSize: e.transferSize, decodedBodySize: e.decodedBodySize }));
    return {
      transfer: rows.reduce((s, r) => s + r.transferSize, 0),
      decoded: rows.reduce((s, r) => s + r.decodedBodySize, 0),
    };
  });
}

function logFirstLoad(label: string, transferred: { transfer: number; decoded: number }): void {
  const gz = firstLoadGzipFromDist();
  console.log(
    `${label}: ${transferred.decoded.toLocaleString("en-IN")} B decoded, ` +
      `${transferred.transfer.toLocaleString("en-IN")} B transferred ` +
      `(gzip on the wire). gzip-9 of html+index js/css: ${gz.bytes.toLocaleString("en-IN")} B ` +
      `(${(gz.bytes / 1024).toFixed(1)} KiB)` +
      gz.files.map((f) => `\n  ${String(f.gzip).padStart(7)}  ${f.file}`).join(""),
  );
}

test.describe("production SPA smoke", () => {
  test.describe("unauthenticated", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    // These hit Fastify, not Vite. GET / with index:false was 403 in production
    // because the static wildcard matched the directory and skipped the SPA
    // fallback. Vite preview (and the DEV server) serve index.html themselves.
    test("GET / returns the SPA shell", async ({ request }) => {
      const res = await request.get("/");
      expect(res.status(), `GET / status ${res.status()}`).toBe(200);
      expect(res.headers()["content-type"]).toMatch(/text\/html/);
      expect(await res.text()).toContain('<div id="root">');
    });

    test("GET /projects/does-not-exist returns the SPA shell, not a 404 page", async ({ request }) => {
      const res = await request.get("/projects/does-not-exist");
      expect(res.status(), `GET /projects/does-not-exist status ${res.status()}`).toBe(200);
      expect(res.headers()["content-type"]).toMatch(/text\/html/);
      expect(await res.text()).toContain('<div id="root">');
    });

    test("GET /api/unknown still returns JSON 404", async ({ request }) => {
      const res = await request.get("/api/does-not-exist");
      expect(res.status()).toBe(404);
      expect(res.headers()["content-type"]).toMatch(/json/);
      expect(await res.json()).toEqual({ error: "not_found" });
    });

    test("sign-in boots with no console errors", async ({ page }) => {
      const errors = attachConsole(page);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "ShowPlan" })).toBeVisible();
      await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
      expect(errors, errors.join("\n")).toEqual([]);
      logFirstLoad("production SIGN-IN first-load", await firstLoadBytes(page));
    });
  });

  test("editor shell ships with menus present and disabled", async ({ page, browser }) => {
    const errors = attachConsole(page);
    const id = await newProject(page, `PROD ${Date.now()}`);
    for (const name of MENUS) {
      await expect(
        page.getByRole("menuitem", { name, exact: true }),
        `${name} must be in the production shell and disabled`,
      ).toBeDisabled();
    }
    await expect(page.locator(".ref-ribbon")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);

    // Cold context so HTTP cache from newProject does not shrink the number.
    const cold = await browser.newContext({
      storageState: "e2e/.auth/state.json",
      viewport: { width: 1366, height: 768 },
    });
    const editor = await cold.newPage();
    await editor.goto(`/projects/${id}`);
    await expect(editor.getByRole("menuitem", { name: "File", exact: true })).toBeDisabled();
    logFirstLoad("production EDITOR first-load (no base map)", await firstLoadBytes(editor));
    await cold.close();
  });

  test("/_reference does not resolve to the V2 shell", async ({ page }) => {
    const res = await page.goto("/_reference");
    expect(res?.ok(), `GET /_reference status ${res?.status()}`).toBeTruthy();
    await expect(page.locator("[aria-busy='true']")).toHaveCount(0);
    await expect(page.locator(".ref-ribbon")).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "File", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  });
});
