# Product Requirements Document — ShowPlan *(working title)*

> **Status:** Draft v0.1 · **Scope:** MVP (1 week, internal)
> **Blocked sections** are marked ⏸ and depend on inputs listed in `05-open-questions.md`.

---

## 1. Context

See `00-project-charter.md`. In short: a salesperson on a call cannot show the
client their event or give them a number. This product makes both possible
inside the call, by deriving the BOQ from the layout instead of re-entering it.

## 2. Jobs to be done

- **JTBD-1** — *When* a client describes their event on a call, *I want to* lay
  it out visually as they talk, *so that* we're agreeing on the same picture
  instead of two different mental images.
- **JTBD-2** — *When* the layout is agreed, *I want to* get an itemised BOQ
  instantly, *so that* I can give an indicative price before the call ends.
- **JTBD-3** — *When* the deal progresses, *I want to* hand production an
  accurate starting layout, *so that* nobody redraws it from scratch.
- **JTBD-4** — *When* the client wants to review it later, *I want to* send a
  link, *so that* they see exactly what we discussed.

## 3. Core concepts (domain language)

Use these words consistently in code, UI and conversation.

| Term | Meaning |
|---|---|
| **Project** | One event being planned. Owns metadata (client, venue, dates) and one or more Layouts. |
| **Layout** | A single plan of the venue — the canvas, its base map, its scale, and everything placed on it. |
| **Base map** | The imported venue image/PDF sitting under the layout as a background reference. |
| **Scale calibration** | The user-declared mapping from screen pixels to real-world distance. Everything measurable depends on it. |
| **Catalogue** | The company's master list of items available to place, with their unit of measure and rate. |
| **Package** | A kit from the catalogue (Box Office, Entry Gate, Genset Drop). The layout places packages, never bare items. |
| **Template** | Admin-versioned package definition. Editing one never mutates a project. |
| **Variant** | A layout-local copy of a template (kit lines + flags). One per package per layout until the user explicitly forks (slice 6c). |
| **Instance** | One canvas placement of a Variant. Geometry and placement params only — never a quantity, never a price. |
| **Zone** | A named area on the layout (F&B zone, VIP, backstage) used for grouping and area-based quantities. |
| **BOQ** | Bill of Quantities — the itemised quantity table *derived* from Instances, never re-typed. |
| **Estimate** | The indicative price computed from the BOQ, event duration and overheads. |

## 4. Personas

**Priya — Sales Lead** *(primary)*
Runs client calls, screen-shares constantly, not technical. Judges the tool on
whether she looks competent in front of a client. Will abandon it if it's slow,
ugly, or makes her look like she's fumbling. **Success = she reaches for it
unprompted on the next call.**

**Rohit — Production Manager**
Turns the sold concept into a buildable plan. Cares about real dimensions,
clearances, access routes. Distrusts anything he can't verify. **Success = he
starts from Priya's layout instead of redrawing it.**

**Client viewer**
Receives a link. Not logged in, possibly on a phone. **Success = it opens and
looks professional.**

## 5. MVP scope

### 5.1 In scope

| ID | Capability |
|---|---|
| F1 | Auth + user profiles |
| F2 | Projects list ("My Projects") dashboard |
| F3 | Import base map (image + PDF) |
| F4 | Scale calibration |
| F5 | 2D layout editor with catalogue placement |
| F6 | Measurement tools (informational readout — **not** quantities; see F6 superseded) |
| F7 | BOQ generation — placed lines; Venue Construction / Operations / Power with structural exclusion |
| F8 | Price estimate — engine live; issued quotes snapshot context |
| F9 | Export: BOQ to company template + layout PDF/PNG ⏸ *OQ-03* |
| F10 | Share link with roles (owner / editor / viewer) |

### 5.2 Out of scope for MVP

3D view · DXF/DWG/SketchUp import · real-time co-editing · inventory/availability ·
vendor booking · approvals workflow · mobile-optimised editing · offline mode ·
billing · client self-signup · **Technical Production** — see F7.7.

---

## 6. Functional requirements

### F1 — Authentication & profile

- **F1.1** Users sign in with Google OAuth. *(Rationale: internal team, already
  on Google Workspace, zero password handling.)*
