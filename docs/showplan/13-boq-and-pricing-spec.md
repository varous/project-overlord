# BOQ & Pricing — implementation report

> **Date:** 12 Aug 2026 · Input: `ClockworkAV_BOQ_seed_v1` (217 items, 1,937 rates)
> **Status:** engine built and tested against the real seed data. The live domain
> test count is authoritative in `.agent/STATUS.md` (domain tests line) — do not
> re-transcribe it here; a hardcoded number will drift again.
> Supersedes the quantity model in `08-domain-logic.md` — see §6.

---

## 1. The gate is resolved: build. But not for the reason I predicted.

`09-phased-plan.md` Phase −1 said: classify BOQ lines as pure counts versus
measured or implied, and **if more than 80% are pure counts, don't build this —
buy OnePlan and price in Excel.** The seed data answers it precisely:

| qty_basis | Items | Share |
|---|---|---|
| COUNT | 104 | 47.9% |
| COUNT_PER_DAY | 67 | 30.9% |
| AREA | 20 | 9.2% |
| LENGTH | 13 | 6.0% |
| VOLUME | 8 | 3.7% |
| CONSUMPTION_PER_HOUR | 4 | 1.8% |
| RATE_PER_LITRE | 1 | 0.5% |

**78.8% of items are count-based.** On the literal reading of my own threshold
that is a stop signal — and it would have been the wrong conclusion, because the
threshold was measuring the wrong thing.

Nothing in this product is placed directly. A user places a **package**, and
every line it produces is *implied* by a `qty_rule`. So **100% of BOQ lines are
implied items**, and the arithmetic that matters is not "can we measure it" but
"can we expand a Box Office into its five lines and apply the right day curve to
each". OnePlan's CSV inventory export cannot do that; neither can a spreadsheet
without a human driving it.

I was wrong about where the value sits. I said it was measurement. It is
**kit expansion plus day-curve pricing** — and that is a stronger position,
because it depends on your proprietary rate chart and your package library rather
than on geometry anyone could compute.

**Consequence for the plan:** composition was Phase 2. It is now **Phase 0**. A
product that makes you type the five lines yourself has no reason to exist.

## 2. Pricing returns to the MVP

`10-head-start-analysis.md` recommended shipping the MVP as a *quantity* tool and
driving your existing Excel template for the pricing, because the pricing logic
was unknown and writing it blind on day six was the largest risk in the build.

**That reason has evaporated, and pricing moves back into code.** Three grounds:

1. The logic is no longer unknown. It is fully specified, and specified *as data*
   — five day curves, two declared-day inputs, a fuel special case, an override
   per line. There is nothing left to guess.
2. **Role gating is a security boundary Excel cannot enforce.** VENDOR rates —
   your cost base, with per-city detail — must never reach a non-admin browser.
   A spreadsheet that computes the quote is a spreadsheet that contains the rate
   chart. This alone settles it.
3. The engine is written and tested already, so this costs no schedule. It
   replaces build slice 6 rather than extending it.

The Excel export stays, but as an *export* of a priced BOQ, not as the pricing
engine. And the differential test I proposed for Phase 1 is still the right idea
in reverse: price your last three real events in the engine and reconcile against
the spreadsheets. Any divergence is a bug in one of them, and finding out which
is the point.

## 3. What was built

All in `packages/domain` — zero runtime dependencies, so the commercially
important rules survive any rewrite of the UI or the backend.

| Module | Responsibility |
|---|---|
| `catalog.ts` | The data contract as types. Item, Rate, DayCurve, PackageTemplate |
| `load.ts` | Bundle parser **and validator**. Emits `Finding[]`, blocks a bad import |
| `rates.ts` | `(side, city)` → generic fallback, and the immutable `RateSnapshot` |
| `days.ts` | `override ?? curve[min(declared,14)]`. **No curve arithmetic anywhere** |
| `instances.ts` | Template → Variant → Instance; flag rules; `qty_rule` resolution |
| `boq.ts` | Aggregation by `item_code` across placements, with per-instance provenance |
| `pricing.ts` | `qty × rate × billed_days`, the fuel special case, section subtotals |

Plus `packages/api/src/scripts/import-catalogue.ts` — idempotent by code, with a
`--dry-run` that validates and writes nothing.

**Worked example, hand-checked and asserted in the test suite.** One
`PKG_GENSET125`, 5 ops days, 8 running hours, generic CLIENT rates. The rates are
shown as symbols — R1 generator hire per day, R2 diesel per litre, R3 power
cable, R4 chemical earthing — so no figure is recorded here:

