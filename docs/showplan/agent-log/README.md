# `.agent/` — the machine-readable handoff

Two files. Both are committed on purpose.

| File | Written by | Read by |
|---|---|---|
| `STATUS.md` | `npm run status` — **generated, never hand-edit** | any agent, to get current in one read |
| `JOURNAL.md` | Claude Code / you, by hand, newest first | any agent, to learn what already hurt |

## Why this exists

Two agents work on this repo: **Claude Code**, here, with the filesystem and the test
runner; and a **Cowork/strategy session** that owns `docs/`, the research and the
plans, and reaches this machine through a file bridge. The strategy session cannot see
you work — it can only read files. Crawling 183 files to infer what changed is slow and
lossy. Reading these two is instant and complete.

So the contract is: **the repo reports its own state, and the strategy session reads
the report.** No integration, no polling, no MCP.

## Using it

```bash
npm run status              # regenerate STATUS.md
npm run status -- --print   # and print it
```

Then in the strategy session, say **"catch me up"**. It will read `.agent/STATUS.md`,
`.agent/JOURNAL.md` and the git log, and it will be current — including the verbatim
text of anything that is failing, which is the part that makes a real plan possible
instead of a guess.

## What `STATUS.md` captures

- All five checks — domain tests, both typechecks, web build, lint — pass/fail and timing
- **Failure output verbatim.** Never summarised. A paraphrased stack trace cannot be diagnosed
- Git branch, HEAD, last 15 commits, uncommitted changes and diffstat
- File inventory, so a missing package is obvious
- Every `TODO`/`FIXME`/`HACK`/`@ts-ignore` in `packages/`
- The three newest journal entries

## The one rule

Run it **before** asking for a plan, not after. A plan built on a stale status file is
worse than no plan, because it looks informed.
