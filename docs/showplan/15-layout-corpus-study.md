# Layout Corpus Study — 171 real Clockwork AV drawings

> **Date:** 12 Aug 2026 · Source: `LayoutFiltered/FLAT_GROUND`, 171 PDFs, ~600 MB,
> shows from 2022 to 2026 · Machine-readable output: **`design/layout-conventions.json`**
> Head-start Stage 1 and Stage 2 both run — see §5 and §6.
> **Method:** extraction ran on your Mac (poppler was already installed), so only
> ~2 MB of text came back rather than 600 MB of PDFs.

---

## 1. What the corpus is

171 drawings, every one of them **vector with a real text layer** — no scans, no OCR
needed. That single fact removes the hardest and most expensive part of this problem
before it starts (see §5).

| | |
|---|---|
| Authoring tool | **AutoCAD ~100** (2011 → 2024), Illustrator 8, CorelDRAW 5, **Vectorworks 4**, other |
| Sheets | 145 single-page, 22 two-page; **A4 53, A3 34, A0 18, A1 15, A2 12** |
| Shows | Prateek Kuhad, Karan Aujla, Shreya Ghoshal, Def Leppard, Dream Theater, ARTBAT, NH7 Weekender, Zomaland, RRR, YAARI, Utsav, plus convention centres and stadiums |
| Venue types | flat ground, festival grounds, convention halls, indoor stadiums, beach, resort |

Worth noting for its own sake: four of your drawings were authored in **Vectorworks**,
which is the application the Figma reference was modelled on. The UI direction was
closer to your own practice than I credited it for.

## 2. The sheet convention is real and consistent

**82% of drawings put the stage at the top and the audience and gates flowing
downward** (72 of the 88 drawings that carry both a `STAGE` and an `ENTRY` label).
That is a convention worth honouring in the product: a new layout should default to
that orientation, because it is what your team reads fluently.

## 3. Standard footprints — the highest-value finding

Several element types are drawn at **exactly one size, every single time**. These are
not averages; they are conventions, and they belong in the product as package
parameter defaults rather than as fields a salesperson has to fill in.

| Element | Drawn size (ft) | Consistency | Observations |
|---|---|---|---|
| **Food stall** | **10 × 10** | **100%** | 38 |
| **Green room** | **16 × 16** | **100%** | 27 |
| **Stock room** | **16 × 16** | **100%** | 27 |
| **Production room** | **16 × 16** | **100%** | 27 |
| **CCTV room** | **10 × 10** | **100%** | 25 |
| **Coupon counter** | **10 × 10** | **100%** | 7 |
| **VVIP platform** | **40 × 32 × 4** | **100%** | 11 |
| Console | 20 × 16 | 82% | 44 |
| Pagoda | 16 × 16 | 71% | 7 |
| Pyro pit | 60 × 4 × 5 | 68% | 62 |
| Main stage | 60 × 40 × 6 | 67% | 36 (alt: 40 × 32 × 6) |

Two other conventions came out of the same pass. **Green rooms are almost always
specified as "16' × 16' – 4 NOS"** — that exact phrase appears in 27 drawings, so the
default *count* is four, not one. And the riser sizes recur as a small closed set:
`4×8×2`, `6×8×2`, `8×4×4`, `4×4`, `8×8×6`.

Across everything, `10×10` (275 occurrences) and `16×16` (166) dominate. Your yard
evidently works in a 10-foot and 16-foot module, and the product should snap to it.

## 4. Which element goes where, and what implies what

### 4.1 Depth order from the stage

Measuring every label's position relative to that drawing's own stage, then pooling
across 115 drawings, produces a consistent front-to-back ordering:

```
BEHIND / AT THE STAGE   green room (−0.03) · ambulance (−0.05) · merch
AT THE STAGE LINE       pyro · LED · generator · storage
IN THE AUDIENCE AXIS    console · camera · ramp
                        fanzone (+0.05) · VIP (+0.07)
FLANKS                  toilet · bar · food (+0.09 to +0.10)
PERIMETER               exit · frisking · parking (+0.08)
GATE LINE               box office (+0.15) · entry (+0.16)
```

Production sits **stage-right** (Δx +0.10) more often than not — the only element with
a consistent lateral bias.

**Honest caveat:** these are positions of *label text* on a sheet, not element
geometry, and the magnitudes are compressed because labels cluster toward the middle
of a drawing. The *ordering* is trustworthy; the distances are not. Good enough to
seed default placement, not good enough to auto-place.

### 4.2 Implication rules, mined not guessed

The CPQ addendum to `10-head-start-analysis.md` predicted that Phase 2 would need
**selection rules** ("adding a stage implies steps and skirting") and warned against
building a general rule engine. Here are 92 candidate rules derived from what your
team actually draws. The strongest, ranked by lift rather than raw confidence:

| Pair | Lift | Together in |
|---|---|---|
| Tin wall + stock room | 6.84 | 17 |
| Metal railing + tin wall | 6.58 | 25 |
| Pyro pit + stock room | 6.33 | 17 |
| **Frisking + DFMD** | **5.83** | **21** |
| Mojo barricading + metal railing | 5.04 | 23 |
| Frisking + hydration | 3.99 | 17 |

