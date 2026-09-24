# arXiv Prior Art — Stage 2

> **Date:** 12 Aug 2026 · Head-start Stage 2, run on explicit request for two
> components. Six papers, each read by an **isolated** agent that saw only that
> paper and the build problem — so no reader could summarise the set instead of
> grounding in its own source.
> **Method note:** `export.arxiv.org`'s API is disallowed by robots for this
> session's fetcher, so candidates were found via domain-restricted search on
> `arxiv.org` and each paper was read from its `/pdf/` URL. Every id, figure and
> quotation below came out of a real fetch. Nothing is reconstructed from memory.

---

## Component A — Crowd flow, egress and sizing advice

**Why escalated:** Phase 4 wants the product to advise how many toilets, exits and
entry lanes an event needs from its attendance figure, and to flag unsafe layouts.
Liability is real and the naive version is wrong in ways that matter.

**Searched:** `physics.soc-ph`, `cs.MA` · terms: pedestrian evacuation time, crowd
egress capacity, entrance queueing bottleneck, pedestrian flow fundamental diagram.
**Read:** 4 papers.

### The finding, which is not what I went looking for

**All four papers independently decline to answer the sizing question, and three of
them name the same alternative.** The arXiv literature on crowds is a physics-of-
motion literature: it measures densities, speeds, flows and failure modes. It does
not contain design schedules, and its authors say so.

The most senior reader put it plainest: the canonical Helbing–Johansson review
supplies crowd-density and crowd-pressure danger thresholds *"but it supplies
nothing for the quantity-advisor (toilets, exits, lanes, queue space), which will
need occupancy codes such as NFPA 101 / IBC, the UK Purple Guide / Green Guide and
Fruin level-of-service data instead."*

That is the single most useful sentence this whole exercise produced, because it
kills a plan I would otherwise have half-built: **deriving sizing rules from
research papers.** You cannot. Sizing is a regulatory question and the answer lives
in the licensing standard for the jurisdiction. What the research is genuinely good
for is the *second* layer — telling you a layout that satisfies the schedule is
still dangerous.

### THE PATH — a two-layer advisor, and only the second layer is research-based

**Layer 1 · Sizing — encode the standard as data, not as code.**
Toilet, exit, lane and queue-area schedules come from the applicable licensing
standard (for India, NBC 2016 plus the local police and fire licensing conditions;
internationally, NFPA 101 / IBC occupant-load tables, or the UK Purple Guide).
Model it exactly like `day_curves`: admin-editable versioned rows, keyed by
attendance band and facility type, with the standard's name and edition stored
alongside every row. Then a recommendation can always answer *"because clause X of
edition Y says so"*, which is the only defensible form for a number that carries
liability. **No paper contributes to this layer.**

**Layer 2 · Safety flags — three static checks, computed from geometry we already have.**
No simulation. Each check is arithmetic over the layout plus the attendance figure:

1. **Zone density.** `expected persons / usable area`, per zone. Green below
   **3 persons/m²**, amber **3–4**, red above **4** — from the Jamarat video study,
   which recommends *"maximum safe average density is 3–4 persons/m²"* against
   observed local densities *"up to 10 persons/m² and higher"*.
2. **Egress and lane width.** Required width = throughput ÷ design specific flow.
   Anchor the design flow at **1.2–1.3 persons/(m·s)** for ordinary movement, and
   **de-rate to 0.6–1.0** when the crowd is encumbered (rain, chairs, bags) — the
   umbrella experiments measured *"1.317 to 0.694 ped/m·s"* unencumbered against
   *"0.992 to 0.622 ped/m·s"* with umbrellas, a penalty of *"about 0.3 ped/m·s"*.
   Apply the Jamarat study's recommended **30–40% capacity safety margin**, and its
   rule that outflow ≥ inflow at every bottleneck.
3. **Gate funnel geometry.** Constrain the approach corridor to roughly **2–2.5×
   the gate width** and flag layouts where an open plaza feeds a narrow gate. The
   entrance experiments found *"the transition takes place between a corridor width
   of 1.2 m and 2.3 m"* for a 0.5 m gate — below it, orderly queuing at ~5/m²;
   above it, pushing with densities *"partly more than 10 m⁻²"* 1–2 m upstream.

**Deliberately NOT building the clever one.** Crowd pressure — density × velocity
variance, with the *"0.02/s²"* turbulence threshold that preceded the Jamarat
disaster by about ten minutes — is the most scientifically interesting number
found, and we should not implement it. It requires a velocity field, which requires
an agent-based simulation, and the same review concedes its own parameters are
under-identified: *"broad range of parameter combinations of A and B which perform
almost equally well."* A safety indicator resting on an under-identified simulation
is worse than no indicator, because it will be believed.

