import * as chrono from 'chrono-node';
import type { EntryStatus } from './types.js';
import { parseCommand } from './commands.js';

/**
 * Quick-capture input parsing — database-design v1.1 §4.3 "Level 2".
 *
 * Beyond the MVP rules (`#tag`, leading `/log` `/done`), Level 2 adds exactly
 * two more, both turned into open metadata fields rather than schema:
 *
 *   - `@<time>`   anywhere in the line → `metadata.due` (natural-language time,
 *                parsed offline by chrono-node's Chinese locale)
 *   - trailing `!` / `!!` / `!!!`     → `metadata.priority` = 1 / 2 / 3
 *
 * Pure and side-effect free (chrono is offline); `now` is injectable for tests.
 * Parsing never throws: an unparseable `@<token>` is preserved verbatim as the
 * `due` string (the detail page can fix it), so intent is never lost (§4.3).
 */

export interface CaptureResult {
  status: EntryStatus;
  /** Body with command prefix, `@<time>`, and trailing priority markers removed. */
  content: string;
  /** Fields extracted from the input. Absent keys mean "not specified". */
  metadata: { due?: string; priority?: number };
}

/** Recognize `@` only at a token boundary (line start or after whitespace). */
const AT_RE = /(?:^|\s)@/;
/** Trailing standalone `!`/`!!`/`!!!` — must follow whitespace (or be the whole line). */
const PRIORITY_RE = /(?:^|\s)(!{1,3})\s*$/;

export function parseCapture(raw: string, now: Date = new Date()): CaptureResult {
  const { status, content } = parseCommand(raw);
  const metadata: CaptureResult['metadata'] = {};

  // `due`/`priority` are todo concepts (only todos render a due badge / get
  // scheduled). For /log and /done keep the text verbatim, so AI-written log
  // bodies with a stray `@` or trailing `!` aren't reinterpreted.
  if (status !== 'todo') return { status, content, metadata };

  // 1) @time anywhere in the line. Do this before priority so a line like
  //    "买菜 @明天 !!" still surfaces the trailing "!!" once "@明天" is gone.
  let body = extractDue(content, now, metadata);

  // 2) Trailing priority markers. Only when something remains as content, so a
  //    lone "!!" stays literal text rather than producing an empty entry.
  const pm = PRIORITY_RE.exec(body);
  if (pm && body.slice(0, pm.index).trim()) {
    metadata.priority = pm[1]!.length;
    body = body.slice(0, pm.index);
  }

  return { status, content: collapse(body), metadata };
}

/** Find the first `@<time>`, set `metadata.due`, and return the body without it. */
function extractDue(content: string, now: Date, metadata: CaptureResult['metadata']): string {
  const at = AT_RE.exec(content);
  if (!at) return content;
  // Index of the `@` itself (the match may include a leading space).
  const atIdx = at.index + at[0].length - 1;
  const candidate = content.slice(atIdx + 1);
  if (!candidate) return content;

  // Chinese locale first (covers 明天/周三/明早7点/5月25日/…). Fall back to the
  // default locale for numeric forms the zh parser misses (e.g. `5/25`). Only
  // accept a match that starts right at the `@` (index 0).
  const r =
    chrono.zh.parse(candidate, now, { forwardDate: true }).find(x => x.index === 0) ??
    chrono.parse(candidate, now, { forwardDate: true }).find(x => x.index === 0);
  if (r) {
    metadata.due = formatDue(r, now);
    return content.slice(0, atIdx) + content.slice(atIdx + 1 + r.text.length);
  }

  // chrono couldn't parse: keep the first whitespace-delimited token as a
  // literal due string (intent preserved, no badge until corrected — §4.3).
  const token = /^\S+/.exec(candidate)?.[0];
  if (!token) return content;
  metadata.due = token;
  return content.slice(0, atIdx) + content.slice(atIdx + 1 + token.length);
}

/**
 * Render a chrono result to a `due` value matching the rest of the system:
 * a timed result → full ISO instant (round-trips through `describeDue` /
 * `computeReminderPlan`); a date-only result → `YYYY-MM-DD` (date-only
 * semantics, fires at the morning hour per reminders.ts).
 *
 * A time-only expression (`@7点`, `@9:30` — hour known but no day/weekday/month)
 * is anchored to TODAY at that time, even when it has already passed: chrono's
 * forwardDate would otherwise bump it to tomorrow.
 */
function formatDue(r: chrono.ParsedResult, now: Date): string {
  const cs = r.start;
  const timeOnly =
    cs.isCertain('hour') &&
    !cs.isCertain('day') &&
    !cs.isCertain('weekday') &&
    !cs.isCertain('month');
  if (timeOnly) {
    const d = new Date(now);
    d.setHours(cs.get('hour') ?? 0, cs.get('minute') ?? 0, cs.get('second') ?? 0, 0);
    return d.toISOString();
  }
  const d = r.start.date();
  if (cs.isCertain('hour')) return d.toISOString();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Collapse the whitespace left behind by removed tokens, then trim. */
function collapse(s: string): string {
  return s.replace(/\s{2,}/g, ' ').trim();
}
