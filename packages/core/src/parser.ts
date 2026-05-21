import type { Entry, EntryMetadata, EntryStatus, DayFile } from './types.js';
import { DATA_FORMAT_VERSION } from './types.js';
import { extractTags } from './tags.js';
import { ulid, isUlid } from './ulid.js';

/**
 * Parses a single entry line per §6.2 BNF:
 *   entry ::= prefix WS content (WS tag)* WS id (WS metadata)?
 * Returns null if line is not an entry line (blank, etc.).
 */
export function parseEntryLine(line: string, date: string, fallbackUpdated: string): Entry | null {
  const raw = line.replace(/\r$/, '');
  if (!raw.trim()) return null;

  let m = raw.match(/^- \[( |x|X)\] (.*)$/);
  let status: EntryStatus;
  let body: string;
  if (m) {
    status = m[1] === ' ' ? 'todo' : 'done';
    body = m[2]!;
  } else {
    m = raw.match(/^- (.*)$/);
    if (!m) return null;
    status = 'log';
    body = m[1]!;
  }

  // Extract trailing metadata block: any `<!-- ... -->` at end of line.
  // If contents parse as JSON, use them; otherwise drop the block silently.
  let metadata: EntryMetadata = { updated: fallbackUpdated };
  const metaMatch = body.match(/\s*<!--\s*([\s\S]*?)\s*-->\s*$/);
  if (metaMatch) {
    body = body.slice(0, metaMatch.index).trimEnd();
    try {
      const parsed = JSON.parse(metaMatch[1]!);
      // Accept only a JSON object; arrays/scalars are treated as broken.
      // Lenient by design (§1.5.1): arbitrary keys are preserved verbatim so a
      // rewrite never loses data — validation happens only at the write gate.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = { updated: fallbackUpdated, ...parsed };
      }
    } catch {
      // metadata JSON broken: drop block, keep content + default metadata
    }
  }

  // Extract trailing ID: ^ULID (must be last whitespace-separated token)
  let id: string | null = null;
  const idMatch = body.match(/\s\^([0-9A-HJKMNP-TV-Z]{26})\s*$/);
  if (idMatch) {
    id = idMatch[1]!;
    body = body.slice(0, idMatch.index).trimEnd();
  }

  // Final content (trimmed)
  const content = body.trim();

  // Tags
  const tags = extractTags(content);

  // Backfill ID if missing
  if (!id) id = ulid();

  return {
    id,
    content,
    status,
    tags,
    date,
    metadata,
  };
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

interface ParsedFrontmatter {
  date?: string;
  version?: number;
  updatedAt?: string;
  body: string;
}

function parseFrontmatter(text: string, filenameDate?: string): ParsedFrontmatter {
  const m = text.match(FRONTMATTER_RE);
  if (!m) {
    return { date: filenameDate, body: text };
  }
  const yaml = m[1]!;
  const body = text.slice(m[0].length);
  const out: ParsedFrontmatter = { body };
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1]!;
    let val: string | number = kv[2]!.trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (key === 'version') out.version = Number(val) || DATA_FORMAT_VERSION;
    else if (key === 'date') out.date = String(val);
    else if (key === 'updatedAt') out.updatedAt = String(val);
  }
  return out;
}

const FILENAME_DATE_RE = /(\d{4})-(\d{2})-(\d{2})\.md$/;

export function dateFromFilename(filename: string): string | null {
  const m = filename.match(FILENAME_DATE_RE);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function parseDayFile(text: string, filename?: string): DayFile {
  const fallbackDate = filename ? dateFromFilename(filename) ?? '1970-01-01' : '1970-01-01';
  const fm = parseFrontmatter(text, fallbackDate);
  const date = fm.date ?? fallbackDate;
  const version = fm.version ?? DATA_FORMAT_VERSION;
  const updatedAt = fm.updatedAt ?? new Date(0).toISOString();

  const entries: Entry[] = [];
  for (const line of fm.body.split('\n')) {
    const entry = parseEntryLine(line, date, updatedAt);
    if (entry) entries.push(entry);
  }
  return { date, version, updatedAt, entries };
}

export { isUlid };
