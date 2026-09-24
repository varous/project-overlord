# Head Start Analysis — what already exists, and what that changes

> **Stage 1 (existing-solutions research):** run · **Stage 2 (arXiv prior art):** skipped at the gate, reasoning below
> **Date of all observations:** 12 Aug 2026 · **Mode:** pre-build (docs exist, no product code)
> Companion to `07-build-approach.md` (which researched *diagramming* tools). This
> document researches the thing we actually sell: **deriving a priced BOQ from a plan.**

---

## The headline finding

The previous research pass concluded that nothing on the market derives a BOQ and a
price from a layout, and that this gap was the product. **That conclusion was half
wrong, and the half that was wrong is good news.**

Nothing in the *event* industry does it. But an entire mature software category has
been doing exactly this mechanism for two decades: **construction quantity takeoff
and estimating**. Calibrate a drawing's scale, trace geometry, classify each trace
as count / linear / area / volume, attach *assemblies* that expand one traced item
into all the materials and labour it implies, apply waste and coverage rates, and
emit a priced estimate.

That is, line for line, the derivation pipeline described in `08-domain-logic.md` —
which I designed from first principles without knowing it had a name. It has a name.
Several, in fact, and a settled vocabulary.

**What this changes:** we stop inventing a mechanism and start porting a proven one
into a new domain. The novelty of this product is not the engine. It is the
**catalogue, the day-rated rental pricing model, and the sales-call speed** —
which is a much safer thing to be novel about.

---

## What exists — the three-way split

The market divides cleanly, and no one crosses the middle line:

| Category | Has layout on a real map | Has your catalogue + rates | Derives quantities from geometry | Produces a priced BOQ |
|---|---|---|---|---|
| Event site mapping (OnePlan, Prismm) | ✅ | ❌ generic library | ❌ object count only | ❌ |
| Rental/AV ERP (Rentman, Current RMS) | ❌ | ✅ | ❌ | ✅ |
| Construction takeoff (PlanSwift, Bluebeam, Kreo) | ✅ any PDF | ✅ own cost DB | ✅ | ✅ |

Read the last row carefully. Construction takeoff tools already do all four things.
They are simply built for buildings, priced per-project rather than per-event-day,
and completely unusable by a salesperson on a client call.

### Event site mapping — layout without commerce

