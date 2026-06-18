import type { Storage, SqlParam } from './storage.js';
import type { FileSystem } from './fs.js';
import type { Op } from './types.js';
import { SCHEMA_VERSION, setSyncMeta, getSyncMeta } from './schema.js';
import { BASE_META_KEYS } from './metadata.js';
import { applyConfigOp } from './config.js';

/**
 * Single-op apply engine (PRD §6.3.3). Applies one op to SQLite under these rules:
 *
 *   - Idempotency: an op already in `applied_ops` is skipped.
 *   - Order: ops are applied in ULID (`id`) order; callers must sort.
 *   - LWW: an `*.update`/`*.set_metadata` whose `at` predates the row's
 *     `updated_at` is dropped (protects against out-of-order incremental apply).
 *   - Tombstone: `*.delete` physically removes the row; a later/late update then
 *     matches no row and is silently ignored (row-absence is the tombstone).
 *   - Unknown fields: keys on an `entry.create` payload outside the known set are
 *     folded into `metadata`.
 *   - Schema upgrade: ops with an older `schema_version` are upgraded first.
 *
 * `config.*` ops mutate `config.json` (not SQLite) and require `ctx.fs`.
 */

export interface ApplyContext {
  storage: Storage;
  /** Required to apply `config.*` ops (they mutate `config.json`). */
  fs?: FileSystem;
}

const BASE_KEY_SET: ReadonlySet<string> = new Set([...BASE_META_KEYS]);
const KNOWN_ENTRY_CREATE = new Set([
  'id', 'content', 'status', 'date', 'project_id', 'tags', 'metadata',
]);

/** Schema-version upgrade layer. v1 is the baseline; no transforms yet. */
function upgradeOp(op: Op): Op {
  if (op.schema_version >= SCHEMA_VERSION) return op;
  // Future migrations transform older payloads here. For now, accept as-is.
  return op;
}