- **F1.2** Email magic-link as fallback.
- **F1.3** First sign-in creates a profile: name, avatar, role, unit preference.
- **F1.4** Access is restricted to the company domain during internal phase.
- **F1.5** Roles: `admin`, `sales`, `production`, `viewer`.

**Acceptance**
```gherkin
Given I am a company-domain user who has never signed in
When I sign in with Google
Then a profile is created and I land on an empty Projects dashboard

Given I am not on the company domain
When I attempt to sign in
Then I am refused with a clear message
```

### F2 — Projects dashboard

- **F2.1** List projects: name, client, venue, event dates, last modified, owner.
- **F2.2** Create, rename, archive. *(Delete is soft — archive only.)*
- **F2.3** Search and filter by client, city, date range, owner. *(Deferred with
  duplicate — slice 2 shipped list/create/archive only.)*
- **F2.4** A project contains one or more layouts; open the most recent by default.
- **F2.5** **Duplicate project — deferred.** Slice 2 did not ship it. It is now
  on the roadmap (`04-roadmap.md`) with a concrete justification: a 17-venue
  tour is the same package set on different geometry. Without duplicate, a
  salesperson rebuilds that set seventeen times. One project per layout stays;
  duplicate is the starting point, not a tour object.

**Acceptance**
```gherkin
Given I have projects
When I archive one
Then it leaves the default list and is not deleted
```

### F3 — Base map import

- **F3.1** Upload JPG, PNG, or PDF (first page, or user-selected page).
- **F3.2** PDFs are rasterised client-side at sufficient resolution to stay
  legible when zoomed.
- **F3.3** Base map sits on a locked background layer; cannot be selected or
  moved accidentally.
- **F3.4** Base map opacity is adjustable, so elements stay readable over busy maps.
- **F3.5** Max upload 25 MB; clear error above that.
- **F3.6** A layout can exist with no base map (blank grid).

### F4 — Scale calibration ⚠️ *critical path*

Every area and length quantity in the BOQ depends on this. It must be
impossible to get wrong silently.

- **F4.1** After import, **prompt** the user to calibrate — do not hard-gate
  placement or the presence of a map. Uncalibrated is a first-class state (and
  **no map** is legitimate for count/fixed quoting). What *is* gated: **issue /
  export** when any BOQ line’s `qty_rule` is geometry-dependent (`PER_AREA` /
  `PER_LENGTH`) and scale is null. Name the blocking lines in the error.
- **F4.2** User draws a line over a known distance and types its real length.
- **F4.3** Derived scale is displayed persistently in the UI (e.g. "1 m = 12.4 px").
- **F4.4** An on-canvas scale bar is always visible and prints on exports.
- **F4.5** Recalibration is possible at any time, and warns that existing
  measured quantities will be recalculated.
- **F4.6** If uncalibrated, area/length tools are disabled with an explanatory
  tooltip — never silently produce a wrong number.
- **F4.7** Show a sanity check: a reference object of known size (a car, a 10×10 ft
  stall) the user can eyeball against the map.

**Acceptance**
```gherkin
Given an uncalibrated layout
When I try to draw an area
Then the tool is disabled and tells me to calibrate first

Given I calibrated 1 line as 20 m
When I draw a 10 m × 10 m square
Then it reports 100 sqm within 2% tolerance
```

### F5 — Layout editor

- **F5.1** Catalogue panel: search, browse by category, drag onto canvas.
- **F5.2** Place, move, rotate, resize, duplicate, delete elements.
- **F5.3** Multi-select; move/align/distribute as a group.
- **F5.4** Snapping: to grid, to other elements' edges, with a toggle.
- **F5.5** Layers/z-order, and named Zones for grouping.
- **F5.6** Undo/redo across all operations (minimum 50 steps).
- **F5.7** Properties panel for the selected element: label, dimensions,
  rotation, quantity, notes, include-in-BOQ toggle.
- **F5.8** Pan and zoom; zoom-to-fit; minimap for large sites.
- **F5.9** Text labels and simple annotations (arrows, dimension lines).
- **F5.10** Autosave with a visible saved/saving indicator.
- **F5.11** Keyboard shortcuts for the high-frequency actions (delete, duplicate,
  undo, nudge, zoom-to-fit).

