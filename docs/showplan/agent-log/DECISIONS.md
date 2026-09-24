# Decisions

Newest first. These are product rules that are easy to reverse-engineer wrongly
from the code. Slice owners: read before building the screen or the export.

---

## 2026-08-16 — main is the live release line

From this promotion onward, **`main` is what is deployed**. **`dev-mac` is what is
integrated but not yet promoted.** Feature branches still PR into `dev-mac`. A
PR from `dev-mac` into `main` is a release decision: it names the `dev-mac`
commit it ships and confirms staging was exercised. Nothing reaches `main`
that has not sat on `dev-mac` first.

## 2026-08-16 — standalone auto qty_rules vs kit lines

Copying a kit's `qty_rule` onto the auto package makes the *kinds* match and
silences `QTY_RULE_CONFLICT`, but that is only **CONSISTENT**, not **CORRECT**
for an Items-palette drop. The place API does not send params; it fills
`defaultParamValue` (`PER_COUNT_PARAM` → 1). So a standalone drop does **not**
emit `PARAM_MISSING` — it silently bills `qty_value × 1`.

- **BAR_MOJO** — CONSISTENT (`PER_COUNT_PARAM:lanes`) was wrong. Dragging from
  Items would bill **1 rft** (lanes default 1, auto `qty_value` 1) and ignore
  the drawn run. CORRECT standalone is **`PER_LENGTH`** (item is rft / LENGTH).
- **PWR_PLUGPOIN8** — CONSISTENT (`PER_COUNT_PARAM:counters` → 1) happens to
  equal one plug, but `counters` is a box-office kit param. CORRECT standalone
  is **`FIXED` 1**.
- **SEC_DFMD** — CONSISTENT (`PER_COUNT_PARAM:lanes` → 1). A standalone frame
  is not “lanes”. CORRECT standalone is **`FIXED` 1**.
- **SEC_HHMD** — same as SEC_DFMD: CORRECT standalone is **`FIXED` 1**.

`QTY_RULE_CONFLICT` is only for two **geometry** takeoffs on the same item
(`PER_AREA` vs `PER_FRONT_FACE`). Kit-count vs standalone-count is not that
bug. `MISC_FRONFASC2` uses `PER_FRONT_FACE:height_ft` like `MISC_FRONFASC`.

---

## 2026-08-15 — zero-value lines, and export order

**Zero-value lines.** A CLIENT rate of `0` is a real rate (dumping / bio-waste).
The engine prices the line at zero and does **not** mark the quote incomplete.
On the **app screen**, zero-amount lines are hidden by default so a salesperson
is not reading “rupees zero” aloud on a live call. They are **always present in
the export**. Hiding is a view filter, never a drop from the BOQ.

Not built here. The screen that lists quote lines owns the default-hidden
filter. The export (slice 7) must include every line, including zero-value lines.

**Export order is stable.** Section order and row order inside a section must be
identical on every run of the same quote. A salesperson comparing two PDFs, or a
diff of two issued versions, cannot tolerate shuffle.

**Slice 7 owns the ordering test.** Requirement: an automated test that the
export’s section sequence and row sequence are deterministic (same input → same
order, every run). Do not build that test — or the export — until slice 7 has
the client-facing quotation `.xlsx` (OQ-03). Do not invent an order here.

---