**OnePlan** ([oneplan.io](https://www.oneplan.io/)) is the closest direct comparable
and the one worth studying hardest. Observed pricing 12 Aug 2026: Free (1 event,
25 objects, watermarked PNG export), **Pro $99/mo** ($82 annual) for 10 events,
unlimited objects, 3 levels, 3 PNG overlays, high-res PNG **and CSV inventory
export**; **Team $90/user/mo** ($75 annual) for 3–10 users, unlimited plans, 6
levels. Fair-use cap of 10,000 objects per event.

Two things matter here. First, **their pricing page mentions no BOQ, no rates, no
cost estimate at all** — the commercial half of our product simply isn't there.
Second, they *do* have "CSV inventory export", which is the honest competitor to
our MVP: place objects, export a count-based list, price it in Excel. Our advantage
has to be that a count of objects is not a BOQ — a 40 m × 20 m stage is one object
and forty different line items.

**What transfers:** levels-per-plan as a first-class concept (they sell it as a tier
differentiator, which says customers hit it); overlay import as the base-map model;
a hard object cap as an explicit, stated limit rather than a mystery slowdown.

**What not to copy:** their generic object library. Their library is a feature; ours
being *your* item database with *your* rates is the entire moat. Also don't copy
their pricing shape — per-event limits make sense for a vendor selling to many
festivals, not for internal use.

### Rental / AV ERP — commerce without layout

**Rentman** ([rentman.io](https://rentman.io/pricing), observed 12 Aug 2026):
€39/mo platform base, plus Inventory €14–19/power user/mo, plus Crew €14–24/power
user/mo, plus **Quoting & Invoicing €9/mo**, plus Equipment Tracking €9/mo, plus
History Logs €12/mo. Basic users free. It has equipment catalogues with resource /
retail / margin prices, hourly and daily crew rates, quotations and proposals — and
**no floor plans or site layouts anywhere in the product documentation.**

This is the mirror image of OnePlan, and together they define the gap precisely:
the industry has decided layout and quoting are two different products bought by
two different departments. That is the assumption we are attacking.

**What transfers:** the day-rate/hourly-rate distinction is modelled as first-class
in Rentman's crew module — confirming the day-rated vs one-time split flagged in
`08-domain-logic.md` §pricing layer 1 is standard practice, not my invention. Also
the **free "basic user"** tier: read-only users cost nothing. Our share-link viewer
role should be free by the same logic.

**What not to copy:** the module-and-add-on pricing architecture. That exists because
Rentman sells to thousands of firms with different needs. We have one firm.

### Construction takeoff — the actual prior art for our engine

**PlanSwift** ([planswift.com](https://www.planswift.com/)) — the mechanism, in
their own product terms: **Auto Scale** sets scale across an entire plan set in one
action; measurement types are linear, area, volume and count (with **Auto Count**
finding every instance of a symbol across sheets); **assemblies** containing
materials and labour are dragged onto takeoff items to produce "instant and accurate
estimates of all your costs"; output is a priced estimate, printed or exported. No
price published on the page.

**Bluebeam Quantity Link** — this one is strategically important. Instead of
building a pricing engine, Revu maps markup types (linear, area, count, volume) to
*cells in the firm's existing Excel estimating template*, with a **live,
continuously updating link** that preserves the firm's own formulas and cost logic.
The stated caveat is that behaviour depends on how the Excel file is structured.

Read that again against our requirement F9 ("must match our existing template") and
against the fact that our pricing logic is currently **blocked on a dump from another
session**. Bluebeam's answer to "the customer's cost logic is complicated and lives
in Excel" was: *don't reimplement it, drive it.*

**What transfers, concretely:**
- The **word "assembly"** for what `08-domain-logic.md` calls composition/`implies`.
  Use the industry term in the code and in conversation with the production team —
  estimators already know it, and it makes the handover documentation cheaper.
- Scale set **per sheet, once, propagated** — not per measurement.
- Waste / coverage-rate / multiplier as properties of the *condition*, not of the item.
- Deduct measurements (subtract a region) as a first-class measurement type. Not in
  our design. Should be — a stage deck with a hole in it, a barricade run with a gap.

**What not to copy:** Auto Count and AI room detection. Those exist because
construction plans have thousands of repeated symbols. A salesperson placing thirty
elements on a festival ground does not need computer vision.

### Open source

**OpenTakeoff** ([github.com/Kentucky-ai/opentakeoff](https://github.com/Kentucky-ai/opentakeoff))
— **Apache-2.0**, 5 stars, 0 forks, v0.1.0 released 22 Jun 2026. Stack: **React 18 +
Vite, HTML5 Canvas + SVG, TypeScript geometry, pdf.js, IndexedDB + localStorage,
client-only, no backend, no paid dependencies.** Features: per-sheet scale
calibration (auto-detects drawn scales *or* manual calibration from a known
dimension), one-click flood-fill area detection, and area / rectangle / linear /
surface-area / count / **deduct** measurement types; conditions with waste
percentages and multipliers; materials assemblies with coverage rates producing
rounded order quantities; CSV / JSON / print export. Snap is marked beta.

That stack is *startlingly* close to the one `06-stack-review.md` recommended
independently — Vite + React, canvas, pdf.js, IndexedDB drafts. Convergent design is
reassuring.

**Honest limitation:** 5 stars, 0 forks, one release, effectively one author, and
flooring-first despite general claims. **Do not take it as a dependency.** Read it as
a reference implementation for the two pieces of geometry code that are fiddly and
easy to get subtly wrong — scale calibration and area/perimeter measurement — where
Apache-2.0 permits borrowing with attribution.

**OpenConstructionERP** ([github.com/datadrivenconstruction/OpenConstructionERP](https://github.com/datadrivenconstruction/OpenConstructionERP))
— **AGPL-3.0**, 456 stars, Python 3.12 + FastAPI + React 18. BOQ editor with
hierarchical **sections and positions**, inline editing, automatic quantity × unit
rate, 42 validation rules across DIN 276 / NRM / MasterFormat, export to Excel /
CSV / PDF / GAEB XML. Cost-matching against a 55,000-item regional rate database
covering 11 regions including India.

**AGPL-3.0 is disqualifying as a dependency** for anything we might later offer as a
hosted service to other companies (Phase 6). Its value is as a **schema reference**:
"sections and positions" is the standard BOQ hierarchy, and our BOQ table should use
that shape so exports to standard formats stay possible later.

---

## Escalation gate — Stage 2 was not run, and why

The gate requires all three checks to pass. Check 1 asks whether there is a
technical mechanism with **no shipped prior art**. There is not:

| Component I previously believed was novel | Shipped prior art |
|---|---|
| Layout → quantity derivation | Construction takeoff, ~20 years, 4+ commercial products |
| Composition / implied items | "Assemblies" — PlanSwift, and OpenTakeoff's materials assemblies |
| Scale calibration of an arbitrary raster/PDF plan | PlanSwift Auto Scale; OpenTakeoff per-sheet calibration |
| Driving the customer's own Excel template | Bluebeam Quantity Link |
| Day-rated vs one-time pricing | Rentman crew module |
| Event site layout on a real venue map | OnePlan |

What is genuinely un-shipped is the **combination** — takeoff-grade derivation over
an event catalogue, priced per event-day, fast enough for a live sales call. A novel
combination of documented mechanisms is a product opportunity, not an open research
question, and an arXiv search would return nothing usable. Check 1 fails; Stage 2 is
skipped rather than paid for.

*If you want it anyway* — the one place a literature search could genuinely help
later is **Phase 4 sizing and crowd-flow rules** (how many toilets, exits and
queue lanes for N attendees, and evacuation-time modelling). That has real academic
literature behind it and real liability attached. Say the word when Phase 4 comes
into view and I'll run Stage 2 on it then.

---

## Cost reality — three points

All figures observed **12 Aug 2026** from vendor pricing pages.

**Render** ([render.com/pricing](https://render.com/pricing)): Workspace Hobby $0
(up to 25 services, 5 GB bandwidth, 500 build min), **Pro $25/mo** (unlimited
services, 25 GB bandwidth, 1K build min). Web service instances: Free (512 MB,
0.1 CPU), **Starter $7** (512 MB, 0.5 CPU), **Standard $25** (2 GB, 1 CPU), Pro $85
(4 GB, 2 CPU). Postgres: Free (30-day limit only — *not* viable for real data),
**basic-256mb $6**, **basic-1gb $19**, pro-4gb $55; storage expansion $0.30/GB.

**Object storage — switch the recommendation to Cloudflare R2.**
([developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/)):
$0.015/GB-month, Class A (writes) $4.50/M, Class B (reads) $0.36/M, **egress free**,
free tier 10 GB-month + 1M Class A + 10M Class B. Venue maps and rendered PDFs are
write-once, read-many, and every client who opens a share link is egress. GCS
charges for that egress; R2 does not. This resolves **OQ-13** in favour of R2.

| | Prototype | Launch (internal, ~8 users) | Growth (Phase 5–6) |
|---|---|---|---|
| Render workspace | $0 Hobby | $25 Pro (needed for team seats) | $25 |
| Web service | $0 free instance | $7 Starter → $25 Standard | $85 Pro, ×2 instances |
| Postgres | $6 basic-256mb | $6, → $19 basic-1gb once layouts accumulate | $55 pro-4gb |
| Storage | $0 (inside R2 free tier) | ~$0–2 | $5–20 |
| Sentry / error tracking | $0 free tier | $0–26 | $26+ |
| **Total** | **~$6/mo** | **~$40–75/mo** | **~$200–350/mo** |

The line that scales fastest is **Postgres storage**, because base maps are the
heavy objects — and the fix is to keep them in R2 and store only keys in Postgres,
which the current design already does. There is no meaningful lock-in at any tier:
Docker containers and plain Postgres move anywhere, and R2 speaks the S3 API.

For comparison, **buying instead of building** costs OnePlan Team at $90/user/mo →
~$720/mo for eight users, and still leaves the BOQ in Excel.

---

## The recommendation

**Build — but reframe it as porting construction takeoff into events, and cut the
pricing engine out of the MVP.**

Three changes to the plan, in order of how much they matter:

### 1. Ship the MVP as a *quantity* tool, not a *pricing* tool

The pricing engine is blocked on an input that hasn't arrived, and pricing is where
the estimating logic is most idiosyncratic and most politically sensitive to get
wrong. Bluebeam's answer is the right one for us too: **derive the quantities in the
product, write them into the existing Excel template, let the existing formulas do
the pricing.**

The MVP promise becomes: *"a correct, complete quantity list in your own template,
in ten minutes, from a layout you built on the call."* The salesperson still gets a
number on the call — Excel computes it the moment the file opens. We are not
reimplementing a spreadsheet the commercial team already trusts, on day six, from a
dump we haven't read.

Pricing in code moves to Phase 1, once the dump has arrived and been read, and it
arrives with a ready-made test oracle: **the same layout must price identically in
code and in the spreadsheet.** That is a far stronger correctness guarantee than any
unit test I could have written blind.

This removes pricing layers 3, 4 and 9 from the 8-day MVP and removes the
single largest unknown in it. It does not shrink the MVP's value — the value was
always the derivation.

### 2. Adopt the takeoff vocabulary wholesale

Rename in code and docs, before writing any of it: composition → **assembly**;
quantity basis → **measurement type** (keeping our seven); add **deduct** as a
measurement type; move waste / coverage rate / multiplier onto the **condition**.
This costs an hour now, and buys: estimators who understand the UI without training,
a dev team that can search for prior art, and a schema that maps onto standard BOQ
formats later.

### 3. Read OpenTakeoff before writing the calibration and measurement code

Specifically its scale calibration (including scale auto-detection from a drawn
scale bar — an idea worth stealing) and its area/perimeter geometry. Apache-2.0,
attribution required. Read-only: do not install it, do not depend on it. Budget two
hours; expect to save more than a day of subtle geometry bugs.

### Credible alternative, and when it wins

**OnePlan Team + Excel.** ~$720/mo for eight seats, zero build, available this
afternoon. It wins outright if — and only if — a count of placed objects is close
enough to a BOQ for your business. Test it cheaply: take your three most recent
BOQs and ask what fraction of line items are derivable from an object count alone.
If it's above roughly 80%, **buy OnePlan and stop reading.** My expectation from
your item list (trussing by the metre, flooring and carpet by area, barricade by
run, power by cable distance) is that it will be well under half — but that is my
inference, not a measurement, and it is cheap for you to measure.

**Second alternative: buy a takeoff tool and live with it.** PlanSwift already does
the mechanism. It fails on the thing that is non-negotiable — a salesperson using it
live on a call — and on day-rated event pricing. Rejected, but it is the reason the
engine is a port and not an invention.

---

## Evidence status

**Inspected:** OnePlan pricing page; Rentman pricing page; PlanSwift product page;
Bluebeam Quantity Link technical article; OpenTakeoff repository README and release
metadata; OpenConstructionERP repository; Render pricing page; Cloudflare R2 pricing
docs. All 12 Aug 2026.

**Not inspected:** Prismm and Cvent/Social Tables pricing (enquiry-gated — no public
figures, so no numbers are quoted for them here); PlanSwift and Kreo pricing (not
published); OnePlan's actual CSV export format; whether OnePlan's object model has
any dimensioned geometry at all.

**Community sources (X, Reddit, YouTube) were not searched.** The skill asks before
spending on them and no one was available to ask; docs and pricing pages were
sufficient to support every claim above. Worth adding if you want real-world reports
of ExcelJS template fidelity or OnePlan in live use — say so and I'll run it.

**Assumptions made visible:**
- **A-09** Your BOQ line items are mostly *measured*, not *counted*. Everything in
  recommendation 1 and the rejection of OnePlan rests on this. **Falsifiable in
  twenty minutes with three past BOQs — please do that before day one.**
- **A-10** Your existing Excel template's pricing formulas are correct and trusted.
  If they aren't, recommendation 1 inherits a bug, and pricing must move into code
  in Phase 1 rather than optionally.
- **A-11** Layouts stay under a few hundred elements. OnePlan's 10,000-object
  fair-use cap suggests real users go far higher than my 500-element NFR; worth
  checking against your largest festival before fixing the number.

## Failure conditions — when this recommendation becomes wrong

| Signal | What it invalidates |
|---|---|
| Past BOQs are >80% pure counts | Build nothing. Buy OnePlan Team, price in Excel |
| ExcelJS cannot round-trip your template | Recommendation 1 collapses; pricing must move into code in the MVP, and the MVP grows past 8 days |
| The Excel template's own formulas are distrusted | Same as above |
| Sales won't build a layout live, even a good one | The whole premise. Re-run discovery before Phase 1 |
| You decide to sell this externally within 6 months | Nothing borrowed may be AGPL; R2 and multi-tenancy move up; revisit `09-phased-plan.md` Phase 6 entry criteria |

## Next actions, in order

1. **Measure A-09.** Three recent BOQs; what fraction of lines are pure counts? This
   is the only decision that can invalidate the build.
2. **Send the BOQ template.** It unblocks the ExcelJS spike, which now gates the MVP
   shape rather than just one export feature. Run the spike the day it arrives.
3. **Rename to takeoff vocabulary** in `08-domain-logic.md` — before any code.
4. **Fix the two `infra/` defects** (`preDeployCommand` → entrypoint;
   `node:22-alpine` → `node:22-slim`). Known, unfixed, trivial.
5. **Switch storage to R2** in `02-architecture-and-stack.md`; close OQ-13.
6. **Read OpenTakeoff's calibration and geometry**, then start build slice 0.

---

**Sources:**
[OnePlan pricing](https://www.oneplan.io/pricing) ·
[Rentman pricing](https://rentman.io/pricing) ·
[PlanSwift](https://www.planswift.com/) ·
[Bluebeam Quantity Link deep dive](https://blog.bluebeam.com/quantity-link-bluebeam-deep-dive/) ·
[Bluebeam takeoff & estimation](https://www.bluebeam.com/workflows/takeoffs-and-estimation/) ·
[OpenTakeoff (Apache-2.0)](https://github.com/Kentucky-ai/opentakeoff) ·
[OpenConstructionERP (AGPL-3.0)](https://github.com/datadrivenconstruction/OpenConstructionERP) ·
[Render pricing](https://render.com/pricing) ·
[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) ·
[Kreo](https://www.kreo.net/) ·
[Planning Pod floor plan software](https://planningpod.com/event-floor-plan-software)

---

# Addendum — 12 Aug 2026, after the seed data arrived

Re-running the whole of Stage 1 would have been theatre: the takeoff prior art,
the comparables and the cost picture are hours old, not months. What genuinely
changed is that the object model turned out to be **package kits with
MANDATORY / DEFAULT_ON / OPTIONAL flags** — and that is a *product configurator*,
which is a large mature software category I had not looked at once. This addendum
covers only that.

## What exists: Configure-Price-Quote (CPQ)

The variant editor I am about to build is, in industry terms, a **bundle
configurator**. The category has a settled vocabulary and, more usefully, a
well-documented failure mode.

**Product rules** come in four kinds ([CPQ Integrations](https://cpq-integrations.com/cpqpedia/product-rules-in-cpq/),
observed 12 Aug 2026):

| Rule type | What it does | Our equivalent today |
|---|---|---|
| **Selection** | Auto-add, remove, disable or hide options when another is chosen | none — this is what Phase 2 will want |
| **Validation** | Blocks saving until the configuration is legal | none |
| **Filter** | Narrows which options are even offered, by scenario | none |
| **Alert** | Warns but lets the rep continue, subject to approval | our `Finding[]` at `warning` severity |

Rules are modelled as **conditions** (operators against a tested object) plus
**actions** (add / remove / enable / disable / show / hide). The documented
warning is the important part: a mature installation carries *"potentially
hundreds of other rules"*, and the only mitigation the docs offer is naming
discipline. That is a category-wide admission that rule engines become
unmaintainable, and it is the trap to design away from rather than into.

**What transfers:** the four rule-type taxonomy, as a *roadmap ordering*. When
package dependencies arrive, add **selection rules only**, and stop. Selection
rules cover "if you add a stage, you need steps" — the case that will actually
come up. Validation and filter rules are what turn a configurator into a system
nobody can reason about.

**What not to copy:** a general condition/action rule engine. We have 217 items
and one company. Our three flags already express everything the seed packages
need, and they are declarative data rather than executable rules — which is why
`setLineIncluded` is fifteen lines and cannot loop.

**A dated signal worth recording:** Salesforce's own CPQ help page now states
that CPQ *"continues to be available for existing customers, however, there is no
longer any new feature development"*, pointing customers at Agentforce Revenue
Management instead ([Salesforce help](https://help.salesforce.com/s/articleView?id=sales.cpq_bundle_products.htm),
observed 12 Aug 2026). The incumbent in this category is in maintenance mode,
which weakens "just buy a CPQ" as an alternative — and none of them do venue
layout anyway.

## Open source

**openCPQ** ([github.com/webXcerpt/openCPQ](https://github.com/webXcerpt/openCPQ))
— MIT, **78 stars**, 181 commits, **no published releases**, JavaScript, README
documentation marked work-in-progress, no stated constraint-solving model. In-browser
product configuration, with an optical-transport example. **Not a dependency** —
no releases and incomplete docs is not a foundation for a pricing engine. Worth
ten minutes only if we ever need a UI pattern for deep nested configuration.

**OpenConfigurator** ([github.com/rmitache/OpenConfigurator](https://github.com/rmitache/OpenConfigurator))
— feature models solved with the **Z3 SMT solver**. Genuinely interesting, and
genuinely overkill: an SMT solver earns its place when options interact
combinatorially. Ours are a flat list of includable lines. Noted for the day
someone asks for mutually exclusive option groups across packages.

**OCA product-configurator** — Odoo-coupled, so irrelevant to us as code.

## Escalation gate: Stage 2 not run

Check 1 asks whether there is a technical mechanism with **no shipped prior art**.
There is not: bundle configuration with required/optional/default options and
selection rules is shipped by Salesforce, PROS, Tacton and KBMax, and constraint-based
configuration has both open-source implementations and its own literature. The
gate fails at the first check, so an arXiv search would return nothing usable and
was not paid for.

*Where it would still be worth it:* if package options ever become genuinely
interdependent — mutual exclusions, cross-package constraints, "valid
combinations" — then configuration-as-constraint-satisfaction has real literature
and known complexity traps. Say the word if that arrives.

## Does anything need to change?

**No architectural change.** Three small confirmations and one deliberate
non-change:

1. **The three flags are the right primitive.** They are the minimal subset of
   what CPQ calls option requirement levels, they are data rather than executable
   rules, and the category's own documentation says the elaborate version
   collapses under its own weight. Keep them.
2. **Phase 2 gets selection rules, and only selection rules.** Added to
   `docs/09-phased-plan.md`. Cap them at a documented number and revisit if we hit
   it — a cap that gets hit is information.
3. **`OPTIONAL` as the closed addition set is validated by prior art.** CPQ filter
   rules exist precisely because unconstrained addition makes quotes unreviewable.
   The seed's design got this right without needing the rule type.
4. **The variant editor should borrow CPQ's *interaction*, not its machinery** —
   options grouped, requirement level visible per line, and a running total that
   updates as options toggle. That is what makes a configurator feel fast, and it
   is free.

**Evidence status:** inspected the CPQ product-rules reference, Salesforce's bundle
help page, and both OSS repositories, all 12 Aug 2026. Not inspected: PROS,
Tacton, KBMax and Configit pricing or docs (enquiry-gated, and we are not buying).
Community sources not searched.
