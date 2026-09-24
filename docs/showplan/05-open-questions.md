# Open Questions & Inputs Needed

> Live register. Nothing here is guessed at in the other documents — where a
> decision depends on an unanswered question, the dependent section is marked ⏸.

---

## Blocking — work cannot proceed accurately without these

| ID | Question / input needed | Blocks | Owner | Status |
|---|---|---|---|---|
| **OQ-02** | **Item catalogue sample** — Excel/Sheets export with real column headers (even 50 rows). Need to see: item name, category, unit of measure, rate, any dimension/footprint fields, vendor, notes | Data model, catalogue schema, editor footprint sizing | Joyjeet | ⏳ Requested |
| **OQ-03** | **Client-facing quotation `.xlsx`** with **per-line rate and amount columns**, not a costing sheet. A 17-venue tour workbook (15 Aug 2026) was searched in full: quantity takeoff only — four section costs per venue, no per-line rates or amounts. That file does not unblock export. Slice 7 stays blocked until the quotation template arrives. | Export (F9), slice 7 | Joyjeet | ⏳ Still needed — costing sheet ≠ quotation |
| **OQ-04** | **Pricing & BOQ workflow dump** from the other Cowork session — the finalised pricing model, overhead lines, event metadata fields | Pricing engine (F8), event data model, estimate UI | Joyjeet | ⏳ Promised |

Until OQ-03 lands, slice 7 / F9 stay blocked. **This is deliberate.** The
workbook that arrived is a quantity takeoff, not a quotation; inventing column
layout and correcting it later costs more than waiting. F7 (on-screen BOQ) and
F8 (engine) are no longer blocked on it.

---

## Needed soon — not blocking today

| ID | Question | Affects |
|---|---|---|
| **OQ-01** | **Product name.** "ShowPlan" is my placeholder. Real name? | Branding, repo name, domain |
| ~~OQ-05~~ | ~~Dev team stack~~ — **ANSWERED**: Render + Docker + Google OAuth + env in Render. Captured as an org standard in `ENGINEERING-STANDARDS.md`, ADR-006 | ✅ Resolved |
| ~~OQ-12~~ | ~~Confirm paid Render tiers~~ — **ANSWERED**: **$13/mo** total. Hobby workspace is free *and can run paid services*, so no $25 seat charge is due; Starter instance $7 (no spin-down) + basic-256mb Postgres $6. Free tier rejected: 15-min spin-down with ~1-min cold start is fatal on a live call, and free Postgres expires after 30 days. See `11-deployment-cost-plan.md` | ✅ Resolved |
| ~~OQ-13~~ | ~~Object storage: GCS or R2~~ — **ANSWERED**: **Cloudflare R2.** Free egress (client share links are egress), 10 GB + 1M writes + 10M reads free, S3-compatible so no lock-in. Rule attached: no user file is ever served through the app server — always a presigned R2 URL | ✅ Resolved |
| **OQ-14** | **New Google Cloud project** to be created for this app (standard is one project per application, named `proj-<product-slug>`). Who creates it, and under which billing account/org? | Auth setup |
| ~~OQ-15~~ | ~~Google Workspace domain for the `hd` claim gate~~ — **ANSWERED**: **`clockwork-av.com`** (all company email is on it). Only ID tokens carrying `hd: "clockwork-av.com"` are accepted | ✅ Resolved |
| ~~OQ-16~~ | ~~Hosting domain~~ — **ANSWERED**: CNAME a subdomain of `clockwork-av.com` to the Render host, exactly as `quotes.clockwork-av.com` is routed today. Render custom domains and TLS are free on every plan, so this adds nothing to the $13/mo. Suggested: `layout.clockwork-av.com` or `plan.clockwork-av.com` | ✅ Resolved |
| **OQ-06** | **Company Google Workspace domain** — to restrict sign-in during the internal phase | F1.4 |
| **OQ-07** | **Sales team size** — how many concurrent users at MVP? | Capacity planning, free-tier headroom |
| **OQ-08** | **Typical venue size and element count** — a 50-element wedding and a 800-element festival are different performance problems | Performance budget (currently assumed 500 elements) |
| **OQ-09** | **Do layouts need approval/sign-off internally** before going to a client? | Whether v1.0 workflow is needed sooner |
| **OQ-10** | **Rate confidentiality** — can production staff see rates, or sales only? | RLS policy design |
| **OQ-11** | **Existing venue map sources** — do you already hold maps for venues you use often? A reusable venue library could be high value | Possible v0.2 feature |

---

## Assumptions made in the absence of answers

Each of these is a guess. Flag any that are wrong — several are cheap to change
now and expensive later.

| ID | Assumption | If wrong |
|---|---|---|
| A-01 | Metric (m/sqm) as the base unit, INR currency, per-item units as defined in your sheet | Unit conversion layer changes |
| A-02 | Editor must stay smooth at ~500 elements | Rendering strategy may need virtualisation |
| A-03 | Base maps under 25 MB | Storage tier and rasterisation approach |
| A-04 | Internal users are all on the company Google Workspace | Auth approach |
| A-05 | One venue map per layout (not multi-level/multi-floor sites) | **Notable** — multi-floor venues need a floor concept in the data model |
| A-06 | Client viewers should *not* see rates by default | Sharing permission model |
| A-07 | BOQ lines can exist without a corresponding placed element (labour, transport) | BOQ derivation logic |
| A-08 | Estimates are indicative, never contractual | Legal wording, audit requirements |

**A-05 is worth an early answer** — multi-floor support is much cheaper to design
in now than to retrofit.

---

## Accepted technical debt (MVP)

Deliberate shortcuts, recorded so the incoming team can distinguish a decision
from an oversight.

| Debt | Why accepted | Repay by |
|---|---|---|
| No real-time collaboration; last-write-wins | Multi-week subsystem, low MVP value | v2.0 if demand appears |
| Canvas editing not keyboard/screen-reader accessible | Inherent to canvas editors; would need a parallel DOM interface | Document as a known limitation; revisit if required |
| Catalogue seeded from a spreadsheet import, no admin CRUD UI | Faster; catalogue changes are infrequent at MVP | v0.2 |
| Single environment for preview and dev database | Cost | v1.0 |
| Asset pipeline for 3D models left mid-run (part-written `public/assets`) | 3D deprioritised entirely | Re-run one command when 3D returns in v2.0 |
