import { describe, expect, it } from "vitest";
import { withSchema } from "../src/lib/db-url.js";

describe("withSchema composes DATABASE_URL for the editor's Postgres schema", () => {
  it("appends with ? when the URL has no query string", () => {
    expect(withSchema("postgresql://u:p@host:5432/db", "showplan")).toBe(
      "postgresql://u:p@host:5432/db?schema=showplan",
    );
  });

  it("appends with & when the URL already has a query string", () => {
    expect(withSchema("postgresql://u:p@host:5432/db?connection_limit=5", "showplan")).toBe(
      "postgresql://u:p@host:5432/db?connection_limit=5&schema=showplan",
    );
  });

  it("replaces an existing schema parameter instead of duplicating it", () => {
    expect(withSchema("postgresql://u:p@host:5432/db?schema=public&sslmode=require", "showplan")).toBe(
      "postgresql://u:p@host:5432/db?sslmode=require&schema=showplan",
    );
  });

  it("preserves a #fragment", () => {
    expect(withSchema("postgresql://u:p@host:5432/db?connection_limit=5#frag", "showplan")).toBe(
      "postgresql://u:p@host:5432/db?connection_limit=5&schema=showplan#frag",
    );
  });

  it("returns the URL unchanged when no schema is configured", () => {
    const url = "postgresql://u:p@host:5432/db?connection_limit=5";
    expect(withSchema(url, undefined)).toBe(url);
    expect(withSchema(url, null)).toBe(url);
    expect(withSchema(url, "")).toBe(url);
  });

  it("URL-encodes the schema name", () => {
    expect(withSchema("postgresql://u:p@host:5432/db", "a b")).toBe(
      "postgresql://u:p@host:5432/db?schema=a%20b",
    );
  });
});