| Line | Curve | Billed days | Working | Amount |
|---|---|---|---|---|
| GEN_125KVA | FULL | 5 | 1 × R1 × 5 | 5 × R1 |
| GEN_125FUEL | *(bypassed)* | 5 declared | 1 × 15 l/hr × 8 h × 5 d × R2 | 600 × R2 |
| PWR_POWECABL | PWR | **1.5** | 1 × R3 × 1.5 | 1.5 × R3 |
| PWR_CHEMEART | ONCE | **1** | 2 × R4 × 1 | 2 × R4 |
| PWR_3PHADROP | — | — | OPTIONAL, excluded by default | — |
| | | | **Subtotal** | **5·R1 + 600·R2 + 1.5·R3 + 2·R4** |

Note what the curves earn in that one example: PWR bills a 5-day show as 1.5
days, and ONCE bills the chemical earthing once however long the show runs. A
naive `qty × rate × days` engine would have charged 5 × R3 and 10 × R4 for those
two lines — over by 3.5·R3 + 8·R4 against a subtotal of 5·R1 + 600·R2 + 1.5·R3 +
2·R4. **This is exactly the
systematic over-quoting I flagged in `08-domain-logic.md`, and the curves are the
fix.**

## 4. Data findings — what needs your attention

The bundle is **clean**: no duplicate codes, no orphan foreign keys, no duplicate
`(item, side, city)` rate keys, no non-positive rates, every curve complete for
days 1–14, and units mapping 1:1 to `qty_basis` across all 217 items. That is
better hygiene than most production datasets. Validation reports **0 errors, 32
warnings.**

### 4.1 🔴 Thirty items have no CLIENT rate — and they are not exotica

This is the finding that matters. The list includes **porta-loos, urinals,
handwash, drainage, toiletry consumables, water tankers, bio-waste dumping, pest
control, post-event cleanup, BLS ambulance with doctor, first-aid counter, police
personnel, fiber cabling, CCTV cabling, all four vanity vans, and the box-office
and Yondr fascias and masking.**

Those appear on essentially every event you run. A pricing engine that treated a
missing rate as zero would produce a quote that is quietly, confidently too low —
and somebody would send it to a client.

**So it doesn't.** An unpriced line keeps its quantity, has a `null` amount, the
quote is flagged `incomplete`, and the offending item codes travel with it. The
test `"an unpriced line is never a zero line"` locks that behaviour in.

**Action:** these 30 rates are worth more than any feature I could build this
week. Until they exist, no BOQ containing a toilet block can be quoted.

### 4.2 🟠 The `rate` column is overloaded

For the four `GEN_*FUEL` items, `rate` holds **litres per hour, not money**.
`GEN_125FUEL`'s stored `15.0` means 15 l/hr; its own notes confirm it.

Handled by splitting the two meanings into separate fields at import
(`valuePaise` vs `litresPerHour`), so the type system makes it impossible to add
litres to rupees. Verified: consumption is identical across CLIENT/VENDOR and all
cities, which is physically correct — a genset burns the same diesel whoever
pays. If a future import disagrees, the importer raises
`CONSUMPTION_INCONSISTENT` and refuses.

**Worth fixing in the sheet eventually:** a separate `consumption_l_per_hr`
column on items would make this explicit rather than conventional.

### 4.3 🟠 Nothing links a fuel line to its genset

The formula needs `qty_gensets`, but `linked_rate_item` points to
`GEN_DIESFUEL` (the price source), not to `GEN_125KVA` (the genset). Today the
pairing only exists in the naming convention `GEN_125FUEL` ↔ `GEN_125KVA`, and
"never hardcode item lists" forbids me relying on that.

**Current behaviour:** the fuel line's own resolved qty is used, which is correct
as long as packages pair one genset with one fuel line — which all three seed
packages do. **Recommended contract change:** add `linked_asset_item` (or reuse
`linked_rate_item` with a second field) so the pairing is data. Until then, the
real package library must maintain the 1:1 pairing.

### 4.4 🟡 Fuel bypasses the day curve, and the curve is silently ignored

Per SCHEMA.md, fuel uses **declared days**, not billed days — diesel burns on
real days, not market-curve days. All four fuel items carry curve `FULL`, where
the two happen to agree, so the distinction is invisible today.

It would stop being invisible the moment an admin changed a fuel item's curve, so
the engine emits `FUEL_CURVE_IGNORED` whenever a fuel item's curve is not `FULL`.
**Consider dropping `day_curve` from fuel items entirely** — a field that is read
but never used is a trap.

### 4.5 🟡 Vendor rate coverage is patchy

