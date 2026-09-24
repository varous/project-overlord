# Deployment Cost Plan — how close to free can we get?

> **Head-start Stage 1** run on hosting procurement · **Stage 2 not applicable**
> (this is a buying decision, not a technical mechanism — no prior-art question exists)
> **All prices observed 12 Aug 2026** from vendor pricing pages and docs.
> Supersedes the cost table in `02-architecture-and-stack.md` and closes **OQ-12** and **OQ-13**.

---

## The answer up front

**Genuinely free is achievable — $0/month — but it costs you a day of setup and
ongoing operational responsibility.** The interesting finding is that the *nearly*
free option is so cheap that free stops being worth it:

| Option | Monthly | Ops burden | Cold starts | Standard-compliant |
|---|---|---|---|---|
| A · All-free (Oracle + Neon + R2) | **$0** | You run a Linux VM | none | ✗ leaves Render |
| B · **Render Hobby + paid instance** | **$13** | none | none | ✓ |
| C · Render free tier | $0 | none | **fatal** | ✓ |
| D · Original plan (as documented) | $40–75 | none | none | ✓ |

**Recommendation: Option B, $13/month.** It honours your Render + Docker standard,
has zero cold starts, zero operational burden, no database expiry, and costs less
than a third of your $40–50 ceiling — leaving real headroom for Phases 1–2 without
another procurement conversation.

Option A saves $13/month and costs you a day now plus TLS renewals, OS patching and
your own Postgres backups forever. At your stage that trade is bad. It is documented
below anyway, because you asked how free it can be, and because it is the right
answer if the $13 is genuinely unavailable.

**The single biggest saving is not the host — it is $0 storage.** Switching object
storage from GCS to Cloudflare R2 removes egress billing entirely, and egress was
the line item that would have scaled fastest once clients started opening share
links. That change is free, uncontroversial, and should happen regardless of which
option you pick.

---

## Blocker analysis — why the pure-free path is hard

I went looking for a free tier that runs a Docker container always-on. Here is
every blocker found, and what it costs to solve.

### Blocker 1 — Free web hosting sleeps. This one is disqualifying.

