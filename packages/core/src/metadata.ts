import type { EntryMetadata, ScalarValue } from './types.js';

/**
 * Helpers for the open metadata key-value model (PRD §6.7).
 *
 * Three layers of strictness, intentionally separated:
 *   - parser   : lenient, never throws (disk is authoritative, §1.5.1)
 *   - serializer: defensive, never throws (must emit even legacy-invalid keys)
 *   - setProperty/updateEntry : strict — the only write gate that validates.
 */

/** Base metadata keys recognized by name. Emitted first, in this fixed order. */
export const BASE_META_KEYS = ['done', 'log', 'updated', 'deleted'] as const;

const BASE_SET: ReadonlySet<string> = new Set(BASE_META_KEYS);

/** §6.7.4 validation bounds. */
const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const MAX_KEY_LEN = 40;
export const MAX_META_BYTES = 1024;

export class MetadataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetadataValidationError';
  }
}

/** System fields are `_`-prefixed: UI-hidden, never sent to AI (§6.7.2). */
export function isSystemKey(key: string): boolean {
  return key.startsWith('_');
}

export function isBaseKey(key: string): boolean {
  return BASE_SET.has(key);
}

export function isValidMetaKey(key: string): boolean {
  return KEY_RE.test(key) && key.length <= MAX_KEY_LEN;
}

export function isScalar(v: unknown): v is ScalarValue {
  return (
    v === null ||
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean'
  );
}

/**
 * Throws {@link MetadataValidationError} if key/value violate §6.7.4. Used at
 * the write gate only. `value === null` is allowed (delete sentinel).
 */
export function assertValidProperty(key: string, value: ScalarValue): void {
  if (!isValidMetaKey(key)) {
    throw new MetadataValidationError(
      `Invalid metadata key "${key}": must match ${KEY_RE} and be ≤${MAX_KEY_LEN} chars`,
    );
  }
  if (!isScalar(value)) {
    throw new MetadataValidationError(`Metadata value for "${key}" must be a scalar`);
  }
}

/**
 * Metadata entries in a deterministic order: base keys first (fixed order),
 * then all remaining keys sorted alphabetically. This ordering is load-bearing
 * for sync equality and TS↔Rust serialization parity — do not change casually.
 */
export function orderedMetaEntries(meta: EntryMetadata): [string, ScalarValue][] {
  const out: [string, ScalarValue][] = [];
  for (const k of BASE_META_KEYS) {
    const v = meta[k];
    if (v !== undefined) out.push([k, v]);
  }
  const rest = Object.keys(meta)
    .filter(k => !BASE_SET.has(k) && meta[k] !== undefined)
    .sort();
  for (const k of rest) out.push([k, meta[k] as ScalarValue]);
  return out;
}

/** Plain object with keys in {@link orderedMetaEntries} order. */
function orderedObject(meta: EntryMetadata, dropSystem = false): Record<string, ScalarValue> {
  const obj: Record<string, ScalarValue> = {};
  for (const [k, v] of orderedMetaEntries(meta)) {
    if (dropSystem && isSystemKey(k)) continue;
    obj[k] = v;
  }
  return obj;
}

/**
 * Deterministic JSON of metadata for equality comparison. `dropSystem` excludes
 * `_`-prefixed keys so that device-local system flags (e.g. `_conflict`) never
 * cause spurious sync conflicts.
 */
export function stableStringify(meta: EntryMetadata, opts: { dropSystem?: boolean } = {}): string {
  return JSON.stringify(orderedObject(meta, opts.dropSystem));
}

/** Byte length of the serialized metadata JSON (for the §6.7.4 1KB limit). */
export function metadataByteLength(meta: EntryMetadata): number {
  return new TextEncoder().encode(stableStringify(meta)).length;
}

/** User fields only: excludes base fields and `_`-prefixed system fields. */
export function userFields(meta: EntryMetadata): Record<string, ScalarValue> {
  const out: Record<string, ScalarValue> = {};
  for (const [k, v] of orderedMetaEntries(meta)) {
    if (BASE_SET.has(k) || isSystemKey(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Metadata with `_`-prefixed system fields stripped, for AI context (§6.7.2 / §8.3). */
export function aiVisibleMetadata(meta: EntryMetadata): EntryMetadata {
  const out: EntryMetadata = { updated: meta.updated };
  for (const [k, v] of orderedMetaEntries(meta)) {
    if (k === 'updated' || isSystemKey(k)) continue;
    out[k] = v;
  }
  return out;
}
