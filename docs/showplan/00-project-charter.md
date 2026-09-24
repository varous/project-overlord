# Project Charter — ShowPlan *(working title)*

> **Status:** Draft v0.1 · **Owner:** Joyjeet Panday · **Last updated:** 11 Aug 2026
> **Working title.** "ShowPlan" is a placeholder. See `05-open-questions.md` → OQ-01.

---

## 1. Problem

Show and event layouts today exist in three places: someone's head, a static
CAD/SketchUp drawing produced days later by a designer, and a BOQ spreadsheet
built separately by hand. These three artefacts drift apart.

The commercial consequence is specific and measurable. When a salesperson is on
a call with a client, they cannot show the client what their event will look
like, and they cannot give a number. The client's idea is described verbally,
written down, passed to a designer, drawn, priced by someone else, and returned
days later — by which point the client has often gone cold or gone elsewhere.

## 2. Opportunity

Collapse "describe → draw → quantify → price" from days into the length of a
single sales call. One artefact — the layout — becomes the source of truth for
both the visual and the commercials, because the BOQ is *derived* from what was
placed rather than re-entered by hand.

## 3. Product in one sentence

A browser-based visual planner where you import a venue map, lay out the entire
show footprint from a real item catalogue, and export a BOQ and price estimate
generated directly from what you placed.

## 4. Goals

| # | Goal | How we know it worked |
|---|---|---|
| G1 | Build a complete show layout live during a sales call | A salesperson can go from blank venue map to exported BOQ in **under 15 minutes**, unaided |
| G2 | Eliminate manual BOQ re-entry | BOQ is generated from the layout with **zero manual transcription** of quantities |
| G3 | Quantities are trustworthy | Exported quantities match a manually-checked BOQ within an agreed tolerance |
| G4 | Output is client-ready | Export reproduces the existing company BOQ template without reformatting |
| G5 | Handover-ready codebase | An external dev team is productive within **one week**, with no rewrite |

## 5. Non-goals (explicitly out of scope for MVP)

- **3D visualisation.** 2D only. 3D adds nothing to a BOQ and slows the build.
- **CAD-grade drafting.** This is not AutoCAD. Approximation good enough to
  quantify and to communicate intent.
- **Final contractual quotations.** The output is a *rough estimate* to support a
  sales conversation, not a binding quote.
- **Technical Production (`TECH`).** We quote Venue Construction, Operations
  and Power only. The `Section` enum does not gain a fourth member. A real
  17-venue tour workbook had Technical Production at 56% of
  the money — and none of those items exist in our catalogue. A quote that
  omitted that silently would be dangerous; every quote carries an explicit
  exclusion and the internal warning "Not a show total. Technical production
  is excluded." See `01-prd.md` §F7.7 and `13` §4.8.
- **Inventory / availability checking.** No stock levels, no vendor booking.
- **Real-time multi-user co-editing.** Sharing and roles yes; live cursors no.
- **Mobile-first design.** Desktop/laptop is the working context.

## 6. Users

| Persona | Role in the product | Primary need |
|---|---|---|
| **Sales lead** *(primary)* | Builds the layout live on a client call | Speed, looks impressive when screen-shared, instant BOQ + number |
| **Production manager** | Refines the sales concept into an executable plan | Accuracy, real dimensions, ability to correct and version |
| **Client** *(read-only)* | Views the layout they were shown | A link that works, no login friction, looks professional |

## 7. Success metrics

**Leading (measurable from week one of internal use)**
- Time from new project → exported BOQ (target: < 15 min)
- % of sales calls where a layout was built live (target: > 50% within a month)
- Number of layouts created per week

**Lagging (measurable over a quarter)**
- Quote turnaround time, before vs after
- Win rate on deals where a live layout was used vs not
- Hours of designer/estimator time saved per deal

## 8. Constraints

- **Timeline:** 1 week to a usable internal MVP.
- **Build method:** Cursor (AI-assisted), single developer initially.
- **Cost:** low running cost. Note: Render's free tiers are unusable here — free
  web services sleep (~1 min cold start) and free Postgres *expires after 30
  days*. Lowest paid tiers are required. See ADR-006.
- **Hosting:** Render, Docker-containerised (organisation standard).
- **Handover:** must transfer cleanly to an external dev team. Their platform is
  known (Render + Docker + Google OAuth, see ADR-006); their preferred language
  and framework are not, which is what drives the domain/adapter split (ADR-002).

## 9. Phasing

| Phase | Audience | Intent |
|---|---|---|
| **MVP** | Internal sales team | Prove the sales-call workflow end to end |
| **v0.2** | Internal sales + production | Accuracy, versioning, catalogue completeness |
| **v1.0** | Clients (read-only links) | Presentation quality, sharing, reliability |
| **v2.0** | External / commercial | Multi-tenancy, billing, integrations |

Architected multi-tenant from day one so commercialisation is configuration, not
a rewrite — even though MVP is internal-only.

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Item catalogue is incomplete or inconsistent | BOQ is wrong → tool is not trusted → abandoned | Treat catalogue quality as a first-class workstream, not a data-entry afterthought |
| Scale calibration is wrong | Every area/length quantity is wrong, silently | Always show the derived scale ("1 px = 0.12 m") and a known-length sanity check |
| Pricing logic leaks into the UI as gospel | Sales quotes a number the business can't honour | Label everything "indicative estimate"; keep rates server-side; log every estimate |
| Scope creep from "just add 3D" | Misses the 1-week window | 3D is explicitly a post-MVP roadmap item with its own phase |
| Unknown handover team's stack | Rewrite risk | Framework-agnostic domain layer + swappable data adapter (ADR-002) |

## 11. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 11 Aug 2026 | 2D only for MVP | 3D adds no BOQ value and endangers the timeline |
| 11 Aug 2026 | Internal-first, multi-tenant-ready | Commercialising later must not require a rewrite |
| 11 Aug 2026 | Sharing = link + roles, no live co-editing | Live co-editing is a multi-week subsystem |
| 11 Aug 2026 | Pricing/BOQ spec deferred pending existing workflow dump | Do not invent the commercial core |
| 12 Aug 2026 | Render + Docker + Google OAuth adopted as org standard; supersedes Vercel + Supabase | Match the dev team's existing platform (ADR-006) |
| 12 Aug 2026 | Paid Render tiers required | Free web service sleeps; free Postgres expires after 30 days |
| 12 Aug 2026 | One Google Cloud project per application | Credential, quota and IAM isolation between products |
