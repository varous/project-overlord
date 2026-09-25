# Runbook — import the catalogue (rate-free, interim)

The editor needs catalogue items, packages and day curves. That data lives in the **private**
ShowPlan seed, which also contains CLIENT/VENDOR rates. This repo is public, so the bundle is
**never committed** — it is produced on Sourav's machine and imported straight into the database.

This is interim until QuoteOS serves the catalogue (AGENTS.md, "ShowPlan lineage").

## 0. Prerequisites (once per checkout)

```bash
npm ci
npm run build -w @overlord/boq
npx prisma generate --schema apps/api-sp/prisma/schema.prisma
```

## 1. Produce a rate-free bundle

The private seed is `packages/api/seed` inside a clone of `cav-tech-work/showplan`, kept **outside**
this repository. `scripts/make-rate-free-bundle.mjs` reads it and writes a bundle with no rate
values; it refuses to read or write anywhere inside this git working tree.

```bash
# source = the private ShowPlan seed directory (outside this repo)
# out    = a scratch directory (outside this repo, never committed)
node scripts/make-rate-free-bundle.mjs \
  /path/to/showplan-clone/packages/api/seed \
  /path/to/scratch/overlord-catalogue
```

It prints the item/package/package_item counts, the dropped reference-rate codes, and the fuel
consumption values it lifted onto the item rows. It **fails loudly** if a fuel item has no rate row
or if its CLIENT and VENDOR litres/hour disagree.

Confirm the output carries no rates: there must be no `rates.json`, and no `rate`/`price`/`paise`/
`amount` key inside the JSON.

## 2. Migrations

Migrations run automatically when `overlord-editor` starts; run this manually only if the service has never booted.

## 3. Import

Open **project-overlord-db → Connections → External Database URL**. It may already contain a query
string: append `schema=showplan` with **`&`** if it does, or with **`?`** if it does not (and add
`sslmode=require` if it is absent). Always dry-run first — expect **zero errors**; warnings are data
issues to review, not blockers.

```bash
export DATABASE_URL='<external URL>&schema=showplan'
# If the URL had no query string, use ?schema=showplan instead.
npm run import:catalogue -w @overlord/api-sp -- /path/to/scratch/overlord-catalogue --dry-run
```

Then run it for real (drop `--dry-run`):

```bash
npm run import:catalogue -w @overlord/api-sp -- /path/to/scratch/overlord-catalogue
```

Unset the connection string when you are done:

```bash
unset DATABASE_URL
```

## 4. Confirm

```sql
SELECT count(*) FROM showplan."Item";
SELECT count(*) FROM showplan."PackageTemplate";
SELECT count(*) FROM showplan."CatalogueVersion";
SELECT code, "consumptionLitresPerHour" FROM showplan."Item" WHERE "qtyBasis" = 'CONSUMPTION_PER_HOUR';
```

Then open the editor, sign in, and confirm the palette lists packages.

**Never commit the bundle, the seed, or the external connection string.**
