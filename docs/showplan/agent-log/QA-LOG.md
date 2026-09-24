# QA log — ShowPlan

Permanent bug knowledge base. **Newest cycle first.**  
Statuses: `open` · `fixed` · `wontfix` · `accepted-debt` · `awaiting-decision`

Each entry: id, cycle, severity, repro, expected, actual, status, fixing commit, notes.

---

## Cycle 11 — 2026-08-16 (production GET / 403)

### QA-25 · cycle 11 · HIGH · fixed (spec)
**Repro:** https://showplan.onrender.com/ after a clean boot. Server logs healthy; GET `/favicon.ico` is 200.  
**Expected:** GET `/` returns 200 `text/html` (the SPA shell). Deep links such as `/projects/:id` also return the shell. `/api/<unknown>` stays JSON 404.  
**Actual:** GET `/` was 403 Forbidden. `@fastify/static` was registered with `index: false`, so `/` matched the wildcard, resolved to the dist **directory**, and `@fastify/send` returned 403. Because the static plugin handled the request, `setNotFoundHandler` never ran — the SPA fallback was dead code for `/` only. Deep links still 404'd into `callNotFound()` and worked.  
**Why this escaped:** every existing e2e spec, including PR #16's production smoke, requested `/` from **Vite** (dev server or `vite preview`). Vite serves `index.html` itself. No test had ever requested `/` from the Fastify production build. Same class of failure as ADR-008: a DEV/preview stand-in that does not share the production request path.  
**Status:** fixed — `index: ["index.html"]`; notFoundHandler kept. Production smoke now boots Fastify with `NODE_ENV=production` (one origin, like Render) and asserts GET `/`, a deep link, and `/api/does-not-exist`.  
**Spec:** `e2e/production/smoke.spec.ts` (`GET / returns the SPA shell`, deep link, API JSON 404).

---

## Cycle 10 — 2026-08-15 (quote API on `dev-mac` · viewer DTO held)

### Note — `usedGenericFallback` on the MEMBER payload (slice 8)
Joyjeet probed PR #8 independently. MEMBER preview/issued JSON correctly has `ratePaise` and no `rates[]` / `valuePaise` / `resolvedCity`. It **does** include `usedGenericFallback` on each line.

Harmless for MEMBER/ADMIN internally (it answers "did this city miss and we used the generic row?"). It is on the **forbidden list for viewers**: it is a rate-resolution breadcrumb, and a client-facing DTO must not leak how the card was walked. Strip it when the viewer DTO is built (slice 8). Do not rediscover this at share-link time.

Also held for slice 8: whether a client-facing quote itemises qty and billed days (unit rate is one division away).

PR #8 merged to `dev-mac` as `39777cd`. CI on that push: checks + docker green.

---

## Cycle 9 — 2026-08-14 (QA-24 · enabled with no handler)

### QA-24 · cycle 9 · HIGH · fixed (class check)
**Repro:** Fit to window, Show grid, Show rulers, Show page boundary rendered enabled and did nothing. Grid was even `active`. Fourth instance of the same class after app menus, Share, and snaps.  
**Expected:** Unbuilt chrome disabled in place, with an honest tooltip. A check that fails the *class*, not another one-off.  
**Actual:** Those four (and **Add zone**, which the check also found) had neither `disabled` nor `onClick`.  
**Status:** fixed — `scripts/qa-no-handler.mjs` scans `IconButton` / `Button` call sites; `npm run status` and CI run it. The four go through `capabilities.drawingAids`. Add zone goes through existing `cadOrganisation`.  
**Why static, not Playwright:** the DOM cannot tell a no-op button from a working one. The lie is in the source (no handler). Playwright can only assert `disabled`, which is the symptom after the cap is wired.  
**Spec:** `node scripts/qa-no-handler.mjs` (status + CI).

### Known limit of QA-24 — ToolChip / Select
The check looks at `IconButton` / `Button` *call sites*. `ToolChip` and `Select` always attach `onClick` / `onChange` inside `primitives.tsx`, even when the call site passes no handler — so they look live, do nothing, and the scanner still passes. That is a **known limit of the check**, not a silent gap. Stage/Truss/… chips and the View/Zone/Level/Plane/Zoom selects are in that set. Closing it means either disabling those via capabilities (same as Fit/grid) or teaching the scanner to require `onSelect`/`onChange` at the call site. Do not assume QA-24 covers them.

---

## Cycle 8 — 2026-08-14 (sign-out actually clicked)

