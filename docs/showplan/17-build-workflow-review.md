# Project Approach Review: the ShowPlan build workflow

> `/advise-project-approach` · **mid-build course correction**, on the *workflow*
> rather than the code · 13 Aug 2026

## TL;DR

The workflow was sound but rested on **discipline** — an agent had to *remember* to
run `npm run status` and write the journal, and the invariants in `AGENTS.md` were
enforced only by good intentions. That is the one thing to correct, and it is now
corrected: three Claude Code hooks and a CI workflow turn the remembering into
machinery. **Keep everything else.** The three-layer split (Cursor tab-complete /
Claude Code / this strategy session) is right, and the repo-as-shared-brain design
needed no change.

The single most valuable finding: **`Stop` and `SessionEnd` hooks exist and are
committable to the repo**, so the handoff maintains itself.

## Evidence reviewed

- **Commands:** directory checks for `.github/workflows`, `.claude`, `.husky`, `e2e`;
  `package.json` scripts and devDependencies; the check timings in `.agent/STATUS.md`;
  hook scripts executed against synthetic payloads to confirm deny/allow behaviour
- **Files:** `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.mdc`, `.agent/STATUS.md`,
  `.agent/JOURNAL.md`, `scripts/agent-status.mjs`, `package.json`
- **External:** Claude Code hooks reference, GitHub Actions billing docs, Render
  preview-environment docs — all fetched 13 Aug 2026
- **Evidence status:** local repo inspected via the file bridge, plus primary docs.
  Community sources not searched
- **Scope:** the workflow and its tooling. The application code was not re-reviewed

## What is working — keep it

- **The repo is the shared brain.** No MCP, no integration, no polling. Any agent that
  can read the folder is current. This is the right architecture and it survived
  contact with a second agent
- **`AGENTS.md` as the source of truth**, with `CLAUDE.md` and `.cursor/rules/*.mdc`
  derived. The glob-scoped `.mdc` files are a genuine advantage — front-end rules only
  enter context when editing front-end files
- **`.agent/STATUS.md` captures failure output verbatim.** This is the difference
  between a plan and a guess, and it already proved itself: it caught three real bugs
  on its first run, including an ESLint boundary that fired on every test file
- **Tests run against the real 217-item seed**, not fixtures. 66 of them
- **The second agent caught a real inconsistency** — Claude Code correctly reported
  that slice 6c was missing from the phased plan. Two readers of one repo is a working
  error-correction mechanism, not redundancy

## Gap analysis

| Gap | Why it mattered |
|---|---|
| **Discipline, not automation** | Every handoff obligation was "the agent should remember". Agents forget, and so do people at 2am |
| **Invariants unenforced** | `design-system.css is read-only` was a sentence. Nothing stopped an edit |
| **No CI** | Nothing verified a branch before it merged into `dev-mac`, in a model whose whole point is comparing two competing branches |
| **No e2e** | The critical path — upload → calibrate → place → export — has no automated proof, and it is the one path a salesperson actually walks |
| **Seed import unverified in CI** | The bundle gets regenerated from Excel regularly; a malformed re-import would only be discovered by hand |

## Recommended changes

### High priority — done in this pass

1. **Three hooks, committed at `.claude/settings.json`.** `Stop` refreshes
   `STATUS.md` asynchronously and only when a source file actually changed (~35 ms
   no-op otherwise). `SessionEnd` reminds about the journal without blocking.
   `PreToolUse` **denies** edits to the five shared-contract files, each with a
   message naming where the change belongs instead. Verified against synthetic
   payloads: correct denials, clean pass-through.
2. **CI on every PR into `dev-mac` and `main`**, plus the Docker build and a seed
   dry-run. Every step is `if: always()` so one run reports everything wrong rather
   than the first thing wrong. Cost: **free** — 2,000 Linux minutes/month on the
   private-repo Free plan against a ~3-minute suite ([GitHub billing docs](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions),
   13 Aug 2026).

### High priority — for you

3. **`npm install`, then `git init -b main`.** Both must happen in Terminal. The
   bridge cannot unlink git objects, and four of five checks currently report red
   purely because `tsc` is absent.

