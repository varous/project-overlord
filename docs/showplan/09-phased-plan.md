# Phased Plan — MVP to final product

> **Revision 2** · 12 Aug 2026 · supersedes rev 1
> Companion to `08-domain-logic.md` (how it thinks) and `10-head-start-analysis.md`
> (what already exists). Seven phases. Each states its **theme**, what **logic** it
> adds, its **exit criteria**, and — importantly — **when to skip it**.

## What changed in revision 2, and why

The head-start research found that our derivation engine is not novel — it is
**construction quantity takeoff**, a twenty-year-old shipped category — and that
Bluebeam solved the "customer's cost logic lives in Excel" problem by *driving the
customer's spreadsheet rather than reimplementing it*. Three consequences reshaped
the plan **as written on 12 Aug**:

1. **Pricing was planned to leave the MVP** — Phase 0 would derive quantities into
   the Excel template; pricing in code would wait for Phase 1.
2. **Vocabulary changes before code.** Assembly, measurement type, condition, deduct.
   Estimators already know these words.
3. **A new gate sits in front of Phase 0.** One measurement can invalidate the entire
   build, and it takes twenty minutes.

**Superseded the same day the seed arrived (see `13-boq-and-pricing-spec.md` §7):**
pricing logic *did* arrive in time for Phase 0. The BOQ/pricing engine lives in
`packages/domain` (live pass count in `.agent/STATUS.md`; worked genset example). Phase 0 still exports Excel
(slice 7) as a *priced* BOQ dump, not as the pricing engine. The Phase 0 slice
table below is authoritative; treat the numbered list above as history.

Net effect on Phase 0: catalogue risk replaced spreadsheet-fidelity risk. Still
~8 days; the riskiest day (slice 6) is already banked.
---

## Sequencing principle

The order is not arbitrary, and it is not "easiest first". It follows how trust in an
estimating tool is actually earned:

> **Prove → Trust → Deepen → Present → Advise → Integrate → Scale**

The specific trap this ordering avoids: building *intelligence* (footfall sizing,
compliance checks) before *trust* (a complete catalogue and defensible numbers).
Advisory features layered on numbers people don't believe make the tool look clever
and get it ignored.

**A second, harder principle:** each phase ends with the product *usable and
deployed*. No phase's output is "half a subsystem".

---

## Phase −1 — The twenty-minute gate

**Before writing any code.** Not a project phase; a decision that precedes one.

Take your **three most recent BOQs** and classify every line: is its quantity a pure
count of placed objects, or does it come from a measurement (length, area, volume,
perimeter) or from another item implying it?

| Result | Action |
|---|---|
| >80% pure counts | **Do not build this.** Buy OnePlan Team (~$90/user/mo) and keep pricing in Excel. See `10-head-start-analysis.md` |
| Under ~50% counts | Build. The measured and implied lines are the product |
| In between | Build, but cut Phase 2 composition to the top three assemblies only |

Also settle two inputs that now gate the MVP's *shape*, not just one feature:

- **The client-facing quotation `.xlsx`.** Per-line rate and amount columns.
  A costing sheet with four section totals is not this (OQ-03, 15 Aug 2026).
  The ExcelJS fidelity spike (2 h) runs the day it arrives. If ExcelJS cannot
  round-trip it, Phase 0 changes materially.
- **The pricing dump.** Not needed for Phase 0 any more — needed at Phase 1's start.

---

## Phase 0 — MVP: "Layout to quantities"

**Theme:** prove the sales-call workflow end to end, once, for real.
**Effort:** 8 days · **Audience:** internal sales · **Status:** ready once Phase −1 clears

### Logic in scope
- Derivation pipeline v1: measurement types `count`, `length`, `area`, `perimeter`,
  `deduct`, `manual`
- Scale calibration from a known dimension. **Uncalibrated blocks geometry-derived
  quantities (`PER_AREA` / `PER_LENGTH`), not the package palette.** `FIXED` and
  `PER_COUNT_PARAM` placements are allowed with no scale; their quantities stay
  honest (`null` for geometry-derived lines, never a guess). Measurement *tools*
  (slice 5) stay disabled until calibrated. Export/issue is blocked only when a
  geometry-derived line exists without a scale.
- Package-driven BOQ derivation (Template → Variant → Instance; qty rules in data)
- **Pricing in `packages/domain`** — integer paise, day curves, city rates, fuel
  special case, total rounds to the nearest 100 rupees once. Seed-backed; domain
  tests green (see `.agent/STATUS.md`) including the
  worked genset example (one `PKG_GENSET125` at 5 ops days). See
  `13-boq-and-pricing-spec.md` §7 — that doc is authoritative when this file drifts.
  **Quoted sections are Venue Construction, Operations and Power only.**
  Technical Production (`TECH` — audio, lighting, video and trussing) is out of
  scope and is not a fourth enum member. Every quote carries a structural
  `scope.exclusion` / `scope.warning`. See `01-prd.md` F7.7 / `13` §4.8.
