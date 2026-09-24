# Domain Logic Design — the whole product

> **Scope:** the complete product, not the MVP · **Date:** 12 Aug 2026
> This document defines *how the product thinks*. The stack is replaceable; this
> is not. It is the part that must be right, and the part an incoming team must
> understand before touching anything.

---

## 1. The central idea: one directed derivation pipeline

Everything in this product is a **derivation**. The layout is the only thing a
human authors; every number downstream is computed from it. Getting this
direction right — and never violating it — is the difference between a tool people
trust and a spreadsheet with a picture attached.

```
  Base map ─┐
            ├──► Scale ──► Geometry ──► Quantities ──► BOQ lines ──► Priced BOQ ──► Estimate ──► Documents
  Instances ─┘                 ▲             ▲              ▲              ▲            ▲
                              │             │              │              │            │
                      Levels/Zones   Catalogue     Composition      Rate card    Overheads,
                                   (unit, basis)      rules        (versioned)   tax, margin
                                                          │
                                                    Validation rules
                                                   (advisory findings)
```

**The invariant, stated once and enforced everywhere:** *data flows left to right.*
A BOQ line never edits the layout. A price never edits a quantity. When a human
needs to intervene, that intervention is recorded as an explicit **override** with
provenance — never as a silent mutation of derived data.

Two consequences worth internalising:

- **Every stage is a pure function.** `quantities = derive(instances, catalogue, scale)`.
  No I/O, no database, no framework. Testable in milliseconds, portable to any
  language, reviewable by someone who doesn't code.
- **Any historical output can be recomputed.** Given the same inputs and the same
  versions, the same number comes out. That is what lets you answer "why did we
  quote a figure in March?" eighteen months later.

---

## 2. Core entities

```
Organisation
 └── Project ................... one event being planned
      ├── EventMeta ............ dates, days, city, venue, footfall, event type
      ├── Layout (1..n) ........ a plan; "Option A", "Option B"
      │    ├── Level (1..n) .... ground floor, first floor, terrace
      │    │    ├── BaseMap .... imported image/PDF + its calibration
      │    │    ├── Zone (0..n)  named area: F&B, VIP, backstage
      │    │    └── Instance (0..n) a canvas placement of a Variant (geometry + params)
      │    ├── Variant (0..n) .. layout-local kit copy; Template → Variant → Instance
      │    └── LayoutVersion (1..n) immutable snapshots
      ├── BOQ (0..n) ........... derived; frozen when issued
      └── Estimate (0..n) ...... derived from a BOQ + rate card + EventMeta
Catalogue
 └── CatalogueItem ............. versioned master data (unit, basis, dimensions)
RateCard
 └── Rate ...................... versioned, effective-dated, per item
```

### Design notes that matter

**`Level` exists from day one**, even when every layout has exactly one. This
resolves open question A-05. Multi-floor venues — hotels with banquet floors,
stadiums with concourses — are common in this business, and retrofitting a level
concept means touching every instance, every query and every quantity rollup.
Adding a table with one row now costs nothing.

**`Layout` is plural per project deliberately.** "Show me option A and option B"
is a normal sales conversation, and comparing two priced options is a strong
closing tool. Modelling it later means retrofitting a parent everywhere.

**`Instance` holds geometry and placement params, not measurements.** See §7.
There is no `Element` type. The object model is **Template → Variant → Instance**.
A Variant is kit content (which lines, which flags). Size is instance geometry.
Params such as `counters` or `lanes` describe *this placement* and live on the
Instance, so editing them has no blast radius. Editing the Variant (slice 6c)
changes every instance that points at it.

---

## 3. The quantity engine — the heart of the system

Every `CatalogueItem` declares **how its quantity is obtained**. This is a small,
closed taxonomy. Keeping it closed is what stops the system sprawling.

| Basis | Quantity comes from | Editor tool | Example |
|---|---|---|---|
| `count` | number of placed instances | point / footprint | 12 × green room |
| `length` | polyline length | polyline, live readout | 120 rm barricade |
| `area` | polygon area | polygon / rectangle | 450 sqm flooring |
| `volume` | polygon area × declared height | polygon + height field | scaffold cum |
| `perimeter` | polygon boundary length | polygon | stage skirting |
| `derived` | a formula over other quantities | none — computed | cable run, wastage |
| `manual` | typed by a human | properties panel | rigging load, misc labour |

**Why `perimeter` is separate from `length`:** skirting, edge trim and safety tape
are quantified from the *boundary of an area you already drew*, not from a line you
draw again. Making the user trace a stage twice is exactly the kind of friction
that gets a tool abandoned on a live call.

**Why `derived` matters more than it looks.** It is the difference between a
drawing tool and an estimating tool. Examples from this domain:

- flooring area = sum of areas of all `stage_deck` instances in a zone
- cable length = distance from each powered instance to its nearest generator
- wastage = `ceil(base_quantity × 1.1)` for consumables
- crew count = `ceil(total_rigging_weight / capacity_per_crew)`