/** Strip managed base keys (timestamps live in columns, not the metadata blob). */
function cleanMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (BASE_KEY_SET.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asTags(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
}

/** Apply one op in its own transaction. Returns true if it changed state. */
export async function applyOp(ctx: ApplyContext, op: Op): Promise<boolean> {
  return ctx.storage.transaction(tx => applyOpInTx(tx, op, ctx.fs));
}

/**
 * Apply one op using a caller-managed transaction `tx`. Used by batch replay
 * (`rebuild`) / sync, which wrap many ops in one transaction with
 * `PRAGMA defer_foreign_keys = ON` so out-of-order siblings (e.g. an entry whose
 * project op shares the same ULID millisecond) only validate FKs at commit.
 */
export async function applyOpInTx(tx: Storage, raw: Op, fs?: FileSystem): Promise<boolean> {
  const op = upgradeOp(raw);
  const seen = await tx.query(`SELECT 1 FROM applied_ops WHERE op_id = ?`, [op.id]);
  if (seen.length) return false; // idempotency

  if (op.kind === 'config.set' || op.kind === 'config.unset') {
    if (!fs) throw new Error(`applyOp: config op ${op.id} requires fs`);
    await applyConfigOp(fs, op);
  } else {
    await dispatch(tx, op);
  }

  await tx.exec(`INSERT INTO applied_ops (op_id, applied_at) VALUES (?, ?)`, [op.id, op.at]);
  const last = await getSyncMeta(tx, 'last_applied_op_id');
  if (last === null || op.id > last) {
    await setSyncMeta(tx, 'last_applied_op_id', op.id);
  }
  return true;
}

async function dispatch(tx: Storage, op: Op): Promise<void> {
  const p = op.payload;
  switch (op.kind) {
    case 'entry.create': return entryCreate(tx, op);
    case 'entry.update': return entryUpdate(tx, op);
    case 'entry.delete': return rowDelete(tx, 'entries', String(p.id));
    case 'entry.set_metadata': return entrySetMetadata(tx, op);
    case 'project.create': return projectCreate(tx, op);
    case 'project.update': return projectUpdate(tx, op);
    case 'project.archive': return projectArchive(tx, op);
    case 'project.unarchive': return projectUnarchive(tx, op);
    case 'project.delete': return rowDelete(tx, 'projects', String(p.id));
    case 'habit.create': return habitCreate(tx, op);
    case 'habit.update': return habitUpdate(tx, op);
    case 'habit.delete': return rowDelete(tx, 'habits', String(p.id));
    default: throw new Error(`applyOp: unknown op kind "${op.kind}"`);
  }
}

// --- shared helpers ------------------------------------------------------

async function rowDelete(tx: Storage, table: string, id: string): Promise<void> {
  // entry_tags/project_tags cascade; entries.project_id is SET NULL by FK.
  await tx.exec(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

async function getUpdatedAt(tx: Storage, table: string, id: string): Promise<string | null> {
  const rows = await tx.query<{ updated_at: string }>(
    `SELECT updated_at FROM ${table} WHERE id = ?`,
    [id],
  );
  return rows.length ? rows[0]!.updated_at : null;
}

async function rewriteTags(
  tx: Storage,
  table: 'entry_tags' | 'project_tags',
  fk: 'entry_id' | 'project_id',
  id: string,
  tags: string[],
): Promise<void> {
  await tx.exec(`DELETE FROM ${table} WHERE ${fk} = ?`, [id]);
  for (const tag of [...new Set(tags)]) {
    await tx.exec(`INSERT OR IGNORE INTO ${table} (${fk}, tag) VALUES (?, ?)`, [id, tag]);
  }
}

function mergeMetadataPatch(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (BASE_KEY_SET.has(k)) continue;
    if (v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

async function readMetadata(tx: Storage, table: string, id: string): Promise<Record<string, unknown>> {
  const rows = await tx.query<{ metadata: string }>(
    `SELECT metadata FROM ${table} WHERE id = ?`,
    [id],
  );
  if (!rows.length) return {};
  try {
    return asObject(JSON.parse(rows[0]!.metadata));
  } catch {
    return {};
  }
}

// --- entries -------------------------------------------------------------

async function entryCreate(tx: Storage, op: Op): Promise<void> {
  const p = op.payload;
  const id = String(p.id);
  const status = String(p.status);
  const metadata = cleanMetadata(asObject(p.metadata));
  // Unknown top-level payload keys fold into metadata (§10.3).
  for (const [k, v] of Object.entries(p)) {
    if (!KNOWN_ENTRY_CREATE.has(k)) metadata[k] = v as unknown;
  }
  const projectId = p.project_id != null ? String(p.project_id) : null;
  const params: SqlParam[] = [
    id,
    String(p.content ?? ''),
    status,
    String(p.date ?? op.at.slice(0, 10)),
    projectId,
    op.at, // created_at
    op.at, // updated_at
    status === 'done' ? op.at : null, // done_at
    status === 'log' ? op.at : null, // log_at
    JSON.stringify(metadata),
  ];
  await tx.exec(
    `INSERT OR IGNORE INTO entries
       (id, content, status, date, project_id, created_at, updated_at, done_at, log_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params,
  );
  await rewriteTags(tx, 'entry_tags', 'entry_id', id, asTags(p.tags));
}

async function entryUpdate(tx: Storage, op: Op): Promise<void> {
  const id = String(op.payload.id);
  const updatedAt = await getUpdatedAt(tx, 'entries', id);
  if (updatedAt === null) return; // tombstone / absent → ignore
  if (op.at < updatedAt) return; // LWW: stale update

  const fields = asObject(op.payload.fields);
  const sets: string[] = [];
  const params: SqlParam[] = [];

  if ('content' in fields) {
    sets.push('content = ?');
    params.push(String(fields.content ?? ''));
  }
  if ('status' in fields) {
    const status = String(fields.status);
    sets.push('status = ?', 'done_at = ?', 'log_at = ?');
    params.push(status, status === 'done' ? op.at : null, status === 'log' ? op.at : null);
  }
  if ('project_id' in fields) {
    sets.push('project_id = ?');
    params.push(fields.project_id != null ? String(fields.project_id) : null);
  }
  if ('metadata' in fields) {
    const next = mergeMetadataPatch(await readMetadata(tx, 'entries', id), asObject(fields.metadata));
    sets.push('metadata = ?');
    params.push(JSON.stringify(next));
  }

  sets.push('updated_at = ?');
  params.push(op.at);
  params.push(id);
  await tx.exec(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`, params);

  if ('tags' in fields) {
    await rewriteTags(tx, 'entry_tags', 'entry_id', id, asTags(fields.tags));
  }
}

async function entrySetMetadata(tx: Storage, op: Op): Promise<void> {
  const id = String(op.payload.id);
  const updatedAt = await getUpdatedAt(tx, 'entries', id);
  if (updatedAt === null) return;
  if (op.at < updatedAt) return;
  const key = String(op.payload.key);
  if (BASE_KEY_SET.has(key)) return; // managed columns
  const meta = await readMetadata(tx, 'entries', id);
  const value = op.payload.value;
  if (value === null || value === undefined) delete meta[key];
  else meta[key] = value as unknown;
  await tx.exec(`UPDATE entries SET metadata = ?, updated_at = ? WHERE id = ?`, [
    JSON.stringify(meta), op.at, id,
  ]);
}

// --- projects ------------------------------------------------------------

async function projectCreate(tx: Storage, op: Op): Promise<void> {
  const p = op.payload;
  const id = String(p.id);
  await tx.exec(
    `INSERT OR IGNORE INTO projects
       (id, name, slug, status, body, created_at, updated_at, archived_at, metadata)
     VALUES (?, ?, ?, 'active', ?, ?, ?, NULL, ?)`,
    [
      id,
      String(p.name ?? ''),
      String(p.slug ?? id),
      String(p.body ?? ''),
      op.at,
      op.at,
      JSON.stringify(cleanMetadata(asObject(p.metadata))),
    ],
  );
  await rewriteTags(tx, 'project_tags', 'project_id', id, asTags(p.tags));
}

async function projectUpdate(tx: Storage, op: Op): Promise<void> {
  const id = String(op.payload.id);
  const updatedAt = await getUpdatedAt(tx, 'projects', id);
  if (updatedAt === null) return;
  if (op.at < updatedAt) return;

  const fields = asObject(op.payload.fields);
  const sets: string[] = [];
  const params: SqlParam[] = [];
  for (const col of ['name', 'slug', 'body'] as const) {
    if (col in fields) {
      sets.push(`${col} = ?`);
      params.push(String(fields[col] ?? ''));
    }
  }
  if ('metadata' in fields) {
    const next = mergeMetadataPatch(await readMetadata(tx, 'projects', id), asObject(fields.metadata));
    sets.push('metadata = ?');
    params.push(JSON.stringify(next));
  }
  sets.push('updated_at = ?');
  params.push(op.at);
  params.push(id);
  await tx.exec(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, params);

  if ('tags' in fields) {
    await rewriteTags(tx, 'project_tags', 'project_id', id, asTags(fields.tags));
  }
}

async function projectArchive(tx: Storage, op: Op): Promise<void> {
  const id = String(op.payload.id);
  const at = op.payload.at != null ? String(op.payload.at) : op.at;
  await tx.exec(
    `UPDATE projects SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`,
    [at, op.at, id],
  );
}

async function projectUnarchive(tx: Storage, op: Op): Promise<void> {
  const id = String(op.payload.id);
  await tx.exec(
    `UPDATE projects SET status = 'active', archived_at = NULL, updated_at = ? WHERE id = ?`,
    [op.at, id],
  );
}

// --- habits --------------------------------------------------------------

async function habitCreate(tx: Storage, op: Op): Promise<void> {
  const p = op.payload;
  const id = String(p.id);
  await tx.exec(
    `INSERT OR IGNORE INTO habits
       (id, name, slug, status, body, schedule, created_at, updated_at, metadata)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      id,
      String(p.name ?? ''),
      String(p.slug ?? id),
      String(p.body ?? ''),
      JSON.stringify(p.schedule ?? {}),
      op.at,
      op.at,
      JSON.stringify(cleanMetadata(asObject(p.metadata))),
    ],
  );
}

async function habitUpdate(tx: Storage, op: Op): Promise<void> {
  const id = String(op.payload.id);
  const updatedAt = await getUpdatedAt(tx, 'habits', id);
  if (updatedAt === null) return;
  if (op.at < updatedAt) return;

  const fields = asObject(op.payload.fields);
  const sets: string[] = [];
  const params: SqlParam[] = [];
  for (const col of ['name', 'slug', 'body', 'status'] as const) {
    if (col in fields) {
      sets.push(`${col} = ?`);
      params.push(String(fields[col] ?? ''));
    }
  }
  if ('schedule' in fields) {
    sets.push('schedule = ?');
    params.push(JSON.stringify(fields.schedule ?? {}));
  }
  if ('metadata' in fields) {
    const next = mergeMetadataPatch(await readMetadata(tx, 'habits', id), asObject(fields.metadata));
    sets.push('metadata = ?');
    params.push(JSON.stringify(next));
  }
  sets.push('updated_at = ?');
  params.push(op.at);
  params.push(id);
  await tx.exec(`UPDATE habits SET ${sets.join(', ')} WHERE id = ?`, params);
}
