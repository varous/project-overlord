# Roadmap

> Sequenced by value and risk, not by date. Dates appear only where a commitment
> exists (the 1-week MVP). Each release states what it unlocks and how we know
> it worked.

---

## MVP — "Build it on the call" · target: 1 week · internal only

**Unlocks:** a salesperson can build a layout and produce a BOQ during a client call.

Auth + profiles · Projects dashboard · Base map import (image/PDF) · Scale
calibration · 2D editor with catalogue placement · Measurement tools ·
BOQ generation · Price estimate · Export to company template · Share links with roles.

**Done when:** Priya builds a real client layout live, unaided, in under 15 minutes,
and sends the BOQ without editing it by hand.

---

## v0.2 — "Trust the numbers" · internal hardening

The MVP proves the workflow. This release makes it *reliable* enough that people
stop double-checking it in Excel — which is the point at which it actually saves time.

- Catalogue completeness pass with the production team (**highest-value item on
  this entire roadmap** — an incomplete catalogue silently caps adoption). This
  is the 30 missing CLIENT rates, not a Technical Production catalogue.
  Technical Production stays out of scope until it is its own rate-chart
  programme (`01-prd.md` F7.7).
- **Duplicate project — tour venues.** A real 17-venue tour (same show,
  different geometry each night) cannot be quoted by rebuilding the package set
  seventeen times. Slice 2 deferred duplicate; this is why it comes back. The
  model stays one project per layout. Duplicate copies layouts and placements
  as a starting point — it is not a tour object, not multi-venue, not
  linked-quote. A salesperson quoting that tour without it is doing the same
  kit by hand at every stop.
- Layout versioning and version history
- Templates: start a project from a previous event or a standard footprint
- Zone-based grouping and subtotals in the BOQ
- Clearances and access-route checks (fire lanes, service access)
- Bulk edit and find/replace across elements
- Improved snapping and alignment guides
- Undo/redo hardening
- Print-quality PDF with title block, legend and revision number

---

## v1.0 — "Client-ready" · external read-only

- Polished public share view (branded, mobile-legible)
- Client commenting on a layout
- Approval / sign-off flow
- Multiple layout options per project for side-by-side comparison
- Export to PowerPoint for pitch decks
- Notifications (share, comment, approval)
- Audit trail on exports and estimates

---

## v1.5 — "Team scale"

- Organisations, teams, member management
- Granular permissions and rate-card visibility rules
- Rate-card versioning with effective dates
- Reporting: layouts per week, time-to-BOQ, win rate on live-layout deals
- CRM integration (project auto-created from a deal)
- SSO

---

## v2.0 — "Depth"

- **3D visualisation** — the parked Three.js engine and the 685 converted
  SketchUp models return here as a *view mode* over the same 2D layout data.
  A 2D plan is the source of truth; 3D is a presentation layer.
- DXF / DWG / SketchUp import
- Inventory and availability against owned stock
- Vendor/subcontractor assignment per BOQ line
- Automated sizing suggestions from footfall (toilets, exits, counters)
- Crowd-flow and capacity checks
- Offline mode for on-site use

---

## v3.0 — "Commercial product"

Only if the internal tool proves itself. Multi-tenant hardening, self-serve
signup, subscription billing, public catalogue with per-tenant overrides,
white-labelling, API and marketplace integrations.

---

## Explicitly not planned

| Not doing | Why |
|---|---|
| CAD-grade drafting | Different product, different users; AutoCAD exists |
| Full ERP / project management | We integrate with those, we don't become one |
| Real-time co-editing | Multi-week subsystem; link sharing solves 90% of the need |
| Native mobile apps | Responsive web view is sufficient for the viewing use case |

---

## What the parked 3D work is worth

The earlier phase of this project produced assets that stay valuable and should
not be re-derived:

- **679 SketchUp models converted** to Draco-compressed glTF, ~89% smaller, with
  verified real-world dimensions
- A **repeatable asset pipeline** (`tools/skp_batch_export.rb` + `tools/build-assets.mjs`)
  that converts, optimises and auto-generates catalogue metadata
- A **working Three.js editor** with single-scene/multi-camera architecture
- A **96-item procedural catalogue** with hand-built geometry

These are inputs to **v2.0**, and the dimension data may be useful sooner — the
measured footprints from the glTF conversion can seed 2D footprint sizes in the
MVP catalogue. Retained under `legacy-3d/` with its own README.


---

## Added 12 Aug 2026 — Event Power Planning (its own module)

Load summing, genset sizing, fuel and consumption, distribution and cabling are
**not** part of layout-to-BOQ. Decided 12 Aug 2026: the layout places
generators; fuel appears only if someone enters running hours for a placement.

Everything else about power belongs in a separate Event Power Planning section,
after the layout is settled. That is where `power_load_kva` on demand-side items
(seed known gap 2) earns its place: sum load across placements, suggest gensets,
derive fuel and distribution. The column exists in the schema now, unpopulated,
so no migration is needed when the module arrives.

Sequence it after Phase 2. It depends on the layout being trusted first.


---

## Parked input — Layout corpus intelligence (12 Aug 2026)

171 real drawings have been mined; findings are in `15-layout-corpus-study.md` and
the machine-readable form is `design/layout-conventions.json`. **Deliberately parked
by decision, not forgotten** — to be scheduled into the roadmap later in the build.

Pick it up in this order, because the items get progressively more speculative:

1. **Package template defaults** — the seven 100%-consistent footprints and the
   10-ft / 16-ft module. Zero risk, immediate value; do this whenever the real
   package library is authored.
2. **Catalogue additions** — the ~18 element types the drawings use that the
   catalogue lacks (bar, sound positions, LED, fanzone, tin wall, storage, SFX,
   smoking zone, kitchen, lounge, stock/prod/CCTV rooms, pyro pit, fan pit, merch).
3. **Zone tier attribute** — GOLD / SILVER / PLATINUM / DIAMOND / VVIP / FANZONE are
   zones with a ticket tier, not items. Small data-model change.
4. **Stage-at-top default orientation and grid snap** — editor defaults.
5. **Selection rules from `implication_rules`** — Phase 2, ranked by lift, always as
   a suggestion a human accepts.
6. **Stage-relative depth order as default placement** — Phase 2+.
7. **Similar-layout retrieval** (graph encoding + normalised GED) — Phase 3+; the
   path is designed in §6 of the study but the free-standing-element adjacency
   definition is unvalidated.

Re-mining is cheap (the extraction is a short script over your own vector PDFs), so
if drawing conventions change, refresh the JSON rather than editing it by hand.
