import type { Entry, EntryStatus, Habit, Project } from './types.js';
import type { Storage, SqlParam } from './storage.js';
import { mapRowToEntry } from './repo/entries.js';
import { mapRowToProject } from './repo/projects.js';
import { mapRowToHabit } from './repo/habits.js';

export type SearchEntityType = 'entry' | 'project' | 'habit';

export interface SearchQuery {
  text: string[];
  tags: string[];
  /** Cross-entity status (entry/project/habit values). */
  status?: string;
  priority?: number;         // 1 | 2 | 3 (P1 highest)
  dateExact?: string;        // YYYY-MM or YYYY-MM-DD prefix match
  dateGte?: string;          // YYYY-MM-DD
  dateLte?: string;          // YYYY-MM-DD
  type?: SearchEntityType;   // type:entry|project|habit
  projectSlug?: string;      // project:slug
}

const ENTITY_TYPES = new Set<SearchEntityType>(['entry', 'project', 'habit']);
const ENTRY_STATUSES = new Set(['todo', 'done', 'log', 'ongoing']);
const PROJECT_STATUSES = new Set(['active', 'archived']);
const HABIT_STATUSES = new Set(['active', 'paused', 'archived']);
const ALL_STATUSES = new Set([...ENTRY_STATUSES, ...PROJECT_STATUSES, ...HABIT_STATUSES]);

/**
 * Parse search syntax (§4.4):
 *   `#tag`                 → tag filter (AND'd)
 *   `type:entry|project|habit`
 *   `status:…`             → todo/done/log/ongoing/active/paused/archived
 *   `priority:1|2|3` / `p1` → priority filter (P1 highest)
 *   `project:slug`         → entries linked to a project
 *   `date:2026-05`         → date prefix
 *   `date:>=2026-05-01`    → date gte
 *   `date:<=2026-05-31`    → date lte
 *   anything else          → text term (AND'd, case-insensitive substring)
 */
export function parseSearchQuery(input: string): SearchQuery {
  const q: SearchQuery = { text: [], tags: [] };
  for (const raw of input.trim().split(/\s+/)) {
    if (!raw) continue;
    if (raw.startsWith('#')) {
      const t = raw.slice(1);
      if (t) q.tags.push(t);
      continue;
    }
    if (raw.startsWith('type:')) {
      const v = raw.slice('type:'.length) as SearchEntityType;
      if (ENTITY_TYPES.has(v)) q.type = v;
      continue;
    }
    if (raw.startsWith('project:')) {
      const v = raw.slice('project:'.length);
      if (v) q.projectSlug = v;
      continue;
    }
    if (raw.startsWith('status:')) {
      const v = raw.slice('status:'.length);
      if (ALL_STATUSES.has(v)) q.status = v;
      continue;
    }
    // `priority:2` or the `p2` shorthand (mirrors the `!`/`!!`/`!!!` levels).
    const pm = /^(?:priority:|p)([1-3])$/i.exec(raw);
    if (pm) {
      q.priority = Number(pm[1]);
      continue;
    }
    if (raw.startsWith('date:')) {
      const v = raw.slice('date:'.length);
      if (v.startsWith('>=')) q.dateGte = v.slice(2);
      else if (v.startsWith('<=')) q.dateLte = v.slice(2);
      else q.dateExact = v;
      continue;
    }
    q.text.push(raw.toLowerCase());
  }
  return q;
}

// --- Legacy in-memory matcher (entry-only; kept for the markdown path) ----

export function matchesQuery(entry: Entry, q: SearchQuery): boolean {
  if (entry.metadata.deleted) return false;
  if (q.type && q.type !== 'entry') return false;
  if (q.status && entry.status !== (q.status as EntryStatus)) return false;
  if (q.priority !== undefined && entry.metadata.priority !== q.priority) return false;
  if (q.tags.length && !q.tags.every(t => entry.tags.includes(t))) return false;
  if (q.dateExact && !entry.date.startsWith(q.dateExact)) return false;
  if (q.dateGte && entry.date < q.dateGte) return false;
  if (q.dateLte && entry.date > q.dateLte) return false;
  if (q.text.length) {
    const hay = entry.content.toLowerCase();
    if (!q.text.every(t => hay.includes(t))) return false;
  }
  return true;
}

/** Search a pre-loaded entry list. Returns matches ranked by tag-hit then recency. */
export function searchEntries(entries: Entry[], query: string, limit = 100): Entry[] {
  const q = parseSearchQuery(query);
  const matched = entries.filter(e => matchesQuery(e, q));
  const scored = matched.map(e => {
    const hay = e.content.toLowerCase();
    const hits = q.text.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    return { e, hits };
  });
  scored.sort((a, b) => {
    if (b.hits !== a.hits) return b.hits - a.hits;
    return (b.e.metadata.updated || '').localeCompare(a.e.metadata.updated || '');
  });
  return scored.slice(0, limit).map(s => s.e);
}