### QA-23 · cycle 8 · HIGH · fixed (spec)
**Repro:** Smoke spec `smoke: signed-in user lands on the projects dashboard` asserts `Sign out` is visible. Nobody clicks it.  
**Expected:** Click Sign out → session gone (sign-in screen, `/api/auth/me` 401), protected routes unreachable.  
**Actual:** The button rendered for five slices while `POST /api/auth/logout` 400'd (QA-22 — empty JSON `Content-Type` on a bodyless verb). The API inject test sent no Content-Type, so it stayed green.  
**Lesson:** "asserts the control exists" is not "asserts the control works". This is the **second** time a bodyless-request pattern hid a real failure (first: inspector DELETE; second: Sign out). A client that only sets the header when there is a body is the fix; a spec that *clicks the control* is the lock.  
**Status:** fixed — `e2e/logout.spec.ts` clicks Sign out against a sacrificial session (destroying the shared e2e cookie would 401 the rest of the suite).  
**Spec:** `QA-23` in `e2e/logout.spec.ts`.

### Note — coverage that only asserts the control renders
Named, not fixed. Live (or live-looking) controls whose Playwright coverage is visibility / disabled / cursor / accessible-name, not the action:

- **Theme ☀/☾** — QA-05/QA-13 read `data-theme`; sweep writes localStorage. The segmented control is never clicked.
- **Archive** — dashboard button; API PATCH is tested; the modal confirm is never driven.
- **Undo / Redo** — QA-20 locks the verb in `aria-label`; neither is clicked to reverse a placement.
- **Pan / Zoom / Select** — QA-17 locks the CSS cursor; pan does not assert a transform, zoom does not assert a scale.
- **Projects** back button in the editor menubar — never clicked.
- **Replace plan** — never clicked; upload-from-empty is the only path.
- **Recalibrate** — label appears after Confirm; a second calibration pass is not spec'd.
- **Fit to window / Show grid / Show rulers / Show page boundary** — were on this list; **QA-24** disables them. ToolChip/Select remain a known limit of that check.
- **Package search** — never typed.
- **Tool Sets / Layers** tabs — only Assets is selected.
- **Tool chips** (Stage, Truss, …) — decorative; no action. QA-24 does not see them (known limit).
- **View / Zone / Level / Plane / Zoom** selects — render only. QA-24 does not see them (known limit).
- **2D segmented** (canvas gizmo + viewbar) — never switched.
- **Avatar stack** — render only.
- **Inspector X/Y/Width/Depth/Rotation and instance params** — QA-02 checks Depth/Scale are on screen; no blur/PATCH.
- **Placement delete** — Backspace/Delete only; e2e never presses it (measurement delete *is* clicked).
- **Sign in with Google** — visible on the login page; the OIDC round-trip is API-tested, not browser-clicked (Google is out of process).
- **`/_reference`** — no e2e.

Disabled-in-place slots (File/Edit/…, Share, snap chips, Measure area, Flyover, 3D primitives) are a different class: QA-16/QA-21 *want* them disabled.

---

## Cycle 7 — 2026-08-14 (slice 5 · measurement tools)

### QA-21 · cycle 7 · MEDIUM · fixed
**Repro:** Status bar Snap to grid / Snap to object are enabled and pressed by default.  
**Expected:** Unbuilt controls disabled in place, with an honest tooltip (QA-16).  
**Actual:** Both toggles looked live and did nothing — including for placements. Same lie QA-16 fixed for File/Share.  
**Status:** fixed — `capabilities.snapping` is false in the MVP; both core snap chips disabled with tooltip *"Snapping is not built yet"*. They light up when an engine exists rather than silently starting to work.  
**Spec:** `QA-21` in `e2e/measurement.spec.ts`.

### QA-22 · cycle 7 · HIGH · fixed (client)
**Repro:** DELETE a measurement (or an instance) from the inspector.  
**Expected:** 204, row gone.  
**Actual:** Fastify `400` `FST_ERR_CTP_EMPTY_JSON_BODY` — `request()` always set `Content-Type: application/json`, including on bodyless verbs.  
**Class:** Fastify parses a JSON body on POST / PUT / PATCH / DELETE when that header is present. An empty body is 400. GET is not parsed, so layout/catalogue/me were never hit.  
**Also in the hole:** `POST /api/auth/logout` (bodyless). Those three were the only bodyless mutating calls in `api.ts`. PATCH/POST with a body were fine.  
**Fix:** set the JSON content-type only when `init.body` is present.  
**Spec:** `QA-22` in `packages/api/test/measurements.test.ts` (DELETE vs GET) and `packages/api/test/auth.test.ts` (logout 400-with-header). The **click** is QA-23.