And near-certain implications: `P(EXIT | FRISKING) = 1.00`,
`P(EXIT | DFMD) = 1.00`, `P(ENTRY | VANITY VAN) = 1.00`,
`P(STAGE | PYRO PIT) = 1.00`, `P(CONSOLE | FANZONE) = 0.97`.

**A confound I have to name:** many of the 1.00 confidences are partly "big shows
contain everything". `P(BAR | TIN WALL) = 1.00` reflects that all 25 tin-wall
drawings are large festivals, not that a tin wall implies a bar. **Lift corrects for
this and confidence does not** — so use the lift column, and treat every rule as a
*suggestion to a human*, never an automatic addition. `frisking → DFMD` and
`metal railing ↔ tin wall` survive both tests and are genuinely causal.

### 4.3 Element prevalence

Stage 69% · bar 58% · entry 58% · food 52% · console 51% · exit 46% · toilet 42% ·
LED 40% · green room 35% · camera 33% · production 30% · generator 26% · box office
25% · ramp 25% · parking 23% · lounge 23% · CCTV 22% · vanity van 20% · fanzone 19%.

## 5. Stage 1 — do not build a drawing-recognition pipeline

**The category exists and is mature**: Kreo, Civils.ai, FloorScan, OpenDrawing,
Bluebeam and others do floor-plan recognition and automated takeoff. Their stack is
raster-to-vector conversion, then **U-Net semantic segmentation** and **Mask R-CNN**
instance detection, then intelligent OCR
([Kreo](https://www.kreo.net/news-2d-takeoff/floor-plan-recognition-technologies),
observed 12 Aug 2026).

**None of it applies to you, and that is the finding.** That whole pipeline exists to
recover structure from *images*. Your drawings are vector with text layers, authored
in-house — so `pdftotext` recovered every label from all 171 files in about ninety
seconds, at zero cost and with no model. Buying or building recognition would be
solving a problem you do not have.

Two numbers from that same source are worth keeping for the next time somebody
suggests pointing a vision model at a drawing: general-purpose models scored **12%**
on door counts (GPT-5) and **41%** overall (Gemini 2.5 Pro) on architectural
drawings. Kreo's own position is that full automation is wrong and their workflow is
human-in-the-loop, with experts validating output.

**Recommendation: adapt, don't buy.** Keep the extraction as a small in-house script
over your own vector PDFs. It cost an afternoon and it is exact.
**This becomes wrong** the day you need to ingest a *client's* scanned venue plan —
then the CV pipeline matters, and buying beats building.

## 6. Stage 2 — how to represent a layout, grounded in prior art

**Escalated because** the user asked, and because "retrieve the most similar past
layout to seed a new one" has a real mechanism behind it. Three papers, each read by
an isolated agent.

### THE PATH — Graph2Plan's encoding, LayoutGKN's distance, WAFFLE's text-first rule

**Represent each layout as a graph, normalised to the site — not in absolute
coordinates.** Graph2Plan's encoding transfers almost unchanged: a node per element
carrying *type, size and location*, where location is quantised onto a **5 × 5 grid
over the site boundary** and size is stored as **the ratio of element area to site
area**. Edges carry one attribute — a relative-direction label from a closed
ten-value vocabulary (`left of, right of, above, below, left-above, right-above,
left-below, right-below, inside, outside`). Normalising to the boundary is precisely
what makes a 4-acre festival ground comparable to a convention hall. Their validation
that **"over 93% of rooms can be represented as the intersection between their
bounding boxes and the building boundary"** licenses one axis-aligned box per element
plus clipping — which is what our `Instance` geometry already is.

**Anchor the traversal on the main stage.** Graph2Plan starts its boundary traversal
at the front door; our equivalent is the stage, which §2 shows is a stable anchor in
82% of drawings.

**Measure similarity with normalised graph edit distance, not visual overlap.**
LayoutGKN's architect user study found normalised GED correlates significantly with
human similarity judgement while **IoU shows "almost none"**. That settles the
distance function empirically. And at our scale the learned model is unnecessary:
171 layouts is 14,535 pairs, and their own timing (10K pairs in ~1.8 s) makes brute
force trivial. Their unlearned GraphHopper-kernel baseline plus direct GED is the
transferable path.

**Trust the drawing's text over its geometry.** WAFFLE's pipeline grounds legend keys
to plan regions and reports text-derived metadata accuracy of **89% / 85% / 96%**
against pure-geometry segmentation that manages **doors at 0.099 IoU**. Our own
extraction is the same lesson with the noise removed: text is exact, geometry is
inference. Read labels for *what*, use geometry only for *where* and *how big*.

**First step:** encode the 171 drawings into that graph form and check that GED
retrieval returns a layout a designer agrees is "the closest previous job". Twenty
queries judged by one experienced person is enough to know.

**Load-bearing risk:** all three papers model **enclosed rooms with shared walls**.
Festival elements are free-standing objects on open ground, so "adjacency" has no
natural definition for us. Something has to be chosen — nearest-k, or a distance
threshold in site-normalised units — and that choice is unvalidated territory the
literature does not cover. It is the one thing here that could quietly not work.

**Citations:** [2004.13204](https://arxiv.org/abs/2004.13204) *Graph2Plan* — the
encoding and the training-free retrieval ranking · [2509.03737](https://arxiv.org/abs/2509.03737)
*LayoutGKN* — GED-over-IoU, and why the learned model is unnecessary at our scale ·
[2412.00955](https://arxiv.org/abs/2412.00955) *WAFFLE* — text-first grounding on
heterogeneous real-world plans.

### AVOID — from every paper's limitation, including the rejected ones

- **Train nothing.** Graph2Plan is calibrated on 80K plans, LayoutGKN mines triplets
  over 46K. At 171, neural placement and learned similarity are both untrainable.
- **Do not auto-place.** Graph2Plan needs a post-hoc alignment optimisation because
  box geometry alone does not produce snapped, real-world-valid geometry.
- **Do not use IoU or visual overlap for similarity.** Measured to correlate with
  human judgement almost not at all.
- **Do not expect the literature to handle scale, units or dimensions.** WAFFLE
  detects a scale icon but never reads it; none of the three does unit
  reconciliation — which is most of what a BOQ needs, and is ours to own.
- **Do not read too much into the label positions.** Ordering yes, distances no.

### Runner-up, one line
*ResPlan / GSDiff / ChatHouseDiffusion* — generative floorplan synthesis. Genuinely
impressive and wrong for us: we are not generating layouts, we are helping a
salesperson place elements with good defaults.

## 7. What this changes in the product

| # | Change | Where |
|---|---|---|
| 1 | **Seed package templates with the mined footprints.** 10×10 food stall, 16×16 green room ×4, 20×16 console, 60×40×6 main stage. Seven are 100% consistent — they are defaults, not guesses | package library authoring |
| 2 | **Snap to a 10-ft grid**, with 16 ft as the secondary module | editor, slice 4 |
| 3 | **Default the sheet orientation to stage-at-top** | editor |
| 4 | **Phase 2 selection rules come from `implication_rules`**, ranked by lift, presented as suggestions a human accepts — never auto-added | Phase 2 |
| 5 | **Default placement seeded by the stage-relative depth order** | Phase 2 |
| 6 | **396 unmatched drawing terms are the tag backlog** — the highest-value ones are elements the catalogue is missing entirely (§8) | catalogue |
| 7 | **Audience tier zones are a missing concept.** GOLD, SILVER, PLATINUM, DIAMOND, VVIP, FANZONE appear in 15–27 drawings each and are not items — they are *zones with a ticket tier*. The `Zone` model needs a tier attribute | data model |
| 8 | Layout-similarity retrieval is a **Phase 3+ feature**, and now has a designed path | roadmap |

## 8. Vocabulary gaps — what the catalogue is missing

Matching drawing labels against the 217 items and 2,018 tags, after stripping
drafting boilerplate and dimension suffixes: the catalogue resolves roughly **44%**
of real label usage exactly or by containment. Treat that as a floor rather than a
verdict — artist names, city names and title-block phrases still leak into the
unmatched set, so the true figure is higher, and I would not quote 44% as a
catalogue failure.

The genuine element gaps, ranked by how many drawings use them: **BAR (56)**,
**SOUND / FOH / MOH positions (33)**, **LED (33)**, **FANZONE (27)**,
**TIN WALL (25)**, **STORAGE (25)**, **SFX (25)**, **SMOKING ZONE (25)**,
**KITCHEN (22)**, **CCTV (19)**, **LOUNGE (17)**, **STOCK ROOM (17)**,
**PROD ROOM (17)**, **CCTV ROOM (17)**, **PYRO PIT (15)**, **FAN PIT (11)**,
**MERCH (12)**, **IMAG (12)**.

Several of these are rooms your team draws on nearly every job. Adding them, with the
footprints in §3 as their defaults, is the cheapest catalogue work available.

## 9. Evidence status

**Inspected:** all 171 PDFs (metadata, full text layer, page-1 word bounding boxes);
Kreo's floor-plan recognition article; three arXiv papers in full. All 12 Aug 2026.
**Not inspected:** the drawings' vector geometry itself (only text and its positions),
pages beyond page 1 for the bbox analysis, and the six PDFs whose `pdfinfo` failed.
Community sources not searched.

**Assumptions made visible:**
- **A-13** Label-text position approximates element position. Reasonable for ordering,
  wrong for distance. Do not build placement on the magnitudes.
- **A-14** The mined footprints are current practice, not legacy. The corpus spans
  2022–2026; I did not weight recent drawings more heavily. Worth checking whether
  any convention has changed.
- **A-15** `FLAT_GROUND` is a filtered subset, so conventions here may be
  ground-specific and not transfer to arenas or convention halls.

**This study becomes wrong when:** the yard changes its standard sizes; or you start
ingesting client-supplied scanned plans, at which point §5 inverts and the CV
pipeline becomes worth buying.