**Render free tier** ([render.com/docs/free](https://render.com/docs/free)): free web
services **spin down after 15 minutes without traffic**, and reactivation "takes
about one minute". Also: 750 free instance-hours per workspace per month, no
persistent disk, no shell access, single instance only.

A one-minute cold start is not a minor annoyance for this product — it is the
product's worst possible failure. The entire premise is a salesperson opening the tool
*during a live client call*. A blank loading screen for sixty seconds while a client
waits is worse than not having the tool at all, because the salesperson will never
open it again.

This blocker rules out every scale-to-zero free tier for the *app server*: Render
free, Koyeb's (compute has no free tier at all — Pro starts at **$29/mo** with $10
included compute), and anything else that trades availability for cost.

**Cost to solve:** $7/month on Render (Starter, 512 MB, 0.5 CPU, always on), or
**$1.94–3.19/month on Fly.io** (shared-cpu-1x at 256 MB / 512 MB, no plan fee, no
minimum charge), or **$0 on an Oracle always-free VM** that you operate yourself.

### Blocker 2 — Free Postgres either dies or sleeps

| Provider | Free allowance | The catch |
|---|---|---|
| **Render** | 1 GB, one DB per workspace | **Expires 30 days after creation.** 14-day grace period, then deleted. No backups, no pooling |
| **Neon** | 0.5 GB/project, 100 CU-hours, 10 branches | Scale-to-zero after **5 minutes** idle; 5 GB egress |
| **Supabase** | 500 MB DB, 1 GB file storage, 5 GB egress, 50k MAU | Projects **paused after 1 week of inactivity**; 2 active projects |

Render's free database is unusable for anything real — a 30-day expiry means your
production data has a death date. Neon and Supabase are both genuinely viable: a
database cold start is measured in **seconds, not a minute**, and it happens on the
first query while the app shell is already rendering, so the salesperson sees a
loading spinner inside an app that opened instantly. That is a completely different
user experience from Blocker 1 and is acceptable.

**Verdict:** Neon free is the better of the two for us — 0.5 GB is plenty when base
maps live in R2 and only their keys live in Postgres, and its scale-to-zero threshold
being 5 minutes rather than a week means it wakes predictably rather than needing a
manual unpause after a quiet holiday.

**Cost to solve properly:** $6/month on Render (basic-256mb, with backups), or $0 on
Neon accepting a few seconds of first-query latency, or $0 running Postgres in Docker
on your own VM and owning the backups.

### Blocker 3 — Object storage egress. Already solved, and free.

**Cloudflare R2** ([pricing](https://developers.cloudflare.com/r2/pricing/)):
$0.015/GB-month storage, Class A (writes) $4.50/M, Class B (reads) $0.36/M,
**egress free**, free tier **10 GB-month + 1M Class A + 10M Class B**.

Venue maps, rendered layout PDFs and Excel exports are write-once, read-many. Every
client opening a share link is egress. On GCS that is a bill that grows with your
success; on R2 it is zero, forever, and 10 GB of free storage covers well past the
MVP. **This is not a blocker. It is a free win. Take it.**

### Blocker 4 — Regional egress, if you leave Cloudflare

Worth knowing before picking a host: **Fly.io charges $0.12/GB egress from India**
and $0.05/GB for private cross-region transfer there, against $0.02/GB in North
America and Europe. Your users and clients are in India. If heavy files were served
through the app container from a Mumbai region, that line item would be the surprise
on the bill.

**Mitigation, and it is the same mitigation as Blocker 3:** never serve a base map, a
PDF or an Excel file through the app server. Issue a presigned R2 URL and let
Cloudflare serve the bytes with free egress. The app server then only ever moves JSON,
which keeps it inside Render's 5 GB Hobby bandwidth allowance too.

### Blocker 5 — Things that turn out not to cost anything at all

Worth stating explicitly so no one budgets for them:

- **Authentication is free.** Google OAuth via Google Cloud Console has no charge for
  sign-in, and `openid-client` plus a `sessions` table is ~150 lines of our own code.
  Supabase's 50k free monthly active users is a real offer but buys us nothing we need
  and would couple auth to a vendor — `06-stack-review.md` finding #4 argued against
  exactly that coupling for Auth.js, and the argument doesn't change because the vendor
  changed.
- **Error tracking** — Sentry's free developer tier covers our volume many times over.
- **CI** — GitHub Actions free minutes are ample for one small repo.
- **The 3D asset work** is already done and sitting in this repo; it costs storage, not
  compute, and not until Phase 6.

The only unavoidable non-zero cost in the entire stack is a **domain name**, roughly
$10–15/year.

---

## Option A — the genuinely free build ($0/month)

For completeness, since you asked how free it can be.

| Component | Service | Free allowance (verified 12 Aug 2026) |
|---|---|---|
| App server | **Oracle Cloud Always Free**, Ampere A1 ARM | 1,500 OCPU-hours + 9,000 GB-hours per month = **2 OCPUs / 12 GB RAM always on**; 200 GB block volume; **10 TB/month outbound** |
| Database | Postgres 16 in Docker on the same VM | no limit but your own backups |
| Object storage | Cloudflare R2 | 10 GB + free egress |
| TLS / reverse proxy | Caddy on the VM | automatic Let's Encrypt |
| Auth, CI, errors | Google OAuth · GitHub Actions · Sentry free | — |

Two OCPUs and 12 GB of RAM always-on with 10 TB of monthly egress is, on paper, a
better machine than anything in Option B or D — and Oracle has Mumbai and Hyderabad
regions, so latency is good. It is a real offer, not a trick.

**What it actually costs you, in things that aren't money:**

- You own the operating system. Patching, the firewall, Docker upgrades, disk
  monitoring, log rotation.
- **You own Postgres backups.** This is the one that ends badly if neglected —
  `pg_dump` to R2 on a cron, tested by actually restoring it once, or the free
  database is a liability rather than an asset.
- Ampere A1 capacity is intermittently unavailable in popular regions; provisioning
  can take several attempts.
- Oracle's own FAQ warns that **"accounts left idle for 30 days or more may be deemed
  abandoned and become eligible for suspension or termination."** Daily internal use
  makes this moot, but a quiet quarter is a risk to your production host.
- No managed deploy pipeline. You build the container in CI and pull it on the VM.
- Your ARM VM means ARM container builds — fine, but a second thing to get right, and
  it interacts with the `node:22-slim` decision from `06-stack-review.md`.

**Where this becomes the right answer:** if the $13 is genuinely unavailable, or if you
later want a cheap always-on box for background jobs, PDF rasterisation or the Phase 6
asset pipeline. Twelve gigabytes of free RAM is a genuinely useful thing to have
around. My honest read is that it is the right *second* machine and the wrong *first*
one.

---

## Option B — the recommendation ($13/month)

| Component | Plan | Price |
|---|---|---|
| Render workspace | **Hobby** — up to 25 services, 5 GB bandwidth, 500 build min | **$0** |
| Web service | **Starter** — 512 MB, 0.5 CPU, always on, no spin-down | **$7** |
| Postgres | **basic-256mb** — includes backups | **$6** |
| Object storage | Cloudflare R2 | **$0** (inside free tier) |
| Auth · CI · errors | Google OAuth · GitHub Actions · Sentry free | **$0** |
| | **Total** | **$13/mo** |

The key realisation that makes this cheap: **the Hobby workspace is free and can run
paid services.** Render's $25 Pro workspace buys team collaboration features and
unlimited services — and your eight sales users are users *of the app*, not members of
your Render workspace. Only developers need Render access, and right now that is one
person. So the $25 seat charge assumed in the original plan is simply not due yet.

**What you get over Option A:** managed deploys from git, managed Postgres with
backups you didn't configure, no OS to patch, and — not a small thing — you stay
inside your own `ENGINEERING-STANDARDS.md` (Render, Docker, env vars in Render
Environment), so nothing about the eventual dev-team handover needs re-explaining.

**Known limits to watch, with the trigger for acting on each:**

| Limit | Trigger to upgrade | Cost |
|---|---|---|
| 512 MB RAM on Starter | server-side PDF rasterisation of a large venue map OOMs | Standard, $25 (2 GB) — or keep rasterisation client-side, which is the current design |
| 5 GB/mo Hobby bandwidth | only reachable if you serve files through the app instead of R2 | Pro workspace $25 (25 GB) |
| 256 MB Postgres | real layouts accumulate — expect several months | basic-1gb, $19 (+$13) |
| 500 build minutes | frequent deploys of a growing image | Pro workspace $25 (1K min) |
| Single instance | not a concern until external users exist | Phase 6 problem |

---

## The escalation ladder, capped at your ceiling

Spend nothing until a named trigger fires. In order:

| Step | Trigger | Add | Running total |
|---|---|---|---|
| 0 | — | Option B as above | **$13** |
| 1 | Postgres nears 256 MB | basic-1gb | **$26** |
| 2 | PDF rasterisation needs to move server-side | Standard instance replaces Starter | **$44** |
| 3 | A second developer, or the dev team, joins | Render Pro workspace | *$69 — exceeds ceiling, decide then* |

Steps 0–2 all sit inside your $40–50 ceiling and carry you through Phase 1 and most of
Phase 2. Step 3 is not an infrastructure decision at all — it arrives with a hiring
decision, and a team large enough to need seats is a team large enough to justify $25.

**Deliberately not bought, and why:** GCS (R2 is free and better here — **OQ-13
closed in favour of R2**); Render Pro workspace (buys seats you don't need yet — **OQ-12
answered: no paid tiers required for the MVP beyond $13**); Redis (Render's free
instance loses data on restart and we have no cache requirement); background job
workers (`06-stack-review.md` finding #11 says note it, don't build it); Supabase or
any auth vendor (Google OAuth is free and un-coupled).

---

## What I would change in the existing docs

1. **`02-architecture-and-stack.md`** — ADR-006: object storage becomes **Cloudflare
   R2**, not GCS. Add the rule that *no user file is ever served through the app
   server* — always a presigned R2 URL. That single rule protects the bandwidth
   allowance, the egress bill and the request timeouts at once.
2. **`09-phased-plan.md`** — replace the running-cost table: Phase 0 **$13**
   (was ~$6, which assumed the free Postgres that expires), Phases 1–2 **$13–26**
   (was $40–75), Phases 3–5 **$44–100** (was $200–350, which assumed GCS egress and
   two Pro instances earlier than needed).
3. **`05-open-questions.md`** — close **OQ-12** and **OQ-13**.
4. **`infra/render.yaml`** — while it's being fixed for the `preDeployCommand` defect
   anyway, set the plans explicitly to `starter` and `basic-256mb` so nobody
   accidentally provisions a free Postgres with a 30-day fuse.

---

## Evidence status

**Inspected 12 Aug 2026:** [Render free-tier docs](https://render.com/docs/free) ·
[Render pricing](https://render.com/pricing) · [Neon pricing](https://neon.com/pricing) ·
[Supabase pricing](https://supabase.com/pricing) · [Fly.io pricing](https://fly.io/docs/about/pricing/) ·
[Koyeb pricing](https://www.koyeb.com/pricing) · [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)
and its [Always Free resource limits doc](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) ·
[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).

**Not verified — do not quote me on these:** Hetzner Cloud plan prices (their page
renders figures via a calculator I couldn't read; note that Hetzner has no India
region — nearest is Singapore); exact Neon and Supabase resume latency in
milliseconds; whether Ampere A1 capacity is currently available in Mumbai or
Hyderabad, which you can only find out by trying to provision one.

**Community sources not searched** (no one available to ask, per the skill's
protocol). The one place they would genuinely help is real-world reports of Oracle
Always Free instance reclamation — worth ten minutes on Reddit *before* you would ever
put production data on Option A. Say the word.

**Assumption A-12:** app-server egress stays small because all user files are served
from R2. Every bandwidth number above depends on this. It is an architectural rule,
not a hope — but it is a rule that is easy to break accidentally with one convenient
`res.sendFile`, so it belongs in code review.

## When this recommendation becomes wrong

| Signal | Change |
|---|---|
| $13/month is genuinely unavailable | Option A. Budget a day, and test a Postgres restore before trusting it |
| Base maps must be rasterised server-side at MVP | Starter's 512 MB is too small — Standard $25, total $38, still inside ceiling |
| You start serving files through the app | Bandwidth and egress assumptions collapse; fix the code, don't buy a bigger plan |
| External customers arrive (Phase 6) | Everything here is re-costed — multi-tenant scale is a different problem, and by then it should be revenue-funded |
| Render changes free Hobby workspace terms | Fly.io at $3.19/mo for an always-on 512 MB machine is the drop-in escape hatch, Docker-native and with no plan fee |


---

## Preview environments — decided 13 Aug 2026

The branching standard raises a fair question: two people solve the same problem two
ways, both PRs land in `dev-mac`, and only the winner merges — so how do you compare
them? Render preview environments would give each PR its own live URL, which is
strictly better than checking two branches out in turn on localhost, especially for
putting two options in front of a salesperson.

**The cost, verified 13 Aug 2026** ([Render docs](https://render.com/docs/preview-environments)):

- Preview environments **require a Pro workspace**. We are on the free Hobby
  workspace, so enabling them takes the monthly floor from **$13 to $38**
- Each preview creates a **full copy of every service and datastore** in the
  Blueprint, billed exactly like production and prorated by the second. Two previews
  open for three days is only about **$2.60** — the recurring $25 workspace jump is
  the real cost, not the previews themselves
- Previews start **empty**: "These instances do not copy any data from existing
  services." Every preview needs the catalogue seeded by an init hook, or it is a
  demo of an app with no items in it
- `expireAfterDays` exists and defaults to **no expiry**

**Decision: keep them in the design, off by default.**

$38/mo is still inside the $40–50 ceiling, so this is affordable — but it should be
triggered by a real need rather than switched on out of tidiness. The trigger is
concrete: **the first time you actually want to show two competing layouts or two
pricing behaviours to a salesperson on live URLs.** Until then, two branches on
localhost is the same comparison for $25 less a month.

When it is turned on, three things are not optional:

1. Set **`expireAfterDays`** — the default of never expiring is how an abandoned PR
   bills for a month
2. Give previews **smaller instances** than production in the Blueprint
3. Add an **init hook that seeds the catalogue**, or every preview is an empty shell

**This decision becomes wrong** the moment two developers are working in parallel
routinely — at that point previews stop being a comparison tool and start being how
you review anything at all, and $25 is cheap against the confusion they prevent.