Formulas are declared as data on the catalogue item, evaluated by a small
sandboxed expression evaluator over a known context. **Do not use `eval`,** and do
not let formulas reach the network or the database — they are pure arithmetic over
already-computed quantities.

---

## 4. Composition — implied items and kits

This is the feature that makes experienced estimators trust the output, and the
one most likely to be under-modelled.

When a salesperson places a **stage**, the real BOQ contains more than "1 × stage":

```
stage_deck 12×8 m ──implies──► deck panels        (area / panel area, ceiled)
                   ──implies──► skirting          (perimeter × 1 rm)
                   ──implies──► steps             (count, by height rule)
                   ──implies──► railing           (perimeter minus front edge)
                   ──implies──► carpet            (area, if finish = carpet)
```

**Model:** a `CatalogueItem` may declare `implies: [{ item, basis, formula, condition }]`.
Composition is resolved recursively (with cycle detection and a depth cap) during
BOQ derivation, *after* quantities and *before* pricing.

**Rules that keep this honest:**

1. Implied lines are **visibly marked as implied** in the BOQ, and show what
   implied them. An estimator must be able to see why a line exists.
2. Implied lines can be **suppressed per instance**, and the suppression is recorded.
3. Composition never implies something with a `manual` basis — that would be
   inventing a number.
4. Depth is capped and cycles are rejected at catalogue-validation time, not at
   runtime in front of a client.

**Phasing note:** composition is *not* MVP. But the `implies` field should exist
in the catalogue schema from the first migration, empty. Adding a column later is
easy; discovering that BOQ derivation assumed a flat item list is not.

---

## 5. Overrides and provenance

Humans will disagree with the computer, and they will often be right. The system's
job is to let them, without destroying the audit trail.

Every quantity carries **provenance**:

```
{ value: 452.5, unit: "sqm", source: "derived",
  from: { basis: "area", elementIds: [...] } }

{ value: 500, unit: "sqm", source: "override",
  original: 452.5, by: userId, at: timestamp, reason: "client asked to round up" }
```

Rules:

- An override **never** overwrites the derived value; it shadows it. The original
  stays visible and recoverable.
- Overridden lines are **flagged in every export**, so nobody downstream mistakes a
  negotiated number for a measured one.
- Recalibrating the scale recomputes derived values and **leaves overrides intact**,
  with a warning listing which overrides now diverge from geometry by more than a
  threshold. This is the single most useful safety net in the product.

---

## 6. Snapshots — the thing that is brutal to retrofit

The moment a BOQ or estimate leaves the building, three things must be frozen with
it: the **layout version**, the **catalogue version**, and the **rate card version**.

Without this, the following happens, and it happens to every estimating tool that
skips it: a rate is updated in March; in April a client queries a February quote;
nobody can reproduce the February number; trust in the tool collapses in one
meeting.

**Model:**

```
Estimate {
  id, projectId,
  layoutVersionId,      ← immutable snapshot of geometry
  catalogueVersionId,   ← which item definitions applied
  rateCardVersionId,    ← which rates applied
  eventMetaSnapshot,    ← days/city as they were
  computedLines[],      ← the frozen result
  issuedAt, issuedBy
}
```

`Estimate` is **append-only**. A revised estimate is a new row, not an edit. Rate
cards are **effective-dated**, never updated in place.

This costs a handful of extra tables and a discipline about writes. It is the
difference between a tool the commercial team can defend and one they quietly
stop using.

---

## 7. Geometry, units and precision

**Store geometry, derive measurements** (already ADR-005). Instances persist
canvas-space coordinates; each `Level` holds one `scale` (real millimetres per
canvas pixel). Real-world numbers are computed at read time. Uncalibrated
returns `null`, never an estimate.

The payoff: a bad calibration is a **one-field fix** that corrects every quantity
retroactively, rather than a data-corruption incident.

**Units.** Canonical storage is SI — metres, square metres, cubic metres,
kilograms. Each `CatalogueItem` declares the unit **it is sold in** (`rm`, `sqft`,
`nos`, `cum`, `kg`, `day`), and conversion happens at the boundary. Display units
are a user preference and never touch storage.

**Money.** Store as **integer minor units** (paise), never floating point. `0.1 +
0.2` problems in a quotation are indefensible. All arithmetic in integers;
division rounds explicitly with a documented rule.

**Rounding is a domain decision, not an implementation detail.** Each unit declares
its rule: barricade rounds up to whole 2 m panels; flooring rounds up to whole
panels; crew rounds up to whole people; area displays to 2 dp. Round **once**, at
the point of quantification, then carry exact integers. Rounding twice is how
totals stop matching their lines.

---

## 8. Pricing — a layered pipeline, not a formula

The stated model is `rate × qty × days + overheads`. That is the right shape but
too coarse to be correct. The real pipeline has ordered layers, each inspectable:

```
1. Line base
     day-rated item:  rate × quantity × chargeable_days
     one-time item:   rate × quantity                     ← consumables, printing, fabrication
2. Line adjustments
     minimum quantity, minimum charge, wastage %, slab/tier rate
3. Section subtotals            (by category, matching the BOQ template)
4. Overheads                    transport, labour, crew, fuel — % or computed
5. Contingency                  %
6. Discount                     % or absolute, with a reason
7. Margin                       %
8. Taxes                        GST, per HSN/SAC where it varies by item
9. Grand-total rounding
```

**The distinction that must exist in the catalogue: day-rated versus one-time.**
Rental items (staging, trussing, generators, LED walls) multiply by event days.
Consumables and fabricated items (printing, gaff tape, custom signage, carpet)
do not. If every line multiplies by days, a 3-day event over-quotes consumables by
3× — a large, systematic, invisible error. This needs a single boolean plus a
`chargeable_days` concept that accounts for build-up and dismantle days, which are
often charged at a different rate from show days.

**Every layer is inspectable in the UI.** A salesperson asked "why is it this
much?" must be able to expand the number. A black-box total gets overridden in
Excel, and then the tool is decoration.

**Rates never reach the browser** for client-facing views. Pricing executes
server-side. This is a security boundary, not a preference.

---

## 9. Validation — advisory, never blocking

A separate pipeline runs rules over the layout and returns **findings**, not errors:

```
Finding { severity: error | warning | info, code, message, elementIds[], ruleId }
```

Categories, in the order they become valuable:

| Category | Examples |
|---|---|
| **Integrity** *(MVP)* | uncalibrated scale; element outside venue bounds; zero-area polygon |
| **Completeness** *(P1)* | powered elements with no generator; stage with no access; no toilets placed |
| **Sizing** *(P4)* | toilets/exits/counters below footfall guidance |
| **Safety & compliance** *(P4)* | fire-lane width, exit travel distance, generator clearance, rigging load |
| **Commercial** *(P2)* | line with no rate; quantity implausible versus historical events |

**Advisory by design.** A salesperson mid-call must never be blocked by a
validation rule. Show a badge, let them proceed, surface findings in the export
appendix. The one exception is scale calibration, which *does* gate the
measurement tools — because the alternative is silently wrong numbers, which is
worse than friction.

**Rules are data-driven where possible** (`1 toilet per N attendees`), so the
production team can tune thresholds without a deploy.

---

## 10. What must be true from day one

Everything else in this document can arrive later. These six are expensive or
impossible to retrofit, and all are nearly free now:

| # | Requirement | Cost now | Cost later |
|---|---|---|---|
| 1 | `organisation_id` on every table | one column | backfill every row and query |
| 2 | `Level` under `Layout` | one table | touch every instance and rollup |
| 3 | Geometry stored, measurements derived | a design choice | data-corruption migration |
| 4 | Money as integer minor units | a type choice | financial re-computation |
| 5 | Append-only `Estimate` + versioned rate cards | a few tables | historical quotes unexplainable |
| 6 | `domain/` pure, no framework imports | a lint rule | the rewrite ADR-002 exists to prevent |

---

## 11. Extension points by phase

The model is designed so each later phase **adds** rather than **rewrites**:

| Phase adds | Extension point already present |
|---|---|
| Kits / implied items | `CatalogueItem.implies[]` (empty at MVP) |
| Sizing & compliance rules | validation pipeline returning `Finding[]` |
| Inventory & availability | `CatalogueItem.owned_qty`; a stock check reads BOQ output |
| Vendor assignment | `BOQLine.vendor_id` |
| Actuals vs estimate | `Estimate` is append-only; add an `Actuals` sibling |
| 3D view | `Instance` already carries footprint + height; 3D is a renderer over the same data |
| Options / scenarios | `Layout` is already plural per `Project` |
| Multi-currency | money is already unit + minor-integer |

---

## 12. Questions the pricing dump must answer

Precise, so the dump can be checked against them rather than read hopefully:

1. Which items are **day-rated** versus **one-time**? Is it a per-item flag?
2. Are **build-up and dismantle days** charged, and at what proportion of the show rate?
3. What is the **overhead** structure — fixed percentages, computed values, or per-event negotiation?
4. Is there **wastage** on consumables, and is it per item or global?
5. **Minimum quantities or minimum charges** per item?
6. **Slab/tier rates** — does unit rate change with quantity, event size, or city?
7. **GST** — single rate, or per-item HSN/SAC?
8. **Contingency and margin** — standard percentages, or per-deal?
9. **Discount** — line-level, section-level, or grand-total?
10. Are rates **city-dependent**? Is transport derived from distance?
11. How are **rate revisions** handled today — does a new rate card supersede, or do rates carry effective dates?
12. Does the BOQ template have **fixed sections in a fixed order**?
