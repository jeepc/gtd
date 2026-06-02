import type { Entry, EntryStatus } from './types.js';

export interface SearchQuery {
  text: string[];
  tags: string[];
  status?: EntryStatus;
  priority?: number;         // 1 | 2 | 3 (P1 highest)
  dateExact?: string;        // YYYY-MM or YYYY-MM-DD prefix match
  dateGte?: string;          // YYYY-MM-DD
  dateLte?: string;          // YYYY-MM-DD
}

const STATUS_VALUES: EntryStatus[] = ['todo', 'done', 'log'];

/**
 * Parse search syntax (§4.4):
 *   `#tag`                 → tag filter
 *   `status:todo|done|log` → status
 *   `priority:1|2|3` / `p1` → priority filter (P1 highest)
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
    if (raw.startsWith('status:')) {
      const v = raw.slice('status:'.length) as EntryStatus;
      if (STATUS_VALUES.includes(v)) q.status = v;
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

export function matchesQuery(entry: Entry, q: SearchQuery): boolean {
  if (entry.metadata.deleted) return false;
  if (q.status && entry.status !== q.status) return false;
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
  // Simple rank: more text hits first, then recency.
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