### Note — Playwright cannot visually verify against real CAD sheets
The Gachibowli indoor-stadium PDF (and likely any heavy AutoCAD export) does not finish rasterising/painting in the Playwright pass — the canvas stays on *"Loading venue plan…"* while the suite has already moved on. Visual judgement on real plans is a **human step**. The e2e fixture is a generated grid; do not assume the suite covers mark-vs-linework clutter.

---

## Cycle 6 — 2026-08-14 (re-sweep of slice 4 after the QA-19 fix)

Placement verified end to end with a FULL screen-state dump (mode bar, inspector,
status bar, banner, viewbar) rather than a single panel — probing one panel is
exactly how QA-19 hid from me for half an hour.

### Verified working, no defect
- Upload triggers the F4.1 calibrate nudge; picking a package cancels it. Mode bar goes `Calibrate…` → `Place: Click to place Genset 125 kVA Drop`. Never both.
- Placement POSTs 201 and survives reload.
- **Quantity honesty on an uncalibrated plan** — the behaviour we argued for, working:
  `Main Stage Platform (PER_AREA) — Unquantifiable` · `Front Fascia (PER_LENGTH) — Unquantifiable` · `Plug point 5A → 1` · `LED Metal Light → 2`.
  Geometry-derived lines blank, count lines still quantified.
- Kit flags legible and read-only: Required / Included / Optional-off.
- Blast-radius readout present: "1 placement uses this kit".
- Instance-level params render under "This placement" (`counters`), confirming the params-on-the-instance split holds in the UI.
- Uncalibrated banner returns once the calibrate prompt is dismissed.

### QA-20 · cycle 6 · MEDIUM · fixed (accessibility)
**Measured:** the Undo button's accessible name became the command label alone — `aria-label="Place Box Office"`, no verb.
**Why it matters:** a control announced as "Place Box Office" reads as one that PLACES. For a screen-reader user that is the opposite of what it does, and for anyone scanning the viewbar the word "Undo" has vanished.
**Fix:** `Undo ${label}` / `Redo ${label}`, falling back to plain `Undo` / `Redo` when there is no history. The useful context is kept; the verb leads.
**Spec:** `QA-20` asserts the accessible name starts with the verb both when disabled and after a placement.

### Note — not a defect
`e2e/sweep.spec.ts` was forcing dark through the **legacy** `showplan.theme` key, which QA-13 now correctly ignores, so its console line read "light" and looked like a regression. Updated to the `.v2` key. The diagnostic was stale, not the app.

---

## Cycle 5 — 2026-08-14 (PR #4 review · localhost:5173)

### QA-19 · cycle 5 · HIGH · fixed
**Repro:** Open a project, upload a plan, Assets tab, click "Genset 125 kVA Drop" (FIXED), click the canvas.  
**Expected:** A placement is created (`POST /instances`); the mode bar is in place, not calibrate.  
**Actual:** Inspector title became "Place Genset 125 kVA Drop"; zero POSTs; layout `instances: []`. Same for a PER_AREA drag. Calibration clicks on the same Stage *did* fire.  
**Root cause:** `runUpload` ends with `setCalPhase("a")` per F4.1, the `onMouseDown` handler checked `calibrating` before `placing`, so the placement click was consumed as cal point A. The inspector and mode bar showed contradictory states at the same time (inspector: Place Genset; mode bar: Calibrate · Click the second point). That split is the reusable lesson: two independent flags can both be live, and the chrome will lie.  
**Status:** fixed — canvas interaction is one `CanvasMode` value (`tool` | `place` | `calibrate`). Contradictory states are unrepresentable. Measure (slice 5) adds a variant; it cannot be live with place or calibrate.  
**Spec:** `QA-19` in `e2e/placement.spec.ts` (asserts the **mode bar** text, not only the POST). POST+reload is a sibling spec.  
**Fixing commit:** `3753029`

---

## Cycle 4 — 2026-08-14 (Playwright · localhost:5173)

### QA-18 · cycle 4 · HIGH · fixed
**Repro:** Calibrate → two clicks → confirm step in the 36px mode bar. Type an implausible distance.  
**Expected:** A decision that governs every rupee is readable at a glance; the warning appears once.  
**Actual:** Distance label collided with its input; the implausibility sentence rendered twice (`calError` plus the preview).  
**Status:** fixed — confirm is a non-blocking dialog (`role=dialog` name “Set scale”); the plan stays visible. `calError` is reserved for real errors.  
**Spec:** `QA-18` in `e2e/calibration.spec.ts`.  
**Fixing commit:** `78319c7`