**Performance budget:** interactive at **500 elements** on a mid-range laptop —
pan/zoom ≥ 30 fps, placement feels instant (< 100 ms).

### F6 — Measurement & quantity capture ⛔ SUPERSEDED 14 Aug 2026

> **Superseded by** [`13-boq-and-pricing-spec.md`](./13-boq-and-pricing-spec.md)
> (`qty_rule` on package lines) and the slice 5 brief. Retained so nobody
> rebuilds the pre-package model from this page in six months.

The table and F6.1–F6.3 below described a world where the salesperson *measured*
a length or area and that measurement *became* a BOQ quantity, with a manual
override flagged on the quote. That is not the architecture.

**What is true instead:**

- Quantities come only from placed **packages**, via each line's `qty_rule`
  (`FIXED` / `PER_AREA` / `PER_LENGTH` / `PER_COUNT_PARAM`). See docs/13.
- Canvas **measurements are informational**. They never become a BOQ line,
  never feed pricing, and never override a derived quantity. A fire-lane mark
  on the plan is a readout for a human, not an input to the quote.
- The mark itself shows the **primary (calibration) unit only**. Dual
  (`12.4 m (40.7 ft)`) lives in the inspector — the second figure is a
  deliberate cross-check, and dual-on-selected would jump labels when the
  mark is picked.

Historical text follows.

Catalogue items declare their own unit of measure; the editor must support
capturing quantity in whatever form that unit requires.

| Unit type | Editor tool | Example |
|---|---|---|
| Count (`nos`) | Point/footprint placement | 12 × green room |
| Length (`rm`, `m`, `ft`) | Polyline with live length readout | 120 rm barricade |
| Area (`sqm`, `sqft`) | Polygon/rectangle with live area readout | 450 sqm flooring |
| Volume (`cum`) | Area × declared height | scaffold volume |
| Weight / other | Manual entry on the element | rigging load |

- **F6.1** The unit is driven by the catalogue item, not chosen by the user.
- **F6.2** Live readout while drawing, in the project's display units.
- **F6.3** Any derived quantity can be manually overridden, and the override is
  visibly flagged in the BOQ so nobody mistakes it for a measured value.

### F7 — BOQ generation

Engine and MEMBER/ADMIN quote API are in. On-screen BOQ (preview / issued) shows
**what is placed**. Export (F9 / slice 7) is a different artefact — see below.

- **F7.1** BOQ is derived from placed packages — no manual transcription.
- **F7.2** Grouped by section (`VC` | `OPS` | `POWER` — Venue Construction,
  Operations, Power), then category.
- **F7.3** Each MEMBER/ADMIN line: item, description, unit, quantity, billed
  days, rate, amount. Viewer line shape is held (slice 8) until Joyjeet decides
  whether a client-facing quote itemises qty and days.
- **F7.4** Manually-overridden quantities are marked.
- **F7.5** Preview recomputes live as the layout changes; an issued quote does not.
- **F7.6** Items can be added to the BOQ that aren't on the layout (e.g. labour,
  transport) — the layout drives most of it, not necessarily all of it.
- **F7.7 Technical Production is out of scope, and must be stated.** Their
  sheets have four cost families: Venue Construction, Operations, Power, and
  Technical Production (audio, lighting, video and trussing). Technical
  Production was 56% of the money on a real 17-venue tour workbook, and has no
  items or rates in our catalogue. 191 of 221 line names
  in that sheet match our rate chart; the unmatched ones are mostly Technical
  Production, plus CBM scaffolding towers and Octonorm. **The `Section` enum
  does not gain a fourth member.** We quote Venue Construction, Operations and
  Power only. A quote that silently omits more than half the cost is dangerous,
  so every quote — preview, issued, export — carries an explicit exclusion, and
  the total is not a show total. Treat it like `incomplete`: structural, not a
  footnote.

**Payload (no UI in this slice).** Sibling of `incomplete` on every preview and
issued DTO, snapshotted onto the Quote row at issue so later catalogue growth
does not rewrite history:

```
scope: {
  quotedSections: ["VC", "OPS", "POWER"],
  totalKind: "vc_ops_power",
  exclusion: "This quotation covers Venue Construction, Operations and Power. Technical production — audio, lighting, video and trussing — is not included.",
  warning: "Not a show total. Technical production is excluded."
}
```

