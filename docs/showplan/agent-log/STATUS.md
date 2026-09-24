# STATUS — auto-generated, do not edit

Generated **2026-08-16T14:24:07.805Z** by `npm run status`.
This file is how another agent gets current without reading the repo. Regenerate it
after any meaningful change, and always before asking for a plan.

## Verdict

**✅ All checks pass.**

| Check | Result | Time |
|---|---|---|
| domain tests | ✅ pass | 1.2s |
| typecheck: domain | ✅ pass | 0.8s |
| typecheck: web | ✅ pass | 1.9s |
| build: web | ✅ pass | 4.1s |
| web bundle gzip (ceiling 400000 B) | ✅ pass | 0.1s |
| lint | ✅ pass | 1.8s |
| token hygiene: components | ✅ pass | 0.0s |
| QA-24: no enabled chrome without a handler | ✅ pass | 0.0s |
| QA-24: scanner fails a broken Radix Item | ✅ pass | 0.1s |
| section terms: Venue Construction / Operations / Power | ✅ pass | 0.1s |



## Git

**Branch:** `catalogue-seed-image-joyjeet` · **HEAD:** 2b4ca2e Merge pull request #21 from cav-tech-work/spa-root-403-joyjeet (25 minutes ago)

Recent commits:
```
2b4ca2e Merge pull request #21 from cav-tech-work/spa-root-403-joyjeet
983452f fix: serve the SPA at GET / in production
aebbf97 Merge pull request #19 from cav-tech-work/standalone-qty-joyjeet
c4142b0 fix: standalone autos must be correct, not copied from the kit
e849731 Merge pull request #18 from cav-tech-work/feature/catalogue-items
395c44c fix: one qty_rule kind per item, reference_rate as data
4ec7e8d fix: gensets are kits so hire cannot land without fuel
2598856 feat: make every catalogue item usable on canvas or as a show line
605a008 Merge pull request #16 from cav-tech-work/test/production-smoke
05915cb fix: do not build the SPA under NODE_ENV=development
c95aab7 test: fix production /_reference smoke and log editor first-load
507a967 test: run a small production SPA smoke against vite preview
6c89976 Merge pull request #15 from cav-tech-work/feature/view-bar-radix
40ae1c5 feat: rebuild view-bar selects and segmented controls on Radix
9c642f2 Merge pull request #14 from cav-tech-work/fix/basemap-lazy-pdfjs
```

Uncommitted changes:
```
M .agent/JOURNAL.md
 M .github/workflows/ci.yml
 M docs/README.md
 M docs/RUNNING-LOCALLY.md
 M infra/Dockerfile
 M packages/api/src/scripts/import-catalogue.ts
 M packages/api/src/server.ts
?? docs/RUNNING-IN-PRODUCTION.md
?? packages/api/src/lib/import-catalogue.ts
?? packages/api/test/import-catalogue.test.ts
```

```
.agent/JOURNAL.md                            |   8 ++
 .github/workflows/ci.yml                     |   2 +
 docs/README.md                               |   1 +
 docs/RUNNING-LOCALLY.md                      |   2 +
 infra/Dockerfile                             |   3 +
 packages/api/src/scripts/import-catalogue.ts | 157 +++------------------------
 packages/api/src/server.ts                   |  17 +++
 7 files changed, 50 insertions(+), 140 deletions(-)
```

## Inventory

- domainModules: **19**
- domainTests: **13**
- webComponents: **9**
- icons: **73**
- docs: **22**
- cursorRules: **4**

## Open markers in code

_none_

## Latest journal entries

## YYYY-MM-DD — slice N: <name>
**Did:** one or two lines.
**Broke / surprised me:** the thing that cost time, and why. Omit only if nothing did.
**Left open:** anything deliberately unfinished, with the reason.
**Decisions taken:** anything a future reader would otherwise have to reverse-engineer.
```

---

## 2026-08-16 — production catalogue was empty
**Did:** Runtime image now copies `packages/api/seed` (332 KB). Import extracted as `writeCatalogue` and locked with a twice-run + VERSION-bump test. Boot logs `{ items, rates, packages }` and warns if items=0. Procedure in `docs/RUNNING-IN-PRODUCTION.md`: Render Shell, not Pre-Deploy.
**Broke / surprised me:** Migrations ran; the seed never shipped. `import:catalogue` is `tsx` (devDependency) so the paste command is `node packages/api/dist/scripts/import-catalogue.js packages/api/seed`. Live rates are 1,967, not the spec's 1,937.
**Left open:** First fill is a manual Shell command after this deploy. Do not add import to the entrypoint. HEALTHCHECK still curls :8080. OQ-17 untouched.
**Decisions taken:** Catalogue import is a data decision. Idempotent ≠ run on every boot. Pre-Deploy still does not run on Docker services.

---

## 2026-08-16 — production GET / was 403
**Did:** `@fastify/static` `index: ["index.html"]` so GET `/` serves the SPA. Kept the notFoundHandler for deep links and API JSON 404s. Production smoke now hits Fastify in `NODE_ENV=production`, not vite preview. Three HTTP assertions: `/` 200 html, `/projects/does-not-exist` 200 html, `/api/does-not-exist` JSON 404.
**Broke / surprised me:** `index: false` does not fall through to `setNotFoundHandler`. The static wildcard matches `/`, send treats it as a directory, 403. Vite preview hid this completely — ADR-008's DEV/prod split, second time.
**Left open:** Dockerfile HEALTHCHECK still curls :8080; Render listens on `$PORT` (10000). Render ignores Docker HEALTHCHECK, so production is fine. Report-only this PR. OQ-17 untouched.
**Decisions taken:** Production smoke's origin is Fastify serving `web/dist`, the same shape as Docker/Render. Vite preview is not a production stand-in for document requests.

---
