import type { Entry, DayFile, EntryMetadata, ScalarValue } from './types.js';
import { DATA_FORMAT_VERSION } from './types.js';
import { orderedMetaEntries } from './metadata.js';

function prefixFor(status: Entry['status']): string {
  switch (status) {
    case 'todo': return '- [ ]';
    case 'done': return '- [x]';
    case 'log':  return '-';
  }
}

function escapeContent(content: string): string {
  // Per §6.2 edge cases: multi-line content uses literal `\n`.
  return content.replace(/\r?\n/g, '\\n');
}

function serializeMetadata(meta: EntryMetadata): string {
  // Open key-value map: base keys first (fixed order), then user/system keys
  // sorted. Faithfully emits arbitrary keys (incl. legacy data read from disk);
  // never throws. Stable ordering is required for sync equality + Rust parity.
  const entries = orderedMetaEntries(meta);
  if (entries.length === 0) return '';
  const obj: Record<string, ScalarValue> = {};
  for (const [k, v] of entries) obj[k] = v;
  return ` <!-- ${JSON.stringify(obj)} -->`;
}

export function serializeEntry(entry: Entry): string {
  const prefix = prefixFor(entry.status);
  const content = escapeContent(entry.content);
  return `${prefix} ${content} ^${entry.id}${serializeMetadata(entry.metadata)}`;
}

export function serializeDayFile(file: DayFile): string {
  const updatedAt = file.updatedAt || new Date().toISOString();
  const version = file.version || DATA_FORMAT_VERSION;
  const fm = `---\ndate: ${file.date}\nversion: ${version}\nupdatedAt: ${updatedAt}\n---\n\n`;
  const body = file.entries.map(serializeEntry).join('\n');
  return fm + body + (body ? '\n' : '');
}
