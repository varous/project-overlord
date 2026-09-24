# Working with Cursor and Claude together

> **Date:** 12 Aug 2026. Every claim below was checked against primary docs today;
> this space moves fast, so re-verify before treating it as current in six months.

---

## The short answer

**No, I cannot control Cursor, and there is no MCP for it.** Cursor is an MCP
**client** — it *consumes* MCP servers. It does not expose itself *as* one, so no
outside agent can drive its editor. "Cursor as an MCP server, not client" is still an
open feature request on their own community forum, which is the clearest evidence
that it doesn't exist ([forum.cursor.com](https://forum.cursor.com/t/cursor-as-an-mcp-server-not-client/101324),
observed 12 Aug 2026).

**But controlling the editor is the wrong goal.** What needs to be shared between us
is not a cursor position — it's *the repo*. The repo is the shared brain, and it
already contains everything: 177 files, sixteen documents, `AGENTS.md`, and 66 tests
that encode the rules as executable checks. Any agent that can read the repo has full
knowledge of the project. That is the architecture, and it needs no integration.

---

## Three layers, each doing what it's actually good at

### 1. Cursor's own agent and tab-complete — the fast local loop
Small edits, refactors, reviewing a diff while you read it. This is where Cursor is
unbeatable and where you should live most of the day.

### 2. Claude Code in Cursor's integrated terminal — the build engine
**This is the answer to your real question.** Claude Code runs *inside* Cursor
(`⌘J` → terminal → `claude`), reads `CLAUDE.md` and the whole `docs/` set, and — the
part that matters for bug-fixing — it can **run the tests, read the failure, fix it,
and re-run** without you relaying anything. That closed loop is why bugs get fixed
here rather than in a chat window.

It edits files on disk. Cursor sees the changes instantly. You review them in
Cursor's diff view. No integration required; they're looking at the same files.

### 3. This Cowork session — architecture, research, documents
Strategy, the head-start pipelines, the domain design, the corpus study, decisions
that need writing down. I reach your disk through the device bridge, so I can write
docs and whole subsystems — but **every file round-trips through a cloud sandbox**,
which makes me the wrong tool for a fifteen-second edit-test-fix cycle.

**I should not be your primary bug-fixer, and saying so is more useful than pretending
otherwise.** Claude Code local is strictly better at it: same model, no round-trip,
runs your actual test suite against your actual database. Bring me the decisions, the
research, the "should we even build this", and the things that need to end up in a
document.

---

## Context: one source of truth, two filenames

Cursor and Claude Code read different files. Verified today:

| Tool | Reads |
|---|---|
| **Cursor** | `AGENTS.md`, `.cursor/rules/*.mdc` — **not** `CLAUDE.md` |
| **Claude Code** | `CLAUDE.md` (project, and `~/.claude/CLAUDE.md` global) |
| **Both** | `AGENTS.md` — the emerging cross-tool standard, also read by Codex and Aider |

So the repo now has all three, arranged so they cannot drift:

```
AGENTS.md              ← SOURCE OF TRUTH. Change rules here first.
CLAUDE.md              ← Claude Code view: points at AGENTS.md, adds detail
.cursor/rules/
  00-project.mdc       alwaysApply — the invariants, always in context
  10-frontend.mdc      globs packages/web/**  — tokens, frozen layout, capabilities
  20-domain.mdc        globs packages/domain/** — the pricing engine rules
  30-infra.mdc         globs infra/**, prisma/** — the two traps already paid for
```

The `.mdc` files are **scoped by glob**, which is the real advantage of Cursor's
format: the front-end rules only enter context when you're editing front-end files.
That keeps the always-on rule set small enough to actually be followed.

**Discipline that matters:** when a rule changes, change `AGENTS.md`, then propagate.
A rule that exists in one file and not the other is worse than no rule, because one
agent will "fix" what the other just did.

---

## Can Claude drive Cursor's agent? Technically yes, and mostly don't

Cursor now ships a **CLI** with a genuine headless mode — `cursor-agent -p "find and
fix performance issues"` — explicitly documented for "scripts, CI pipelines, or
automation", with a `--model` flag and a `&` prefix to hand a task to a background
cloud agent ([cursor.com/docs/cli](https://cursor.com/docs/cli/overview), observed
12 Aug 2026).

So Claude Code *can* shell out to Cursor's agent as a subprocess. It works, and it is
almost always the wrong thing to do: you get two agents editing the same files with
no shared plan, and debugging *that* costs more than the work. The one case where it
earns its place is a genuinely parallel mechanical sweep — rename this symbol across
80 files while Claude Code does the interesting part. Keep it in the toolbox and
expect to use it rarely.

---

## The loop that actually works, day to day

1. **Plan in Cursor with Claude Code.** `claude` in the terminal, describe the slice,
   let it read `AGENTS.md` and the phased plan and propose the change.
2. **Let it write and run the tests.** Not you relaying failures — it runs
   `npm test`, reads the output, fixes, re-runs. `packages/domain` has 66 tests
   against the real seed; that suite is the safety net that makes this safe.
3. **Review the diff in Cursor.** This is the step people skip and shouldn't. You are
   the one who knows whether a BOQ line is right.
4. **Commit small.** One slice, one commit. The repo is the handover artefact.
5. **Bring me the decisions.** When something is "which approach", "does this already
   exist", "what does the data say", or "this needs writing down" — that's this
   session, and I'll write it into `docs/` where both agents will read it.

## What to do right now

```bash
cd ~/Documents/DevProjects/ShowPlan
npm install
docker compose -f infra/docker-compose.yml up -d db
npm run prisma:migrate          # first run creates the schema
npm test                        # expect 66 passing
npm run dev                     # api :8080, web :5173 — open http://localhost:5173
```

Then open the folder in Cursor, `⌘J`, run `claude`, and ask it to start slice 1 or
6c. It will read `AGENTS.md` and `docs/09-phased-plan.md` and know what that means.

## One honest caveat

Everything above about Cursor's CLI, its rules filenames, and its MCP direction was
verified on **12 Aug 2026** and all three have changed at least once in the past
year. If something here doesn't match what you see, the docs are right and this file
is stale — and a stale workflow document is worth ten minutes to fix, because both
agents read it.

**Sources:** [Cursor CLI docs](https://cursor.com/docs/cli/overview) ·
[Cursor CLI announcement](https://cursor.com/blog/cli) ·
[Cursor as MCP server — open feature request](https://forum.cursor.com/t/cursor-as-an-mcp-server-not-client/101324) ·
[AGENTS.md vs CLAUDE.md vs .cursorrules](https://agent-ready.dev/agents-md-vs-claude-md-vs-cursorrules)
