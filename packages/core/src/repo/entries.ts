import type { Storage, SqlParam } from '../storage.js';
import type { Entry, EntryMetadata, EntryStatus } from '../types.js';

/** group_concat separator: unit-separator can't appear in a tag (`[^\s#]+`). */
const SEP = String.fromCharCode(31);

interface EntryRow {
  id: string;
  content: string;
  status: string;
  date: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  log_at: string | null;
  metadata: string;
  tag_list: string | null;
}

const SELECT = `SELECT e.id, e.content, e.status, e.date, e.project_id,
    e.created_at, e.updated_at, e.done_at, e.log_at, e.metadata,
    (SELECT group_concat(tag, char(31)) FROM entry_tags WHERE entry_id = e.id) AS tag_list
  FROM entries e`;

/** Map a DB row back to the domain {@link Entry} (timestamps rehydrate into metadata). */
export function mapRowToEntry(r: EntryRow): Entry {
  let open: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(r.metadata);
    if (parsed && typeof parsed === 'object') open = parsed;
  } catch {
    /* leave empty */
  }
  const metadata = { ...open, updated: r.updated_at } as EntryMetadata;
  if (r.done_at) metadata.done = r.done_at;
  if (r.log_at) metadata.log = r.log_at;
  return {
    id: r.id,
    content: r.content,
    status: r.status as EntryStatus,
    tags: r.tag_list ? r.tag_list.split(SEP) : [],
    date: r.date,
    project_id: r.project_id,
    metadata,
  };
}

export async function getEntry(storage: Storage, id: string): Promise<Entry | null> {
  const rows = await storage.query<EntryRow>(`${SELECT} WHERE e.id = ?`, [id]);
  return rows.length ? mapRowToEntry(rows[0]!) : null;
}

export interface ListEntriesOpts {
  limit?: number;
  /** Inclusive lower-bound date (YYYY-MM-DD) to skip old days. */
  since?: string;
  status?: EntryStatus;
  projectId?: string;
  /** Surface `ongoing` entries first (PRD §4.1: ongoing pinned). */
  pinOngoing?: boolean;
}

export async function listEntries(storage: Storage, opts: ListEntriesOpts = {}): Promise<Entry[]> {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (opts.since) { where.push('e.date >= ?'); params.push(opts.since); }
  if (opts.status) { where.push('e.status = ?'); params.push(opts.status); }
  if (opts.projectId) { where.push('e.project_id = ?'); params.push(opts.projectId); }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const order = opts.pinOngoing
    ? ` ORDER BY (CASE WHEN e.status = 'ongoing' THEN 0 ELSE 1 END), e.updated_at DESC`
    : ` ORDER BY e.updated_at DESC`;
  let limitSql = '';
  if (opts.limit != null) { limitSql = ' LIMIT ?'; params.push(opts.limit); }
  const rows = await storage.query<EntryRow>(`${SELECT}${whereSql}${order}${limitSql}`, params);
  return rows.map(mapRowToEntry);
}

/** Entries carrying `tag` (used for habit matching). */
export async function listEntriesByTag(storage: Storage, tag: string): Promise<Entry[]> {
  const rows = await storage.query<EntryRow>(
    `${SELECT} WHERE e.id IN (SELECT entry_id FROM entry_tags WHERE tag = ?) ORDER BY e.date DESC`,
    [tag],
  );
  return rows.map(mapRowToEntry);
}