`quotedSections` / `totalKind` are keys. `exclusion` is client-facing;
`warning` is internal. Do not add `TECH` to `Section`. Do not invent a fourth
bucket in `bySectionPaise`. Copy lives in data on the issued row, not
`if (section === "TECH")`.

### F8 — Price estimate

Known shape is now the engine: `qty × rate × billed_days`, fuel special-cased,
total rounds to the nearest 100 rupees once. Overhead lines (transport, crew,
margin) remain stubbed at zero.

- **F8.1** Rates are **server-side only** — never shipped to the browser in a
  form a client viewer could read.
- **F8.2** Every issued quote snapshots rates *and* the pricing context (vcDays,
  opsDays, running hours, side, city, rounding increment, catalogueVersion).
- **F8.3** Output is labelled "Indicative estimate — not a quotation" everywhere
  it appears, *and* carries `scope.exclusion` / `scope.warning` (F7.7) so the
  number cannot be mistaken for a show total.

### F9 — Export ⏸

Still blocked on OQ-03: a **client-facing quotation** `.xlsx` with per-line rate
and amount columns. A costing sheet with four section totals is not that
template. See `05-open-questions.md`.

- **F9.1** BOQ as `.xlsx`, reproducing the company quotation template.
  **The export is a transform, not a serialisation of the screen.** The on-screen
  BOQ stays as built (placed packages only). The export includes every catalogue
  item in the quoted sections (Venue Construction, Operations, Power) with quantity **zero** where
  nothing was placed. In the tour workbook, 51% of lines sat at qty 0 — a zero
  means "we considered a mist fan and decided against it", and that is part of
  why the client trusts the document.
- **F9.2** Layout as PDF (with scale bar, legend, title block) and PNG.
- **F9.3** Combined client-facing PDF: layout + BOQ.
- **F9.4** Exports are generated server-side where rates are involved.
- **F9.5** The export header/cover carries `scope.exclusion` and `scope.warning`.
  Do not present the total as a show total.

### F10 — Sharing

- **F10.1** Invite by email with a role: editor or viewer.
- **F10.2** Public read-only link, revocable.
- **F10.3** Viewers see the layout and (optionally) the BOQ — **never rates or
  the estimate** unless explicitly enabled per share. Slice 8: `usedGenericFallback`
  already appears on the MEMBER payload (harmless internally). It is on the
  forbidden list for viewers — logged in `.agent/QA-LOG.md` cycle 10 so it is
  not rediscovered when the viewer DTO is built.
- **F10.4** Last-write-wins on concurrent edits, with a warning banner if
  another user has the layout open.

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | Editor interactive at 500 elements; first meaningful paint < 2 s on a 10 Mbps connection; BOQ recompute < 300 ms |
| **Reliability** | Autosave every 3 s (debounced); no data loss on tab close or crash; optimistic UI with rollback |
| **Browser support** | Latest 2 versions of Chrome and Edge (primary), Safari (secondary). No IE. |
| **Security** | Row-level security on every table; rates readable only by `admin`/`sales`; all uploads virus-scanned or type-restricted |
| **Privacy** | Client names and layouts are commercially sensitive; no third-party analytics on layout content |
| **Accessibility** | Keyboard-navigable UI; WCAG AA contrast. Canvas editing is inherently pointer-based — acknowledged gap, documented not ignored |
| **Observability** | Error tracking (Sentry), structured logs on export and estimate generation |
| **Auditability** | Every BOQ export records who, when, which layout version, which rate card |

## 8. Analytics events

`project_created` · `basemap_uploaded` · `scale_calibrated` · `element_placed`
(with category) · `zone_drawn` · `boq_generated` · `estimate_generated` ·
`export_downloaded` (with format) · `share_link_created` · `time_to_first_boq`

`time_to_first_boq` is the headline metric — it measures G1 directly.

## 9. Open questions

Tracked in `05-open-questions.md`. **OQ-03 still blocks slice 7 / F9:** we need
a client-facing quotation `.xlsx` with per-line rate and amount columns. The
17-venue tour workbook was a quantity takeoff (section costs only) and does not
unblock export. OQ-02 (catalogue) and OQ-04 (pricing rules) have been largely
answered by the seed; OQ-03 is the remaining input.