- Integrity validations / findings
- Snapshots on issue (layout version + catalogue version; rates frozen on the quote)

### Explicitly deferred
Assemblies beyond package lines · wastage · tiered rates beyond the curve table ·
sizing rules · compliance checks · approvals · inventory · 3D · Excel as the
*pricing engine* (export of an already-priced BOQ remains slice 7) · **Technical
Production** · **duplicate-project** (slice 2 deferred it; roadmap carries the
tour justification)

### Build slices

> **Revised 12 Aug 2026** after the seed data arrived and the engine was built.
> This table is the **single source of truth for Phase 0**. `13-boq-and-pricing-spec.md`
> §7 explains *why* it changed; it must not carry a competing copy.

| # | Slice | Est. | State |
|---|---|---|---|
| 0 | Walking skeleton, deployed day one — Docker on Render, Postgres, health check | ½ d | ✅ **done** |
| 1 | Auth — Google OIDC via `openid-client`, session cookie, `hd` domain gate | ½ d | ✅ **done** |
| 2 | Projects dashboard | ½ d | ✅ **done** — merged to `dev-mac` |
| 3 | Base map upload (image + PDF) and scale calibration | 1 d | ✅ **done** — merged to `dev-mac` |
| 4 | Editor — Konva, package palette, place/move/rotate/delete, undo (command pattern), IndexedDB drafts | 2 d | ✅ **done** — merged to `dev-mac` |
| 4d | Canvas transform handles — **Konva.Transformer** (select, rotate, resize, snap) | ½ d | not started. **Net-new (ADR-007)** — rule 2 will never trigger this; do not hand-roll handles |
| 5 | Measurement tools with live readout | ½ d | ✅ **done** — merged to `dev-mac` |
| 6 | ~~Quantity derivation as pure functions~~ | 1 d | ✅ **done** — engine + domain tests (`.agent/STATUS.md`) |
| 6b | Catalogue import + admin read-only views | ½ d | import ✅; admin views still open |
| 6c | Variant editor — include/exclude + blast-radius *confirm* | 1 d | flags visible read-only in slice 4; editor is 6c |
| 7 | Export — Excel into your template, layout PDF | 1½ d | blocked on OQ-03 (client-facing quotation `.xlsx` with per-line rate and amount). **Scope:** the export is a transform, not a serialisation of the on-screen BOQ. Screen = placed packages. Export = every catalogue item in Venue Construction / Operations / Power with qty **0** where nothing was placed (51% zeros on the real tour sheet are considered-and-declined). Header carries `scope.exclusion`. |
| 8 | Share links with roles | ½ d | drop candidate if time runs short. Viewer DTO held: Joyjeet decides whether a client quote itemises qty and billed days. `usedGenericFallback` is on the MEMBER payload today — forbidden for viewers (QA-LOG cycle 10). |
| 9 | Quick Search / command palette — **cmdk**, Cmd-K | 1 d | not started. **Net-new (ADR-007)** — rule 2 will never trigger this |

*Still 8 days, with the riskiest day (slice 6) already banked.* Slices 4d and 9
are extra, not inside that 8-day total; they exist because ADR-007 adopted
primitives the opportunistic-retrofit rule will never reach.

**Slice 7 — export is a transform, not a dump of the screen.** Decided 15 Aug
2026 off a real 17-venue tour costing workbook. The on-screen BOQ stays as
built (placed packages only). The `.xlsx` includes every catalogue item in the
quoted sections with quantity zero where nothing was placed — 51% of that
sheet's lines were zeros, and a zero means "we considered it and decided
against it". Still blocked: OQ-03 is a *quotation* with per-line rate and
amount, not a costing sheet with four section totals.