---

## Cycle 3 — 2026-08-14 (Playwright · localhost:5173)

### QA-16 · cycle 3 · MEDIUM · fixed
**Repro:** Click File / Edit / View / … or Share.  
**Expected:** Unbuilt V2 slots disabled in place, with an honest tooltip.  
**Actual:** Menus looked live and did nothing.  
**Status:** fixed — `capabilities.appMenus` and `sharing`; MVP both false. Do not re-enable a control before it does something.  
**Spec:** `QA-16` in `e2e/qa-cycle1.spec.ts`.  
**Fixing commit:** `39b1316`

### QA-17 · cycle 3 · LOW · fixed
**Repro:** Select Pan / Zoom / Select; watch the canvas cursor.  
**Expected:** Cursor follows the active tool.  
**Actual:** Cursor stayed default.  
**Status:** fixed.  
**Spec:** `QA-17` in `e2e/qa-cycle1.spec.ts`.  
**Fixing commit:** `39b1316`

---

## Cycle 2 — 2026-08-14 (Playwright + Chrome · localhost:5173)

Cycle-1 HIGH fixes verified: QA-02, QA-03, QA-04, QA-05, QA-06, QA-10, QA-11 all
hold under the regression suite at 1366x768. **13 specs green.**

### QA-13 · cycle 2 · MEDIUM · fixed
**Repro:** Use the app on a build from before the QA-05 fix with an OS dark preference, then upgrade. Sign-in and every screen still render dark.
**Expected:** Default light. OS preference ignored.
**Actual:** `localStorage["showplan.theme"] = "dark"` — written by the OLD code from the OS preference — is honoured by the new code. Confirmed live in Joyjeet's Chrome: `{storedTheme:"dark", osDark:true}`.
**Why it matters:** the user never *chose* dark; they inherited it. The fix was correct and the stale value silently defeated it.
**Fix:** storage key versioned to `showplan.theme.v2`; the legacy key is removed once on read. A real preference set after the fix is untouched.
**Spec:** `QA-13` in `e2e/qa-cycle1.spec.ts`.

### QA-14 · cycle 2 · NOT A BUG (retracted)
**Claimed:** tool-chip tiles render light in dark mode.
**Measured:** `.tool-chip` background in dark = `rgb(46,48,51)` = `--bg-panel-alt` = correct. Of 27 tokens identical across themes, all 27 *should* be identical (axes, spacing, radii, typography, layout dimensions). **Dark mode is complete.**
**Lesson (second time today):** a claim read off a rendered screenshot is a hypothesis, not a finding. Measure computed styles before filing. Cycle 1 made the same error about menubar height and heading size.

### QA-15 · cycle 2 · MEDIUM · fixed (test harness)
**Finding:** Projects are ORG-scoped, so every e2e run piled throwaway projects into the same dashboard a real person uses — 22 had accumulated.
**Fix:** the seam purges *only the e2e user's own* projects at the start of each run.

### ENV-02 · cycle 2 · note
Joyjeet's Chrome was signed out during this sweep (expired or manually signed out). Not reproducible and not treated as a defect. The visual sweep now runs through Playwright with its own session, so it no longer depends on a human browser being signed in.

---

## Regression harness — Playwright (added 2026-08-14)

Cycle-1 findings are now locked down as executable specs. **A bug fixed without a
spec comes back.** Run with `npm run test:e2e` (dev stack must be up).

- `playwright.config.ts` — viewport pinned to **1366x768**, the real minimum. Regressions hide at larger sizes.
- `e2e/global-setup.ts` → `packages/api/src/scripts/e2e-session.ts` — **auth seam**.
- `e2e/qa-cycle1.spec.ts` — QA-02, QA-05, QA-06, QA-10, QA-11, QA-11b, QA-13, QA-16, QA-17 + dashboard smoke (Sign out **visible only** — the click is QA-23).
- `e2e/logout.spec.ts` — **QA-23** clicks Sign out; `/api/auth/me` 401; protected project URL is the sign-in page.
- `e2e/calibration.spec.ts` — upload, uncalibrated state, **QA-03** (empty distance field, Confirm disabled), **QA-04** (implausible soft-warn + "Use anyway"), calibration persistence across reload, **QA-18** (confirm dialog, warning once).
- `e2e/placement.spec.ts` — catalogue has no rates; place FIXED; uncalibrated PER_AREA; **QA-19** (picking a package after upload leaves the mode bar out of calibrate); POST+reload.
- `e2e/measurement.spec.ts` — uncalibrated tools disabled; **QA-21** snap toggles; distance POST+reload; inspector dual-unit (canvas is primary only); inspector delete; measurements never carry qty/amount. Visual judgement on real CAD sheets is **not** in this suite (see cycle 7 note).
- `e2e/fixtures/venue-plan-1200x800.png` — generated grid plan, committed so the suite has no external dependency.

