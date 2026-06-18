import type { FileSystem } from './fs.js';
import type { Op, OpKind } from './types.js';
import { ulid } from './ulid.js';
import { SCHEMA_VERSION } from './schema.js';

/**
 * Append-only op log (PRD §6.3). The op log — not `data.db` — is the sync source
 * of truth: every mutation is written as one JSON line under
 * `ops/YYYY/MM/YYYY-MM-DD.jsonl` (keyed by the op's UTC date), then applied to
 * SQLite. Files are append-only and ops are ULID-ordered, so merging across
 * devices is union + sort + dedupe (§6.4).
 */

export const OPS_DIR = 'ops';
const OP_FILE_RE = /^ops\/(\d{4})\/(\d{2})\/\1-\2-\d{2}\.jsonl$/;

export interface CreateOpInput {
  kind: OpKind;
  payload: Record<string, unknown>;
  deviceId: string;
  /** Defaults to {@link SCHEMA_VERSION}. */
  schemaVersion?: number;
  /** Override the op time (tests). ISO 8601; defaults to now. */
  at?: string;
  /** Override the op id (tests); defaults to a fresh ULID. */
  id?: string;
}

/** Build an op, stamping a fresh ULID `id` and `at` time unless overridden. */
export function createOp(input: CreateOpInput): Op {
  return {
    id: input.id ?? ulid(),
    device_id: input.deviceId,
    schema_version: input.schemaVersion ?? SCHEMA_VERSION,
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    payload: input.payload,
  };
}

export function serializeOp(op: Op): string {
  return JSON.stringify(op);
}

/** Parse one jsonl line into an Op, or null if malformed (§10.3 bad-line skip). */
export function parseOpLine(line: string): Op | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const o = JSON.parse(trimmed) as Op;
    if (
      !o ||
      typeof o.id !== 'string' ||
      typeof o.kind !== 'string' ||
      typeof o.at !== 'string' ||
      typeof o.payload !== 'object' ||
      o.payload === null
    ) {
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

/** `ops/YYYY/MM/YYYY-MM-DD.jsonl` for the given op time (ISO 8601). */
export function opLogPath(at: string): string {
  const date = at.slice(0, 10); // ISO 8601 → YYYY-MM-DD
  return `${OPS_DIR}/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.jsonl`;
}

export function isOpLogPath(p: string): boolean {
  return OP_FILE_RE.test(p.replace(/\\/g, '/'));
}

/**
 * Append an op to its day file. `FileSystem` has no native append, so this is
 * read-concat-write; the app is the single writer of `ops/` so there is no race.
 */
export async function appendOp(fs: FileSystem, op: Op): Promise<void> {
  const path = opLogPath(op.at);
  let existing = '';
  if (await fs.exists(path)) {
    existing = await fs.readText(path);
    if (existing && !existing.endsWith('\n')) existing += '\n';
  }
  await fs.writeText(path, existing + serializeOp(op) + '\n');
}

/** All op-log files in the vault, sorted by path. Empty if `ops/` is absent. */
export async function listOpFiles(fs: FileSystem): Promise<string[]> {
  let files: string[];
  try {
    files = await fs.list(OPS_DIR);
  } catch {
    return [];
  }
  return files.map(f => f.replace(/\\/g, '/')).filter(isOpLogPath).sort();
}

export interface OpReadResult {
  ops: Op[];
  errors: { path: string; line: number; raw: string }[];
}

/** Read+parse one op file, skipping malformed lines and recording them. */
export async function readOpsFile(fs: FileSystem, path: string): Promise<OpReadResult> {
  const text = await fs.readText(path);
  const ops: Op[] = [];
  const errors: OpReadResult['errors'] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const op = parseOpLine(line);
    if (op) ops.push(op);
    else errors.push({ path, line: i + 1, raw: line });
  }
  return { ops, errors };
}

/** Read every op in the vault (unsorted across files; caller sorts by id). */
export async function readAllOps(fs: FileSystem): Promise<OpReadResult> {
  const ops: Op[] = [];
  const errors: OpReadResult['errors'] = [];
  for (const path of await listOpFiles(fs)) {
    const r = await readOpsFile(fs, path);
    ops.push(...r.ops);
    errors.push(...r.errors);
  }
  return { ops, errors };
}

/** Stable sort + dedupe a set of ops by ULID id (the canonical apply order). */
export function sortedUniqueById(ops: Op[]): Op[] {
  const byId = new Map<string, Op>();
  for (const op of ops) if (!byId.has(op.id)) byId.set(op.id, op);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