// --- SQL cross-entity search (v2.0) --------------------------------------

export type SearchResult =
  | { type: 'entry'; entry: Entry }
  | { type: 'project'; project: Project }
  | { type: 'habit'; habit: Habit };

const ENTRY_SELECT = `SELECT e.id, e.content, e.status, e.date, e.project_id,
    e.created_at, e.updated_at, e.done_at, e.log_at, e.metadata,
    (SELECT group_concat(tag, char(31)) FROM entry_tags WHERE entry_id = e.id) AS tag_list
  FROM entries e`;
const PROJECT_SELECT = `SELECT p.id, p.name, p.slug, p.status, p.body,
    p.created_at, p.updated_at, p.archived_at, p.metadata,
    (SELECT group_concat(tag, char(31)) FROM project_tags WHERE project_id = p.id) AS tag_list
  FROM projects p`;
const HABIT_SELECT = `SELECT id, name, slug, status, body, schedule, created_at, updated_at, metadata FROM habits`;

function statusOk(set: Set<string>, status?: string): boolean {
  return !status || set.has(status);
}

/**
 * Cross-entity SQL search. Filters are AND'd. `date:`/`project:`/`priority:` are
 * entry-only, so projects/habits are excluded when those are present; `#tag`
 * applies to entries and projects but not habits.
 */
export async function searchDb(
  storage: Storage,
  query: string,
  limit = 100,
): Promise<SearchResult[]> {
  const q = parseSearchQuery(query);
  const out: SearchResult[] = [];
  const entryOnlyFilter =
    !!q.dateExact || !!q.dateGte || !!q.dateLte || !!q.projectSlug || q.priority !== undefined;

  const wantEntry = (!q.type || q.type === 'entry') && statusOk(ENTRY_STATUSES, q.status);
  const wantProject =
    (!q.type || q.type === 'project') && statusOk(PROJECT_STATUSES, q.status) && !entryOnlyFilter;
  const wantHabit =
    (!q.type || q.type === 'habit') &&
    statusOk(HABIT_STATUSES, q.status) &&
    !entryOnlyFilter &&
    q.tags.length === 0;

  if (wantEntry) {
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (q.status) { where.push('e.status = ?'); params.push(q.status); }
    for (const tag of q.tags) {
      where.push('e.id IN (SELECT entry_id FROM entry_tags WHERE tag = ?)');
      params.push(tag);
    }
    if (q.dateExact) { where.push('e.date LIKE ?'); params.push(`${q.dateExact}%`); }
    if (q.dateGte) { where.push('e.date >= ?'); params.push(q.dateGte); }
    if (q.dateLte) { where.push('e.date <= ?'); params.push(q.dateLte); }
    if (q.projectSlug) {
      where.push('e.project_id = (SELECT id FROM projects WHERE slug = ?)');
      params.push(q.projectSlug);
    }
    if (q.priority !== undefined) {
      where.push(`json_extract(e.metadata, '$.priority') = ?`);
      params.push(q.priority);
    }
    for (const t of q.text) { where.push('lower(e.content) LIKE ?'); params.push(`%${t}%`); }
    const sql = `${ENTRY_SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''}
      ORDER BY e.updated_at DESC LIMIT ?`;
    params.push(limit);
    for (const r of await storage.query(sql, params)) out.push({ type: 'entry', entry: mapRowToEntry(r as never) });
  }

  if (wantProject) {
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (q.status) { where.push('p.status = ?'); params.push(q.status); }
    for (const tag of q.tags) {
      where.push('p.id IN (SELECT project_id FROM project_tags WHERE tag = ?)');
      params.push(tag);
    }
    for (const t of q.text) {
      where.push('(lower(p.name) LIKE ? OR lower(p.body) LIKE ?)');
      params.push(`%${t}%`, `%${t}%`);
    }
    const sql = `${PROJECT_SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''}
      ORDER BY p.updated_at DESC LIMIT ?`;
    params.push(limit);
    for (const r of await storage.query(sql, params)) out.push({ type: 'project', project: mapRowToProject(r as never) });
  }

  if (wantHabit) {
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (q.status) { where.push('status = ?'); params.push(q.status); }
    for (const t of q.text) {
      where.push('(lower(name) LIKE ? OR lower(body) LIKE ?)');
      params.push(`%${t}%`, `%${t}%`);
    }
    const sql = `${HABIT_SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''}
      ORDER BY updated_at DESC LIMIT ?`;
    params.push(limit);
    for (const r of await storage.query(sql, params)) out.push({ type: 'habit', habit: mapRowToHabit(r as never) });
  }

  return out.slice(0, limit);
}