**First concrete step:** get the licensing conditions for your three most common
venues and tabulate the facility schedules they actually impose. That is Layer 1,
it is a data-entry task, and it is worth more than any code I could write for this
phase.

**Load-bearing risk:** presenting research thresholds as compliance. They are not.
Layer 2 must be labelled as advisory indicators derived from published research,
with citations, and must never claim a layout is compliant.

**Citations:** [1309.1609](https://arxiv.org/abs/1309.1609) *Pedestrian, Crowd, and
Evacuation Dynamics* (2013) — density ceiling ~6/m², crowd-pressure definition; the
reason we are not building it · [0810.4590](https://arxiv.org/abs/0810.4590)
*From Crowd Dynamics to Crowd Safety* (2008) — 3–4/m² safe density, 0.8 ped/(m·s)
critical flow, 30–40% margin, outflow ≥ inflow · [1810.07424](https://arxiv.org/abs/1810.07424)
*Crowding and Queuing in Entrance Scenarios* (2018) — the gate funnel rule ·
[1606.03434](https://arxiv.org/abs/1606.03434) *Impact of holding umbrella on uni-
and bi-directional pedestrian flow* (2016) — specific-flow anchors and the
encumbrance de-rating.

### AVOID — built from every paper's stated limitation, including the rejected one

- **Do not quote the Hajj numbers as a design standard.** That paper warns its
  results are *"not directly transferable to Western European conditions and vice
  versa"*; its measured free walking speed was **0.60 m/s** against 1.34 m/s in the
  wider literature. Different body size, age mix and spacing norms.
- **Do not build an agent-based crowd simulation.** Under-identified parameters,
  and the thresholds are *"depend on measurement radius R"* — they are not portable
  constants.
- **Do not extrapolate the umbrella flow figures upward.** That experiment never
  exceeded **1.51 ped/m²**, far below the 3–6/m² regime where crushes happen, and
  fitted no fundamental-diagram curve — so interpolate between reported points and
  do not evaluate a formula you invented.
- **Do not treat 1.2 m / 2.3 m as a scaling law.** One 0.5 m gate, no repetitions,
  and participant numbers varied uncontrolled; the authors state *"the influence of
  the individual factors cannot be quantified, based on the data at hand."*
- **Do not let the tool imply compliance**, ever. Advisory indicators only.

### Runner-up clusters, one line each

*Evacuation-time simulation* — a whole family (cellular automata, social force,
hybrid) exists, but a review of it concludes *"it is yet necessary to create models
that precisely simulate people evacuation time"*; not a foundation for a sales tool.
*Queueing theory for gate service rates* — genuinely applicable, but the arXiv work
found was airports and ports, and gate throughput is better measured from your own
past events than modelled.

---

## Component B — Natural-language item mapping

**Why escalated:** turning *"three entry gates and a 125 kVA drop"* into package
instances against 217 items and a 2,018-tag synonym corpus.

**Searched:** `cs.CL`, `cs.IR` · terms: entity linking short noisy text, product
catalogue matching, dense entity retrieval, synonym normalisation.
**Read:** 3 papers.

### The finding

The literature is unanimous in a different way here: **every technique that beats
naive matching in these papers is scale-driven, and we have no scale.** The Amazon
brand-linking system trained on *"806,972 strongly-labeled query-brand pairs"* plus
1.3M weakly-labelled examples over ~600,000 brands. BLINK's bi-encoder trained on
*"A total of 9M examples"* over 5.9M entities — and its "zero-shot" means zero
examples of the *test* entities, not zero training. At 217 items with no query log,
none of that lift is available.

But all three converge on an **architecture** that needs no training data at all,
and one of them supplies the number that settles the design: the Amazon paper
measured a false-alarm rate of **1.177% for exact lexical match against 6.550% for
the learned classifier.** Going learned would cost precision. On a document that
becomes a client quote, precision is the whole game.

### THE PATH — lexical-first, LLM only where the literature admits a gap

Five stages, in this order:

1. **Segment and extract quantities with an LLM.** This is the one place a model
   earns its keep, and it is precisely the part the literature leaves open: the
   Amazon paper *excluded* multi-entity queries from its precision and recall
   figures (15.5% of its test set) and notes it *"cannot resolve over 50% of
   multi-entity ambiguities"*; BLINK assumes gold mentions are already identified;
   Pangloss's segmenter breaks on glued tokens — *"3 entry gates n a 125kva drop"*
   is exactly its failure case. So: LLM splits the utterance into (quantity, phrase)
   pairs and does nothing else.
2. **Generate candidates from the tags, which ARE the dictionary.** Both production
   systems build a surface-form → entity lookup from anchor text; our 2,018
   curated synonyms are a better version of the same thing, hand-made by the people
   who use the words. Normalised exact match first, then fuzzy: **Jaro-Winkler**
   (rewards prefix agreement, which is what abbreviations like `kva` and `gen` look
   like) plus **Damerau-Levenshtein** (adds transposition, so `enrty` costs one edit,
   not two). Both named explicitly in Pangloss's feature list.
3. **Disambiguate with a category filter.** Amazon's product-type filter, reproduced
   for free: every item already carries `category` and `section`
   (`VC` | `OPS` | `POWER` — Venue Construction, Operations, Power),
   so *"riser"* resolves within the inferred category rather than across all 217.
4. **Refuse as a separate decision, not a score cutoff.** Pangloss trains a
   dedicated abstain model *"to predict whether a candidate can be meaningfully
   linked"*; Amazon adds an explicit `NO_ENTITY` class. Ours is simpler: an
   unresolved span stays unresolved and is shown to the user. **Never auto-add on
   low confidence.** A wrong item silently on a quote is far worse than a phrase the
   salesperson has to click.
5. **Track the four metrics** the Amazon paper uses — recall, precision, coverage,
   false-alarm rate. FAR is the one that tells us when to reconsider.

**Runner-up, and the upgrade path if step 2 disappoints:** dense retrieval as a
*second* candidate generator behind the lexical one, using an off-the-shelf sentence
embedder rather than a trained bi-encoder, with entity documents built in BLINK's
format — `title [SEP] synonyms`, which is directly borrowable. Dense beat BM25
decisively on unseen colloquial surface forms (recall@64 of **82.06%** against
**69.13%** on the zero-shot test set), so it is the right escalation. It is not the
right start, because at 217 items retrieval is exhaustive anyway and the FAR cost is
real.

**First concrete step, and it is a measurement, not code:** collect **20 real
phrasings** from your sales team and check what fraction resolves against the 2,018
tags as they stand. That single number decides everything downstream — and it
mirrors the hardest limitation in the whole component (below). Expect the answer to
be "good enough", in which case naive matching ships and the research stays parked.

**Load-bearing risk — recall is capped at candidate generation.** Pangloss states it
outright: the system *"cannot improve recall beyond candidate generation phase, only
precision via abstention model."* A slang term absent from the 2,018 tags is
permanently invisible, however good the ranker. **Mitigation, and build it from day
one: log every unresolved span.** That log is the tag backlog, and it makes the
corpus improve by being used — which is the only sustainable answer.

**Citations:** [2502.01555](https://arxiv.org/abs/2502.01555) *Query Brand Entity
Linking in E-Commerce Search* (2025) — dictionary-first architecture, category
filter, precision-first fusion, the 1.177% vs 6.550% FAR comparison ·
[1911.03814](https://arxiv.org/abs/1911.03814) *Scalable Zero-shot Entity Linking
with Dense Entity Retrieval* (2019) — the entity-document format and the dense-vs-
lexical evidence; the upgrade path · [1807.06036](https://arxiv.org/abs/1807.06036)
*Pangloss* (2018) — rank-then-abstain, Jaro-Winkler + Damerau-Levenshtein, and the
recall-cap warning.

### AVOID

- **Train nothing.** Every learned component in these papers needs 10⁵–10⁶ labelled
  examples. We have 217 items and no query log.
- **Do not make dense retrieval the primary matcher.** It raises the false-alarm
  rate, and a false confident link on a quote is the failure that loses trust.
- **Do not expect link-probability or popularity priors to work.** They do most of
  the disambiguation in both production systems and both derive them from
  Wikipedia-scale statistics we will never have.
- **Do not look to this literature for quantity extraction.** None of the three
  handles it; all three assume the mention is the whole problem.
- **Do not tune on clean text.** Pangloss found news-corpus tuning *"didn't
  generalize initially to 'loosely-formatted content'"* — calibrate on how your
  sales team actually types.
- **No thresholds are published in any of these papers.** Calibrate your own and
  write down what you chose.

---

## What changes in the plan

| # | Change | Where |
|---|---|---|
| 1 | Phase 4 splits into **Layer 1 sizing (standards-as-data)** and **Layer 2 safety flags (research-based, advisory only)** | `09-phased-plan.md` |
| 2 | Sizing schedules are **admin-editable versioned rows**, modelled on `day_curves`, each carrying the standard and edition it came from | Phase 4 data model |
| 3 | **Crowd pressure / turbulence is explicitly out of scope.** It needs a simulation whose parameters the literature says are under-identified | `09-phased-plan.md` |
| 4 | NL mapping is **lexical-first with a separate refusal step**; an LLM does span-and-quantity extraction only | roadmap |
| 5 | **Log every unresolved span from day one.** It is the tag backlog and the only way recall improves | build note |
| 6 | Two measurements gate both components, and both are cheap: the venue licensing schedules, and 20 real sales phrasings | next actions |

**Nothing in the current build changes.** No architectural revision, no schema
change, no correction to the engine. Both components are future phases, and the
research's main contribution was to stop one of them being built the wrong way.