### Medium priority — next

4. **Playwright on the critical path only.** Upload → calibrate → place → export, as
   one spec. Not a broad suite: the shell is covered by the build, and the domain by
   66 unit tests. The value is that this is the path a salesperson walks on a live
   call, and it is the one nobody will test by hand often enough. Add it when slice 4
   lands and there is something to walk.
5. **Screenshots into the repo.** Have Playwright write to `.agent/screens/`. Then the
   strategy session can *see* the UI through the bridge instead of reasoning about it
   from source — which is how the shell got verified at 1728 and 1366 earlier in this
   project, and it worked.

### Low priority

6. A `PreToolUse` guard on `git push` to `main` directly. The branch model already
   says PRs only; a hook would make it true. Worth doing when a second person joins,
   not before.

## The loop, stated plainly

```
Cursor tab-complete        small edits, reading diffs           you, all day
Claude Code (in Cursor)    build · run tests · fix · re-run     the build engine
  ├── Stop hook            STATUS.md refreshes itself           automatic
  ├── SessionEnd hook      journal reminder                     automatic
  └── PreToolUse guard     shared contracts protected           automatic
CI on PR                   the same checks, plus Docker         automatic
This strategy session      "catch me up" → reads STATUS+JOURNAL+git → plan
```

**Problem solving** splits cleanly. A failing test with a stack trace is Claude Code's
— it has the file, the runner and the loop, and a round-trip through a cloud sandbox
makes that loop worse, not better. A question of *approach* — should this be a rule or
a wall, does this already exist, what does the data say, which of two designs — is
this session's, and the answer lands in `docs/` where both agents read it.

**User testing** is the one loop still missing a mechanism. The plan: Playwright walks
the critical path and writes screenshots into the repo; a real salesperson walks it on
a real laptop at 1366 × 768; what they hit goes into the journal in their words, not
paraphrased. The exit criterion in `09-phased-plan.md` is already the right test —
unaided, on a real call, under fifteen minutes, sent without hand-editing.

## Stack and architecture verdict

**Keep, unchanged.** Nothing in this review touches the application stack. The
workflow architecture — repo as shared state, one source-of-truth context file,
generated status, hand-written journal — is confirmed rather than revised. What
changed is that three obligations moved from human memory into hooks.

## Cost reality

| Item | Cost | Note |
|---|---|---|
| Claude Code hooks | **free** | Local shell scripts |
| GitHub Actions | **free** | 2,000 min/mo private, Free plan; suite ~3 min |
| Playwright | **free** | Adds ~1–2 min to CI when it lands |
| Render preview environments | **$25/mo** | Requires Pro. Decided: off until two branches genuinely need live URLs — `11-deployment-cost-plan.md` |

Running total stays **$13/month**. The automation added here costs nothing.

## When this becomes wrong

- **A second developer joins.** Async hooks and a shared `STATUS.md` assume one writer.
  Two people running `npm run status` against the same file will conflict; at that
  point status belongs in CI output, not a committed file
- **The `Stop` hook gets annoying.** If sessions become long and edit-heavy, a status
  refresh per turn may be too much even async. The `-newer` guard should hold, but if
  it doesn't, move it to `SessionEnd` only
- **You start ingesting client-supplied scanned plans.** Unrelated to workflow, but it
  inverts the §5 conclusion in `15-layout-corpus-study.md`
- **Preview environments become how you review anything**, rather than a comparison
  tool — then $25/mo is cheap against the confusion they prevent

## References

- [Claude Code hooks](https://code.claude.com/docs/en/hooks) — event list, config
  scopes, deny semantics · fetched 13 Aug 2026
- [GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions)
  — 2,000 min/mo private on Free · fetched 13 Aug 2026
- [Render preview environments](https://render.com/docs/preview-environments) — Pro
  required, per-preview billing, `expireAfterDays` · fetched 13 Aug 2026
- Local: `AGENTS.md`, `.agent/STATUS.md`, `scripts/agent-status.mjs`,
  `.claude/settings.json`, `.github/workflows/ci.yml`