41 items have no generic VENDOR rate, and only 176 of 217 have any city rows
(7–9 of the 9 cities each, not all nine). The lookup handles it — city, then
generic, then unpriced — and reports which happened. Worth knowing before anyone
runs a margin report and finds gaps.

### 4.6 🟡 Two rule/basis mismatches in the placeholder packages

- `PKG_BOXOFFICE` prices `MISC_FRONFASC` with `PER_LENGTH`, but that item's
  `qty_basis` is `COUNT` and its unit is `nos` — so the rule produces running
  feet for an item sold by number
- `PKG_ENTRYGATE` prices `BAR_MOJO` with `PER_COUNT_PARAM:lanes`, but its
  `qty_basis` is `LENGTH` and unit is `rft`

One of the two sides is wrong in each case. These are placeholders so it hardly
matters now — but the importer validates `qty_rule` against `qty_basis` on every
import, so **the real package library will be checked the moment it lands**. That
check is worth having before a workshop authors 60 packages.

### 4.7 🟢 Billed days can be fractional

Day-curve `VC` day 4 → 1.5, `PWR` day 5 → 1.5, `RENT` day 3 → 1.5. Amounts are
rounded to whole paise exactly once, at the line. No intermediate rounding, so a
total is always the sum of the numbers a client can see.

### 4.8 🔴 Technical Production is 56% of a real show and is not in the catalogue

A 17-venue tour costing workbook (15 Aug 2026) has four cost families:
Venue Construction, Operations, Power, and Technical Production (audio, lighting,
video and trussing). Technical Production was **56% of the money** on that tour.
Our catalogue has no `TECH` items and no `TECH` rates. Cross-check: 191 of 221
line names in that sheet match the rate chart exactly; the unmatched remainder
is mostly Technical Production, plus CBM scaffolding towers and Octonorm
structures.

**Decision (Joyjeet):** we quote Venue Construction, Operations and Power only.
`Section` does **not** gain a fourth member. Adding Technical Production is a
catalogue programme, not an enum change in a deploy.

A quote that silently omits more than half the cost is the same class of bug as
treating a missing rate as zero. Every quote — preview, issued, export — carries
an explicit exclusion. Treat it like `incomplete`: structural, not a footnote.

**Payload (proposed, no UI yet)** — sibling of `incomplete`, snapshotted on
issue:

```
scope: {
  quotedSections: ["VC", "OPS", "POWER"],
  totalKind: "vc_ops_power",
  exclusion: "This quotation covers Venue Construction, Operations and Power. Technical production — audio, lighting, video and trussing — is not included.",
  warning: "Not a show total. Technical production is excluded."
}
```

`quotedSections` / `totalKind` are keys. Copy is data on the issued row. Do not
write `if (section === "TECH")`. See `01-prd.md` F7.7.

## 5. Two things the seed changes about the data model

**The tags corpus is a real asset.** 2,018 tags across 217 items, 5–14 each,
colloquial ("camera riser", "grey carpet platform", "generator running cost").
That is a ready-made search index and, later, the mapping corpus for
*"add three entry gates and a 125 kVA drop"* typed in plain English. Stored as a
Postgres `String[]` with a GIN index in mind.

**`power_supply_kva` on the four gensets is half of a feature.** Once
`power_load_kva` is populated on demand-side items (known gap 2), summing load
across instances and auto-suggesting gensets plus fuel lines becomes arithmetic
we already have. The column is in the schema now, unpopulated, so no migration is
needed later.

## 6. What this supersedes in `08-domain-logic.md`

That document proposed a single-layer model: seven quantity bases attached to
items, with composition as a later `implies` mechanism. The real model is
**two layers**, and it is better:

| Layer | Where it lives | What it says |
|---|---|---|
| `qty_basis` | on the **item** | what unit this thing is *sold in* — sqft, rft, nos, cbm |
| `qty_rule` | on the **package line** | how much of it *this kit needs* — FIXED, PER_AREA, PER_LENGTH, PER_COUNT_PARAM |

Separating them is what lets one item appear in twenty packages with twenty
different quantity rules, without duplicating the item. My single-layer version
would have forced a copy per usage. The `implies`/composition mechanism I
designed is simply what `package_items` already is.

**Also superseded:** my "measurement type" naming. The industry words here are
`qty_basis` and `qty_rule`, they are already in your master sheet, and the
estimators already use them. Renaming to takeoff vocabulary would have been
correct advice in the abstract and wrong here — use the sheet's language.

**Still valid from that document:** money as integer paise, rate-card versioning
with snapshots, provenance on every derived number, findings rather than silent
substitution, and the day-rated versus one-time split — which turns out to be
exactly what `FULL` versus `ONCE` encodes.

## 7. Revised Phase 0

