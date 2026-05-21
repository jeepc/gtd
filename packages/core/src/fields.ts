import type { ScalarValue, EntryStatus } from './types.js';
import { extractTags } from './tags.js';
import { parseCommand } from './commands.js';

/**
 * Inline `#key:value` field syntax (database design Level 2). Lets the user set
 * structured metadata as fast as a tag, straight from the capture box:
 *
 *   "准备评审 #project:q3 #due:0525 #!!"
 *     → content "准备评审", tags [], fields { project:"q3", due:"2026-05-25", priority:2 }
 *
 * Disambiguation from tags (§2.2): a `#token` WITH a colon is a field; WITHOUT a
 * colon it stays a tag. `#!`/`#!!`/`#!!!` are priority shortcuts. Field tokens
 * are stripped from the displayed content (like the `/done` prefix), so they
 * cannot be re-captured as tags by {@link extractTags}.
 */
export interface InlineParseResult {
  /** Content with field/priority tokens stripped and whitespace normalized. */
  content: string;
  /** Coerced metadata fields to merge into the entry. */
  fields: Record<string, ScalarValue>;
  /** Tags extracted from the stripped content. */
  tags: string[];
}

// `#key:value` — key must start with a letter/underscore so `#1:x` is not a field.
const FIELD_RE = /(^|\s)#([a-zA-Z_][a-zA-Z0-9_]*):([^\s#]+)/g;
// `#!`, `#!!`, `#!!!` — standalone priority shortcuts.
const PRIORITY_RE = /(^|\s)#(!{1,3})(?=\s|$)/g;

/** Coercers by field name; unknown keys fall through to a plain string. */
const COERCERS: Record<string, (raw: string) => ScalarValue | undefined> = {
  due: coerceDue,
  priority: coerceNumber,
};

export function parseInlineFields(raw: string): InlineParseResult {
  const fields: Record<string, ScalarValue> = {};
  let content = raw;

  // Priority shortcuts first (#! / #!! / #!!!).
  content = content.replace(PRIORITY_RE, (_m, pre: string, bangs: string) => {
    fields.priority = bangs.length; // 1 | 2 | 3
    return pre;
  });

  // Then #key:value fields.
  content = content.replace(FIELD_RE, (m, pre: string, key: string, rawVal: string) => {
    const coerced = (COERCERS[key] ?? coerceString)(rawVal);
    if (coerced === undefined) return m; // malformed value → leave token literal
    fields[key] = coerced;
    return pre;
  });

  content = content.replace(/\s{2,}/g, ' ').trim();
  return { content, fields, tags: extractTags(content) };
}

/** What a raw capture string will become, for live input preview. */
export interface CapturePreview {
  status: EntryStatus;
  content: string;
  tags: string[];
  fields: Record<string, ScalarValue>;
}

/**
 * Parse a raw capture-box string exactly as `createEntry` will: strip the slash
 * command, then extract inline fields. The UI uses this to show, in real time,
 * what the entry will become (status / content / tags / due / priority) so the
 * `#due:`/`#!!` syntax is discoverable from the input box.
 */
export function previewCapture(raw: string): CapturePreview {
  const { status, content } = parseCommand(raw);
  const parsed = parseInlineFields(content);
  return { status, content: parsed.content, tags: parsed.tags, fields: parsed.fields };
}

function coerceString(raw: string): ScalarValue {
  return raw;
}

function coerceNumber(raw: string): ScalarValue | undefined {
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `due` coercion. Preserves the date-only vs datetime distinction (length 10 vs
 * with `T`), which the reminder scheduler keys off (date-only → morning).
 *   `0525`                  → `<currentYear>-05-25`        (date-only)
 *   `0525@0900` / `0525T9:00` → `<currentYear>-05-25T09:00`  (compact date+time)
 *   `2026-05-25`            → passthrough (date-only)
 *   `2026-05-25T09:00[:00]` → passthrough (datetime)
 * Compact form uses `@` or `T` to separate the MMDD date from an HHmm/HH:mm time
 * (no roll-to-next-year in v1).
 */
function coerceDue(raw: string): ScalarValue | undefined {
  // Full ISO date or datetime.
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(raw)) return raw;

  // Compact MMDD with an optional `@`/`T` HHmm / HH:mm time.
  const m = raw.match(/^(\d{2})(\d{2})(?:[@T](\d{1,2}):?(\d{2}))?$/);
  if (!m) return undefined;
  const [, mm, dd, hh, min] = m;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = `${new Date().getFullYear()}-${mm}-${dd}`;
  if (hh === undefined) return date; // date-only → morning reminder
  const h = Number(hh);
  const minute = Number(min);
  if (h > 23 || minute > 59) return undefined;
  return `${date}T${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