**Dependency order that actually matters:** the catalogue is already imported and
populated (seed bundle + `import:catalogue`). Slice 4 needs `GET /api/catalogue/packages`
**without rates** — that is a security boundary, not an admin UI. 6b is the admin
read-only views; it is not a blocker for the palette. 6c is the named variant
editor (include/exclude OPTIONAL / DEFAULT_ON, blast-radius *confirm*). Slice 4
already shows flags read-only and the blast-radius *readout* ("N placements use
this kit"). Every slice from 2 onward needs a user identity, because projects have
an owner, quotes record `generatedById`, and share links need roles. That is why
slice 1 came first even though it is the least interesting half-day in the plan.

### Exit criteria
A salesperson, unaided, on a real client call: new project → upload map → calibrate →
lay out → export → **the Excel file opens with correct quantities and a total**, in
under **15 minutes**, sent without hand-editing.

### When to stop and rethink
If the first three real layouts need manual quantity correction, do **not** proceed to
Phase 2. The problem is the catalogue or the derivation rules, and Phase 1 is the
whole job.

---

## Phase 1 — "Trust" *(pricing engine already in Phase 0; deepen here)*

**Theme:** make the numbers defensible enough that people stop re-checking them in
Excel. **Effort:** 3–4 weeks · **Audience:** internal sales + production

Pricing *in code* landed with the seed (Phase 0 / `packages/domain`). Phase 1 is
no longer "move pricing into code" — it is catalogue completeness, rate coverage
for the 30 unpriced items, admin tooling, and the trust work below.

### Logic added
- **Pricing engine already in `packages/domain`** — layers 1, 3, 4, 9: line base with
  the **day-rated vs one-time split**, section subtotals, overheads, grand-total
  rounding. Money as integer paise. **Rates and pricing execute server-side only —
  the rate card must never reach a viewer's browser.** Phase 1 deepens this
  (admin UI, versioning, the 30 missing CLIENT rates) rather than introducing it.
- **Differential test against historical BOQs** (when the `.xlsx` template arrives):
  every historical layout must price identically in code and in the export, to the
  paise. Any divergence is a bug in one of them — and finding out which is exactly
  the value here.- **Catalogue completeness pass** with the production team — the single biggest
  determinant of adoption. Needs a named owner, not a spare afternoon
- Catalogue admin UI (CRUD, bulk import, validation on import)
- Rate card versioning with effective dates
- Override provenance surfaced everywhere, including exports
- Completeness validations: powered items with no generator, no toilets, stage with
  no access
- Layout versioning and version history
- Recalibration warnings when overrides diverge from geometry
- Templates: start from a previous event or a standard footprint

### Exit criteria
Three consecutive real BOQs accepted by the commercial team **without manual
correction**, and priced in code to the paise against the spreadsheet. Catalogue
coverage above an agreed threshold for your five most common event types.

### When to skip
Never. If Phase 0 revealed the catalogue is already complete and accurate, this phase
shrinks — it does not disappear.

---

## Phase 2 — "Derivation depth"

**Theme:** stop making humans compute the obvious. **Effort:** 3–4 weeks

### Logic added
- **Assemblies / implied items** — place a stage, get skirting, steps, railing,
  carpet and deck panels (§4 of the domain doc). Industry term retained deliberately
- **Derived formulas** — cable runs from element-to-generator distance, wastage on
  consumables, crew from rigging weight
- Waste %, coverage rate and multiplier as properties of the **condition**
- Pricing layer 2 — minimum quantities, minimum charges, tiered rates
- Zone-based subtotals in the BOQ
- **Options / scenarios** — Option A vs Option B, priced side by side
- Bulk edit and find/replace across elements
- **Selection rules only** — "adding a stage implies steps and skirting". CPQ
  calls these selection rules; the same category's docs warn that installations
  accumulate hundreds of rules and become unmaintainable. So: selection rules
  only, no validation/filter/alert rule types, and a documented cap. See the
  addendum to `10-head-start-analysis.md`
- Commercial validations — lines with no rate, quantities implausible against history

### Exit criteria
Placing a stage produces a BOQ an experienced estimator would have written by hand,
including the parts nobody remembers to list. Two priced options on one screen.

### When to skip
If Phase 1 shows estimators mostly place explicit items and rarely rely on implied
ones, cut assemblies to the two or three highest-value ones (stage, barricade, power)
and move on. Assemblies are powerful and very easy to over-build.

---

## Phase 3 — "Client-ready"

**Theme:** the artefact leaves the building and represents you. **Effort:** 3–4 weeks

### Logic added
- Branded, polished public share view (mobile-legible)
- Client commenting on a layout
- Approval / sign-off flow with an audit trail
- Revision history visible to the client ("Rev C, 12 Aug")
- PowerPoint export for pitch decks
- Full proposal document — cover, layout, BOQ, terms
- Notification system (shared, commented, approved)

### Exit criteria
A client receives a link, comments on it, and approves a revision — entirely inside
the product, with the trail preserved.

### When to skip
If clients are happy with a PDF over email, this phase is mostly polish. **Reorder it
after Phase 4 if internal accuracy is still the bottleneck.** Never build
client-facing polish on numbers the team doesn't trust.

---

## Phase 4 — "Advisory intelligence"

**Theme:** the product starts contributing expertise, not just arithmetic.
**Effort:** 4–6 weeks

Only worth building once the numbers are trusted — advice on top of doubtful
quantities is noise.

### Logic added — now explicitly TWO layers (see `14-arxiv-prior-art.md`)

**Layer 1 · Sizing — the standard as data.** Toilets, exits, entry lanes, queue
area. These come from the applicable licensing standard (NBC 2016 plus local police
and fire conditions; NFPA 101 / IBC / UK Purple Guide internationally), encoded as
**admin-editable versioned rows modelled on `day_curves`**, each row carrying the
standard and edition it came from so a recommendation can always cite its source.
The arXiv literature contributes **nothing** to this layer — sizing is regulatory,
not physical, and four independent papers declined to supply it.

**Layer 2 · Safety flags — research-based, advisory only, no simulation.** Three
static checks over layout geometry plus attendance: zone density (green <3, amber
3–4, red >4 persons/m²); egress and lane width from a design specific flow of
1.2–1.3 persons/(m·s), de-rated to 0.6–1.0 when encumbered, with a 30–40% margin
and outflow ≥ inflow at each bottleneck; and gate funnel geometry (approach corridor
≈ 2–2.5× gate width). Every flag is labelled advisory and cites its source. **The
tool never claims compliance.**

**Out of scope, deliberately:** crowd pressure / turbulence indicators. They need a
velocity field, therefore an agent-based simulation, whose parameters the source
review concedes are under-identified. A believed-but-wrong safety number is worse
than none.
- Clearance and access-route validation (can a truck reach the stage?)
- Clearance and access-route validation (can a truck reach the stage?)
- **Suggestion engine** — "events of this size usually include X"
- **Benchmark library** from your own historical events — the most defensible form of
  intelligence, because it's your data
- Crowd-flow and capacity indicators

### Exit criteria
The tool catches a real omission or safety issue before a human does, at least once,
on a real event.

### Research note — DONE, 12 Aug 2026
Stage 2 was run on this phase: six papers, read in isolation, written up in
`docs/14-arxiv-prior-art.md`. The headline result changed the shape of the phase —
sizing cannot come from research and must come from the licensing standard, while
the research earns its place only in the advisory flag layer. **First action is a
data-entry task, not code:** tabulate the facility schedules your three most common
venues' licensing conditions actually impose.

### When to skip
Skip the compliance module if your events are consistently in venues where the venue
owns compliance. Keep the footfall sizing rules regardless — they're cheap and
directly useful on a sales call.

---

## Phase 5 — "Execution bridge"

**Theme:** the layout stops being a sales artefact and becomes an operational one.
**Effort:** 6–8 weeks

### Logic added
- Inventory and availability against owned stock; hire-vs-own flagged per line
- Vendor / subcontractor assignment per BOQ line
- Procurement handoff — purchase orders and hire lists from the BOQ
- Crew and logistics planning derived from the layout
- **Actuals vs estimate feedback loop** — what did the event really cost?
- Margin analytics by event type, city and client

The feedback loop is the sleeper feature. Once actuals flow back, the pricing engine
can be tuned against reality instead of instinct, and estimates improve on their own.

### Exit criteria
An approved layout produces a procurement list the operations team uses without
re-keying it.

### When to skip
If your ERP or existing operational process already owns this, **integrate rather
than rebuild** — export to it and stop. Rentman and Current RMS already do inventory,
crew and hire logistics well; if you run one of them, this phase is an integration,
not a build. This is the phase most likely to duplicate software you already pay for.

---

## Phase 6 — "Scale & commercialise"

**Theme:** other companies pay for this. **Effort:** ongoing · **Conditional**

### Logic added
- Multi-tenant hardening, per-tenant catalogues and rate cards
- Self-serve signup, subscription billing, plan limits
- White-labelling
- Public API and CRM integration (project created from a deal)
- **DXF/DWG/SketchUp import**
- **3D visualisation** — the parked Three.js engine and 679 converted models return
  here as a *view mode* over the same 2D data. The 2D plan stays the source of truth;
  3D is presentation. *(Includes the one-command re-run of the interrupted asset
  pipeline — `public/assets` currently holds 460 partial files and
  `src/catalog/generated.ts` is stale.)*
- Mobile site-survey mode (photos, measurements, annotations on site)
- Real-time collaboration *(a re-architecture — treat as its own project)*

### Entry criteria — do not start this phase on optimism
Two independent signals: your team uses it daily by choice, **and** at least three
external companies have asked for access unprompted.

### Licence hygiene, from day one
Nothing **AGPL-3.0** may ever enter the dependency tree — that specifically rules out
OpenConstructionERP as code, though it stays useful as a BOQ-schema reference.
OpenTakeoff is Apache-2.0 and safe to borrow from with attribution. Worth stating now
because licence mistakes are discovered at exactly the wrong moment.

---

## The whole plan at a glance

| Phase | Theme | Effort | Cumulative | Audience |
|---|---|---|---|---|
| **−1** | Twenty-minute gate | 20 min | — | You |
| **0** | Layout to quantities | 8 days | ~1.5 wks | Internal sales |
| **1** | Trust + pricing in code | 3–4 wks | ~5 wks | + production |
| **2** | Derivation depth | 3–4 wks | ~9 wks | + estimators |
| **3** | Client-ready | 3–4 wks | ~13 wks | + clients |
| **4** | Advisory intelligence | 4–6 wks | ~18 wks | + safety/ops |
| **5** | Execution bridge | 6–8 wks | ~25 wks | + procurement |
| **6** | Scale & commercialise | ongoing | — | External |

**Roughly six months of focused work to Phase 5** — a complete internal product.
Phase 6 is a business decision, not an engineering one.

These are *ideal-time* estimates for focused work, and they assume the catalogue work
in Phase 1 is properly resourced. Real calendar time will be longer; the ratio
depends on how much of your attention this gets against everything else.

---

## Running cost by phase

Revised down after the procurement research in `11-deployment-cost-plan.md`. All
figures observed 12 Aug 2026.

| Phase | Monthly infra | What drives it |
|---|---|---|
| 0 | **$13** | Render **Hobby workspace $0** + Starter instance $7 + basic-256mb Postgres $6; R2 free |
| 1–2 | **$13–26** | basic-1gb Postgres ($19) once real layouts accumulate |
| 3–5 | **$44–100** | Standard instance if PDF rasterisation moves server-side; storage growth |

Three things make this far cheaper than the earlier estimate: the **Hobby workspace is
free and can run paid services** (your sales users are app users, not Render seats);
**storage is Cloudflare R2, not GCS**, so client share links cost nothing in egress;
and **no user file is ever served through the app server** — always a presigned R2 URL.
That last one is an architectural rule the bandwidth numbers depend on.

Spend nothing until a named trigger fires — the escalation ladder is in
`11-deployment-cost-plan.md`. A genuinely $0/month path exists (Oracle Always Free +
Neon + R2) and is documented there; it is rejected for now because it trades $13 for
owning a Linux VM and your own Postgres backups.

Compare: buying OnePlan Team for eight users is ~$720/mo and still leaves the BOQ in
Excel.

---

## Handover checkpoints

The plan is designed so a dev team can take over at any boundary. Two are naturally
clean:

**After Phase 1** *(recommended)* — the product is proven and trusted, the domain
model has met reality, pricing has been differentially validated against the
spreadsheet, and the remaining work is well-understood feature building. The team
inherits validated assumptions rather than guesses.

**After Phase 2** — the derivation engine is complete and the hardest logic is
settled. Remaining phases are additive.

**Avoid handing over mid-Phase 0.** The walking skeleton and the domain model are
where the intent lives; transferring that verbally before it's expressed in working
code and tests is how rewrites start.

At whichever boundary, the handover pack is: this documentation set, the
`openapi.yaml` contract, the contract test suite, plain SQL migrations, seeded demo
data, and a recorded architecture walkthrough. **Add to it:** the differential
pricing test from Phase 1. It is the single most convincing artefact you can hand a
new team — it proves the engine is right, in their language, without them having to
trust anyone.

---

## What would change this plan

| Signal | Change |
|---|---|
| Phase −1 shows >80% pure counts | Stop. Buy OnePlan, price in Excel |
| ExcelJS can't round-trip your template | Phase 0 grows; pricing moves back into the MVP; 8 days becomes ~11 |
| The template's own formulas are distrusted | Pricing in code becomes mandatory in Phase 0, not optional in Phase 1 |
| Sales won't adopt it even when accurate | Stop. The problem is workflow or trust, not features. Re-run discovery |
| The catalogue proves unmaintainable | Phase 1 becomes a data project with its own owner before any more product work |
| Clients start asking for the link themselves | Pull Phase 3 ahead of Phase 2 |
| A compliance incident or near-miss | Pull the Phase 4 safety module forward immediately, and run the arXiv pass first |
| External demand arrives early | Phase 6 multi-tenancy moves up; audit licences before anything else |
| You hire the dev team sooner than expected | Hand over at the Phase 1 boundary and let them run Phases 2+ |