> ⚠️ **The authoritative slice table now lives in `09-phased-plan.md`.** The copy below
> is kept only to record *what changed and why* on 12 Aug 2026. If the two ever
> disagree, `09-phased-plan.md` wins. (They did disagree for a day — this doc had 6b
> and 6c, the plan did not, and Claude Code correctly reported that slice 6c "is not in
> the Phase 0 slice table at all". Fixed 13 Aug.)


| # | Slice | Was | Now |
|---|---|---|---|
| 0 | Walking skeleton | ½ d | ✅ done |
| 1 | Auth — OIDC, session, `hd` gate | ½ d | ½ d |
| 2 | Projects dashboard | ½ d | ½ d |
| 3 | Base map upload + scale calibration | 1 d | 1 d |
| 4 | Editor — Konva, package palette, place/move/rotate/delete, undo, drafts | 2 d | 2 d |
| 5 | Measurement tools | ½ d | ½ d |
| 6 | ~~BOQ as pure functions~~ | 1 d | ✅ **done** — engine; live count in `.agent/STATUS.md` |
| 6b | Catalogue import + admin read-only views | — | ½ d |
| 6c | Variant editor — the flag rules on screen | — | 1 d |
| 7 | Export — Excel into your template, layout PDF | 1½ d | 1½ d — transform, not screen dump; blocked on OQ-03 quotation `.xlsx` |
| 8 | Share links with roles | ½ d | ½ d |

Still **8 days**, with the riskiest day already banked. Slice 6c is new and
necessary: the flag rules (MANDATORY / DEFAULT_ON / OPTIONAL) are the entire
customisation UX, and there is no design for it — logged in
`design-inventions.md`.

## 8. Open questions for you

1. **Who owns the 30 missing CLIENT rates, and by when?** This is the only item
   on the list that blocks quoting real events.
2. **Fuel ↔ genset pairing:** add a data field, or guarantee the 1:1 pairing in
   the package library by convention? I'd take the field.
3. **Which day count drives a fuel line?** Fuel items have `section = "POWER"`
   (Power), so they take `opsDays`. Confirm that is right — it is the reading of
   SCHEMA.md I implemented, and a genset running on Venue Construction build-up
   days would need different treatment.
4. **`COUNT_PER_DAY` with unit `day`** (4 items) versus `nos/duty` (63). Is the
   `day` unit meaningful, or a sheet artefact?
5. **Quote revisions:** immutable append-only per project (Rev A, B, C), as
   modelled? Or editable until issued?
6. **Rounding for presentation:** the engine rounds to the paise. Do your
   quotations round to the rupee, or to the nearest 100 rupees, at the line or
   only at the total?

---

## 9. Decisions taken, 12 Aug 2026 — and what changed in the code

All five are now behaviour, with tests in `packages/domain/test/decisions.test.ts`.

### 9.1 Missing rates read as "Price not specified"

The 30 items awaiting rates are an **expected state, not a fault**. So:

- The line keeps its quantity, `amountPaise` is `null`, and `amountLabel` reads
  **"Price not specified"**
- Severity is **warning**, not error — the import and the quote both proceed
- `quote.priceNotSpecifiedItemCodes` separates "awaiting a rate" from
  "a rate exists but wouldn't resolve", which is a genuine fault and stays an error
- `quote.incomplete` is still `true`. That is deliberate and not up for
  negotiation: a quote missing its toilets must not present itself as whole

Tests reference `WC_PORT`, `WC_URIN` and `MED_BLSAMBU` directly, so the day the
rates land the assertions will fail loudly and tell us to update them. That is
the behaviour I want from a test guarding a temporary state.

### 9.2 Fuel leaves the layout

Your ruling: the layout places **generators**. Fuel is a consumption question,
and power planning belongs in its own module later.

Implemented as:

- `Instance.runningHoursPerDay` — asked **per placement**, not per project,
  because the stage genset and the backstage genset genuinely run different
  hours. Left null, **every fuel line on that placement is omitted from the
  BOQ entirely** — omitted, not zeroed, with an `info` finding explaining how to
  include it
- Fuel is priced **per placement and then summed**, walking the contributions.
  This matters: two gensets at 6 h and 14 h must not be priced as two gensets at
  an averaged 10 h. There is a test for exactly that
- A generator with no hours contributes no fuel even when a sibling placement
  has hours — and both generators still appear on the BOQ

So a layout with three gensets and no hours entered produces three genset hire
lines and no fuel, which is what you asked for. Answer "how many hours?" on one
of them and only that one's fuel appears.

**Roadmap note added:** event power planning — load summing, genset sizing, fuel
and distribution — is its own module, not part of layout-to-BOQ. That also parks
known gap 2 (`power_load_kva`) cleanly; the column exists, unpopulated.

### 9.3 The question I asked badly

Question 3 was: *"fuel items have `section = POWER` (Power), so they take
`opsDays` — confirm that's right?"* The concern was that a genset running through
Venue Construction build-up days would be billed on the shorter Operations count
and under-quote the diesel.

**Your answer to (2) dissolves it.** Fuel is now driven by the running hours you
enter for that placement, so if a genset runs through build-up you say so in the
hours. The `ops_days` reading stands, and the ambiguity no longer has anywhere to
hide. Nothing to decide.

### 9.4 Quote lifecycle and versioning — revised

**Revised after review.** My first attempt made one two-digit number do two jobs:
identify the quote and tell a human how significant the change was. That is why it
needed a warning at `x9` and an error at `99` — a label that is also an identity
cannot be allowed to run out, so it had to complain. Splitting the two jobs
removes every edge case rather than handling them:

| | Field | Job |
|---|---|---|
| **Identity** | `sequence` | Monotonic 1, 2, 3… per project. What the database keys on, sorts by, and walks the revision chain with. Cannot run out |
| **Label** | `versionMajor` + `versionMinor` | Two small integers, rendered by **concatenation**. What a human reads and what prints on the PDF |

Lifecycle: **DRAFT** (editable, unnumbered, shown as "Draft") → **ISSUED** (lines
and rates frozen, version assigned) → **SUPERSEDED** (a later version exists).

Rules, and there are only three:

```
first issue          major 1, minor 1   ->  "11"
minor change         minor + 1          ->  "12", "13" …
minor change from x9 major + 1, minor 1 ->  promotes, silently
major change         major + 1, minor 1 ->  "21", "31" …
```

**Both former edge cases are now non-events:**

- A minor change from `x9` promotes to the next major. No warning. The number
  reads as a major revision because at that point it *is* one, and nagging about
  it would be the software second-guessing a judgement its users have already made
- Past major 9 the label grows a digit on its own — `"101"`, then `"102"`. Nothing
  is capped, nothing is refused, and nobody gets blocked mid-quote over a case
  that shouldn't arise. `nextVersion` is **total**: there is no input for which it
  throws. A test runs 200 successive bumps and asserts the sequence never breaks

The reasoning behind stopping there is yours and it is right: if a quote needs
fifteen revisions, the scope changed, and the honest answer is a new quote. That
is a conversation for the team, not a rule for the software to enforce — software
that enforces it just gets worked around.

**Schema:** `Quote.sequence`, `Quote.versionMajor`, `Quote.versionMinor`,
`Quote.supersedesSequence`, with `@@unique([projectId, sequence])` and an index on
`(projectId, versionMajor, versionMinor)` for display ordering.

### 9.5 Rounding to the nearest 100 rupees, at the total only

- **Lines keep exact paise.** Rounding each line would make the arithmetic on the
  page wrong for anyone who adds it up — and someone always does
- The total rounds once, to the nearest 100 rupees
- The delta is **returned, not absorbed**: `rounding.deltaPaise` is meant to be
  shown as its own "Rounding" correction line, so the total visibly reconciles
  with the subtotal
- The increment is configurable (`totalRoundingPaise`), so nearest 500 or 1,000
  rupees is a setting rather than a rewrite. Set it to 0 to disable — which is
  what the arithmetic tests do

### 9.6 One thing I added while implementing

`PricedLine.contributions` now carries the full per-placement breakdown, not just
a count. It was needed to make the per-placement fuel hours visible, and it is
the answer to "where did that number come from?" for every other line too.
Cheap now, awkward to retrofit once the BOQ table is built.

**Schema changes:** `Instance.runningHoursPerDay`; `Quote.status`,
`Quote.version`, `Quote.issuedAt`, `Quote.supersedesVersion`,
`Quote.roundingDeltaPaise`, `Quote.roundingIncrementPaise`,
`Quote.priceNotSpecifiedCodes`; `QuoteLine.unpricedReason`,
`QuoteLine.runningHoursJson`. `@@unique([projectId, revision])` became
`@@unique([projectId, version])`.

### 9.7 Technical Production is out of scope — and the quote must say so (15 Aug 2026)

See §4.8. `Section` stays `{VC, OPS, POWER}`. Every quote DTO grows `scope`
(sibling of `incomplete`); issued rows snapshot the statement. No UI in the
slice that adds the field. Export (slice 7) is a checklist transform with zeros
for unplaced lines in those sections only — Technical Production does not appear
as a blank fourth block.

**Test count: 65**, all against the real 217-item seed.