**Auth seam — read before changing it.** It is a *script*, not an HTTP route:
there is no endpoint in the running server to exploit, so it adds **zero
production attack surface**. It mints a session row and signs the cookie with
`SESSION_SECRET` exactly as `@fastify/cookie` does, writes a Playwright
`storageState`, and refuses to run when `NODE_ENV=production`.
`e2e/.auth/` is gitignored — that file is a live credential.
**Never convert this into an endpoint.**

### ENV-01 · cycle 1 · HIGH · open (developer environment, not app code)
**Finding:** `NODE_ENV=production` is exported in the developer shell on this machine.
**Consequences observed:**
1. `npm install` silently omits devDependencies (`npm config get omit` → `dev`), which **deleted 357 packages including `vite`** and killed the running dev server. Recovery: `npm install --include=dev`.
2. `config.ts` skips loading `.env` (correct behaviour — production must never be overridden by a file), so every script fails with "invalid or missing environment variables".
**Mitigation in place:** `global-setup.ts` forces `NODE_ENV=development` for the seam script.
**Real fix (owner: Joyjeet):** remove `NODE_ENV=production` from the shell profile (`~/.zshrc` or similar). Until then any `npm install` in this repo needs `--include=dev`.
**Why it matters:** an app that believes it is in production on a dev machine will set `secure` cookies, skip `.env`, and behave differently from what is being tested.

---

## Cycle 1 — 2026-08-14 (Chrome · localhost:5173)

### QA-01 · cycle 1 · HIGH · fixed
**Repro:** Open project with uploaded PDF → Replace plan → pick different file → confirm warning.  
**Expected:** New plan on canvas; scale cleared.  
**Actual:** Nothing; reload still shows original.  
**Status:** fixed  
**Root cause (verbatim):** `window.confirm` inside the file-input `change` handler, after clearing the input, made the `File` unreadable across the yield. Prepare failed; failure was invisible because `uploadHint` only rendered on the `no_map` empty state.  
**Secondary lesson:** An error surface that can only render in one app state is silent in every other state. Audit: see “Error-surface audit” below.  
**Fix:** Modal before file picker; `snapshotFile` before any other await; always show `uploadHint` in the modebar.  
**Fixing commit:** `7ac194e`

### QA-01b · cycle 1 · HIGH · accepted-debt (R2 orphans)
**Finding:** On successful replace, old R2 object is left in the bucket.  
**Decision:** Do **not** delete on replace — no undo; old object is recovery.  
**Intended resolution (not now):** Pre-prod sweeper compares bucket keys to `BaseMap.objectKey` and deletes only keys unreferenced for **30+ days**.  
**Status:** accepted-debt

### QA-02 · cycle 1 · HIGH · fixed
**Repro:** Resize to ~1371px wide; inspect right panel Transform fields and Quantity hint.  
**Expected:** At 1366×768 shell fits; only canvas shrinks; all right-panel controls reachable.  
**Actual:** Panel clipped mid-word ("Dep", "Sca"); no horizontal scroll.  
**Status:** fixed  
**Decision:** **Fit at 1366 — only canvas shrinks** (canonical). Viewbar/workspace `min-width:0` + panels `flex: 0 0` token widths; field grid `minmax(0,1fr)`.  
**Regression:** `packages/web/src/lib/shell-layout.test.ts` (770px canvas at 1366).  
**Fixing commit:** `7ac194e`

### QA-03 · cycle 1 · HIGH · fixed
**Repro:** Start calibrate → reach distance confirm.  
**Expected:** Distance empty; Confirm disabled until positive number typed.  
**Actual:** Pre-filled "10".  
**Status:** fixed  
**Regression:** `isPositiveDistance` in `mode-bar-hint.test.ts`.  
**Fixing commit:** `7ac194e`

