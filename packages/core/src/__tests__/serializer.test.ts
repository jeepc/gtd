import { describe, it, expect } from 'vitest';
import { serializeEntry, serializeDayFile } from '../serializer.js';
import { parseDayFile, parseEntryLine } from '../parser.js';
import type { Entry } from '../types.js';

const ID = '01HXYZABCD1234567890ABCDEF';

function entry(partial: Partial<Entry> = {}): Entry {
  return {
    id: ID,
    content: 'demo',
    status: 'todo',
    tags: [],
    date: '2026-05-18',
    metadata: { updated: '2026-05-18T09:00:00Z' },
    ...partial,
  };
}

describe('serializer round-trip', () => {
  it('todo', () => {
    const line = serializeEntry(entry({ content: '买牛奶 #生活', tags: ['生活'] }));
    expect(line).toContain('- [ ] 买牛奶 #生活');
    expect(line).toContain(`^${ID}`);
    const reparsed = parseEntryLine(line, '2026-05-18', '2026-05-18T00:00:00Z')!;
    expect(reparsed.content).toBe('买牛奶 #生活');
    expect(reparsed.tags).toEqual(['生活']);
  });

  it('done with metadata', () => {
    const e = entry({
      status: 'done',
      content: '跑步',
      metadata: { done: '2026-05-18T08:30:00Z', updated: '2026-05-18T08:30:00Z' },
    });
    const line = serializeEntry(e);
    const reparsed = parseEntryLine(line, '2026-05-18', 'X')!;
    expect(reparsed.status).toBe('done');
    expect(reparsed.metadata.done).toBe('2026-05-18T08:30:00Z');
  });

  it('day file round trip preserves entries', () => {
    const text = `---
date: 2026-05-18
version: 1
updatedAt: 2026-05-18T23:45:12Z
---

- [ ] A #x ^01HXYZABCD1234567890ABCDE1
- 看书 ^01HXYZABCD1234567890ABCDE2 <!-- {"log":"2026-05-18T22:00:00Z","updated":"2026-05-18T22:00:00Z"} -->
`;
    const parsed = parseDayFile(text);
    const reserialized = serializeDayFile(parsed);
    const parsed2 = parseDayFile(reserialized);
    expect(parsed2.entries).toHaveLength(2);
    expect(parsed2.entries[1]!.status).toBe('log');
    expect(parsed2.entries[1]!.metadata.log).toBe('2026-05-18T22:00:00Z');
  });
});
