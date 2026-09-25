# Runbook — import the catalogue (rate-free, interim)

The editor needs catalogue items, packages and day curves. That data lives in the **private**
ShowPlan seed, which also contains CLIENT/VENDOR rates. This repo is public, so the bundle is
**never committed** — it is produced on Sourav's machine and imported straight into the database.

This is interim until QuoteOS serves the catalogue (AGENTS.md, "ShowPlan lineage").

## 1. Produce a rate-free bundle (on Sourav's machine, with the private seed)

`scripts/make-rate-free-bundle.mjs` reads a ShowPlan-format directory and writes a bundle with no
rate values. It refuses to read or write anywhere inside this git working tree.

```bash
# from a checkout of project-overlord
node scripts/make-rate-free-bundle.mjs \
  ~/private/showplan-seed \        # items.json, packages.json, package_items.json, day_curves.json, rates.json, VERSION
  ~/scratch/overlord-catalogue     # output — outside the repo, never committed
```

It prints items in/out, packages, package_items, the dropped `RATE_PER_LITRE` codes, and the
consumption values lifted onto the items. It **fails loudly** if a `CONSUMPTION_PER_HOUR` item has no
rate row or if its CLIENT and VENDOR litres/hour disagree.

Confirm the output carries no rates — there must be no `rates.json`, and no `rate`/`price`/`paise`/
`amount` key inside the JSON.

## 2. Apply migrations to the `showplan` schema

The editor shares `project-overlord-db`, isolated in the `showplan` Postgres schema. In the Render
dashboard open **project-overlord-db → Connections → External Database URL**, then append
`sslmode=require` and the schema:

```bash
# take the EXTERNAL connection string, then append the two parameters
export DATABASE_URL='postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require&schema=showplan'
npx prisma migrate deploy --schema apps/api-sp/prisma/schema.prisma
```

`?schema=showplan` is required for both the migration and the running server; the composition lives in
`apps/api-sp/src/lib/db-url.ts` and is applied automatically by the container entrypoint when
`DB_SCHEMA=showplan` is set.

## 3. Import the bundle

```bash
DATABASE_URL='postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require&schema=showplan' \
  npm run import:catalogue -w @overlord/api-sp -- ~/scratch/overlord-catalogue
```

The importer validates first and aborts on any error-level finding. It never deletes items — item
codes are foreign keys.

## 4. Confirm

```sql
SELECT count(*) FROM showplan."Item";
SELECT count(*) FROM showplan."PackageTemplate";
SELECT count(*) FROM showplan."CatalogueVersion";
SELECT code, "consumptionLitresPerHour" FROM showplan."Item" WHERE "qtyBasis" = 'CONSUMPTION_PER_HOUR';
```

Then open the editor, sign in, and confirm the palette lists packages.

**Never commit the bundle, the seed, or the external connection string.**
