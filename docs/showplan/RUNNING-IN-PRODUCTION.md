# Running ShowPlan in production

Render Docker web service. Migrations run from `infra/docker-entrypoint.sh` on
every start. **The catalogue does not.** An empty palette after a clean deploy
is the database with schema and no seed rows.

Live seed (`packages/api/seed`, `seed_v3_2026-08-16`):

| | Count |
|---|---|
| Items | **217** |
| Rates | **1,967** |
| Day curves | **5** (`FULL`, `ONCE`, `VC`, `RENT`, `PWR`) |
| Hand-authored packages | **6** (box office, entry gate, four genset drops) |
| Auto-generated single-item packages | **174** (`AUTO_<code>` for every CANVAS item) |
| Packages total | **180** |

(The BOQ spec still mentions 1,937 rates; the live bundle grew. Trust this table
and the import summary line, not the older figure.)

## Where to run the import

**Render Shell, this first fill.** Paste the command below into the service's
Shell tab after the new image is live. You are sitting there to read the
summary line; a missed unique-constraint error is a salesperson staring at an
empty palette.

**One-Off Job, later VERSION bumps.** Same command. Isolated from the web
process, leaves a run log, does not require a live shell. Use it when the
master sheet changes and a new `VERSION` ships in the image.

**Not a Pre-Deploy Command.** Two reasons, either of which is enough:

1. `preDeployCommand` **does not run on Docker services** on Render. That trap
   is already paid for — migrations live in the entrypoint because of it.
2. Even if it did, a catalogue import is a **data** decision. Idempotent is
   not the same as "run on every deploy": every import restamps `validFrom` on
   the live rate card. Schema migrate on start is required; rewriting the rate
   card on start is not.

Do not add the import to `docker-entrypoint.sh`.

## Command (paste into Render Shell)

Working directory is `/app`. `tsx` is a devDependency and is **not** in the
image. Use the compiled script:

```bash
node packages/api/dist/scripts/import-catalogue.js packages/api/seed
```

Optional check first (writes nothing):

```bash
node packages/api/dist/scripts/import-catalogue.js packages/api/seed --dry-run
```

`npm run import:catalogue` will fail in this container — that script calls `tsx`.

## What success looks like

Stdout ends with:

```
[import] done. 217 items · 1967 rates · 5 curves · 180 packages · version seed_v3_2026-08-16
```

Any `ERROR` line and `ABORTED` means nothing was written. Fix the bundle, do
not retry past errors.

Re-running the same command is safe: items, curves and packages upsert by
primary key; rates for those items are replaced wholesale; a new `VERSION`
label inserts a `CatalogueVersion` row and updates the live card in place.
It will not duplicate rows or fail on unique constraints.

## Verify afterwards

The running API reads the database live — **no restart** for the palette to
fill. Reload the app, open a project, confirm Packages / Items are populated.

On the **next** process start, logs include a catalogue line. Empty is a
warning, not a silent zero:

```
catalogue: { items: 217, rates: 1967, packages: 180 }
```

If you see `catalogue is empty — palette will have nothing to place`, the
import did not run (or did not succeed) against this database.

## Image size

`packages/api/seed` is **332 KB** on disk (JSON + SCHEMA + VERSION). Copying it
into the runtime stage is negligible next to `node_modules` and the web bundle.
The previous image omitted it, so `import-catalogue` shipped without data.