### QA-04 · cycle 1 · HIGH · fixed
**Repro:** Calibrate stadium plan (~200m+) with typo-scale → readout ~22m, no warning.  
**Expected:** Soft warn on plausible-but-wrong (10×) scales.  
**Actual:** 22m inside 1m–5km bounds — no warn.  
**Status:** fixed  
**Decision:** Soft warn when implied width ∉ **20 m–2000 m**, or calibration span &lt; **5%** of image width. Copy leads with implied metres + why. Floor 20 m (not 30) so banquet halls do not train Use-anyway.  
**Fixing commit:** `9507329`

### QA-05 · cycle 1 · HIGH · fixed
**Repro:** Open dashboard (light) then editor (dark), same session, no toggle.  
**Expected:** One app-level theme; default light; toggle affects every screen.  
**Actual:** Screens disagree.  
**Cause:** Only `EditorShell` called `getTheme`/`applyTheme` (localStorage + OS preference). Dashboard/sign-in never applied → CSS default light.  
**Status:** fixed — `bootTheme()` in `main.tsx`; default light; OS ignored; editor toggle writes the shared key.  
**Fixing commit:** `9507329`

### QA-06 · cycle 1 · MEDIUM · fixed
**Repro:** Confirm calibration; look at mode bar.  
**Expected:** Select-mode copy.  
**Actual:** "SELECT: Click to place points · Esc to finish".  
**Status:** fixed  
**Regression:** `mode-bar-hint.test.ts`.  
**Fixing commit:** `7ac194e`

### QA-07 · cycle 1 · MEDIUM · fixed
**Repro:** Confirm calibration; reload.  
**Expected:** No permanent blue measurement line on the plan.  
**Actual:** Calibration line persisted (drawn from stored geometry after confirm).  
**Status:** fixed — temp line only while `calPhase !== idle`; scale bar is separate HUD.  
**Fixing commit:** `7ac194e`

### QA-08 · cycle 1 · MEDIUM · fixed
**Repro:** Calibrate; look for on-canvas scale bar.  
**Expected:** Visible scale bar (slice 3 acceptance).  
**Actual:** Missing / not obvious (image-space + selection blue).  
**Status:** fixed — screen-space bar, `--text-primary` (not selection).  
**Fixing commit:** `7ac194e`

### QA-09 · cycle 1 · MEDIUM · fixed
**Repro:** Open project with base map on slow load.  
**Expected:** Loading indicator.  
**Actual:** Blank canvas for seconds.  
**Status:** fixed — `.canvas__loading` while image loads / on error.  
**Fixing commit:** `7ac194e`

### QA-10 · cycle 1 · LOW · fixed
**Repro:** Open unknown `/projects/:id`.  
**Expected:** Error inside app chrome (menubar, sign out).  
**Actual:** Bare page, no chrome.  
**Status:** fixed — `AppChrome` wrapper.  
**Fixing commit:** `7ac194e`

### QA-11 · cycle 1 · LOW · fixed
**Repro:** Dashboard → click project **name** text.  
**Expected:** Opens project.  
**Actual:** Focus moved to "Project name" create input (elsewhere on row worked).  
**Status:** fixed — removed create `autoFocus`; `pointer-events: none` on open-button children so the whole name/meta hit target is the button. Rechecked after Modal work.  
**Fixing commit:** `7ac194e`

### QA-12 · cycle 1 · LOW · fixed
**Repro:** Calibrated plan with title block bottom-right.  
**Expected:** Data bar does not cover meaningful plan content.  
**Actual:** Data bar overlays bottom-right of plan.  
**Status:** fixed — data bar moved bottom-left above gizmo.  
**Fixing commit:** `7ac194e`

---

## Error-surface audit (cycle 1)

| Surface | Where shown | Silent-in-other-state risk |
|---|---|---|
| `uploadHint` | Was only `no_map` empty → **fixed** (modebar always) | Was the QA-01 invisibility bug |
| `calError` | Mode bar during confirm | OK — only relevant in that phase |
| Projects `error` | Always in dashboard main | OK |
| Sign-in errors | Sign-in card | OK |
| Project 404 | Was bare → **fixed** (AppChrome) | Was QA-10 |
| Layout refresh failure | Sets `uploadHint` | Now visible via modebar |
| `api.projects.get` fail | → 404 page | OK after QA-10 |
| Canvas image load fail | Was blank → **fixed** (QA-09 alert) | Was silent |

No remaining known “error only in one state” traps after this pass.
