# AGENTS.md — project-overlord

Permanent rules for every task in this repository. Read this before starting any work.

## Non-negotiables

1. **An LLM never places geometry.** Language, voice and images become typed intents; a deterministic
   engine places elements; a rule engine validates.
2. **One scene record, many views.** 2D, 3D, video, quote and permit PDF are all derived from the same
   versioned scene.
3. **The canonical length unit is the integer TENTH-MILLIMETRE (tmm).** 1 unit = 0.1 mm = 1e-4 m,
   called "tmm". Exact factors: `m = 10000`, `cm = 100`, `mm = 10`, `ft = 3048`, `in = 254`. Areas are
   integer square tenth-millimetres (`tmm2`). Every length and area must be a safe integer, guarded with
   `Number.isSafeInteger`. Display units are presentation only and never enter a calculation.
4. **Site coordinate frame.** Origin at the downstage-centre edge of the main stage; +Y points toward
   the audience; +Z points up; +X is stage right (the performer's right hand when facing the audience).
   Right-handed. The frame is anchored to WGS84 by an anchor (latitude, longitude, ellipsoidal height in
   metres) and a heading, defined as the clockwise angle in degrees from true north to local +Y.
5. **Every value carries provenance:** `STATED`, `ARCHETYPE`, `MEASURED` or `INFERRED`.
6. **Scene versions are immutable.** Every edit creates a new version.
7. **Money is never computed in this repo.** Pricing belongs to QuoteOS through the contract in
   `contracts/quote/v1`. Never store or hardcode a rate.
8. **Packages listed in `scripts/check-zero-deps.mjs` have zero runtime dependencies** and must not
   import from `apps/` or from any package that is not also zero-dep.
9. **Never commit secrets.** No API keys in code, tests, fixtures or reports.

## Working rules

- **Tests first for all logic.** Every exported function in a zero-dep package has tests, including edge
  cases.
- **`make verify` must pass before reporting done.** Never report success with a failing, skipped or
  disabled check.
- **Do not add any dependency the task did not name.** If one seems necessary, stop and say so in the
  report.
- **Do not modify files outside the task's scope.** If you must, list each file and why in the report.
- **Three-strike rule.** If the same check still fails after three fix attempts, stop patching and report
  the failure verbatim with your diagnosis.
- **Commit with clear messages on the task branch.** Always push the task branch to origin
  (github.com/varous/project-overlord, public). Never force-push. Never commit directly to `main`.

## REPORT format

Every task ends by printing a report with exactly these headings, in this order:

```
REPORT — TASK <id>
Repo / Branch / HEAD: <repo url> / <branch> @ <short sha> — Pushed: yes|no
CI: <run URL> — verify: pass|fail, deploy: pass|fail|skipped, snapshots: pass|fail|skipped
Snapshots: https://github.com/varous/project-overlord/tree/snapshots/<branch-slug>/<short-sha> (or "none")
Done: one line per thing built
Files: output of `git diff --stat main...HEAD`
Verify: last 30 lines of `make verify` output, verbatim
Deviations from the task: each with reason, or "none"
Decisions I made that the prompt did not specify: each with reason, or "none"
Problems / failures: verbatim errors and diagnosis, or "none"
Open questions: or "none"
```
