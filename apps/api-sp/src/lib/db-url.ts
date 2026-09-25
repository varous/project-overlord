/**
 * Compose the runtime DATABASE_URL with a Postgres schema.
 *
 * The editor shares the existing project-overlord database but lives in its own
 * schema (`DB_SCHEMA`). Prisma's `?schema=` parameter must be present for BOTH
 * `prisma migrate deploy` and the running server, or migrations would land in one
 * schema and queries in another. Keeping the composition in one tested function
 * is the only way to guarantee they agree.
 */

/**
 * Return `databaseUrl` with `schema` set as the `schema` query parameter.
 *
 * - Uses `?` when there is no query string, `&` when there is.
 * - Replaces an existing `schema=` parameter rather than duplicating it.
 * - Preserves any `#fragment`.
 * - Returns the URL unchanged when `schema` is empty/undefined (local dev, where
 *   the connection string already is the whole truth).
 */
export function withSchema(
  databaseUrl: string,
  schema: string | null | undefined,
): string {
  if (schema === null || schema === undefined || schema === "") {
    return databaseUrl;
  }

  const hashIndex = databaseUrl.indexOf("#");
  const hash = hashIndex >= 0 ? databaseUrl.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? databaseUrl.slice(0, hashIndex) : databaseUrl;

  const queryIndex = withoutHash.indexOf("?");
  const base = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";

  const params = query.length > 0 ? query.split("&") : [];
  const filtered = params.filter((p) => p.length > 0 && !/^schema=/i.test(p));
  filtered.push(`schema=${encodeURIComponent(schema)}`);

  return `${base}?${filtered.join("&")}${hash}`;
}
