/**
 * Deterministic JSON and content hashing. No dependencies.
 */

function serialize(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError('canonicalJson: NaN and Infinity are not allowed');
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'bigint':
      throw new TypeError('canonicalJson: bigint is not allowed');
    case 'function':
      throw new TypeError('canonicalJson: functions are not allowed');
    case 'undefined':
      throw new TypeError('canonicalJson: undefined is not allowed');
    case 'symbol':
      throw new TypeError('canonicalJson: symbols are not allowed');
    default:
      break;
  }

  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const entry = record[key];
    if (entry === undefined) {
      throw new TypeError(`canonicalJson: undefined at key "${key}"`);
    }
    parts.push(`${JSON.stringify(key)}:${serialize(entry)}`);
  }
  return `{${parts.join(',')}}`;
}

/** Deterministic JSON: keys sorted at every depth, no whitespace, arrays in order. */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

/** sha256 hex of an arbitrary string. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** sha256 hex of canonicalJson(doc). */
export function contentHash(doc: unknown): Promise<string> {
  return sha256Hex(canonicalJson(doc));
}
